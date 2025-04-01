import { Server } from 'socket.io';
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { ChromaService } from './chroma/chromaService';
import { PDFService } from './services/pdfService';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io/',
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  allowUpgrades: true
});

// Initialize services
const chromaService = new ChromaService();
const pdfService = new PDFService();

// Configure middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Serve Socket.IO client
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(require.resolve('socket.io-client/dist/socket.io.js'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Add document to knowledgebase
const addKnowledgeHandler: RequestHandler = async (req, res) => {
  try {
    const { text, metadata } = req.body;
    
    if (!text) {
      res.status(400).json({ error: 'Text content is required' });
      return;
    }

    await chromaService.addDocument(text, metadata);
    res.json({ message: 'Document added successfully' });
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({ error: 'Failed to add document' });
  }
};

app.post('/api/knowledge', addKnowledgeHandler);

// Upload and process PDF
const uploadPDFHandler: RequestHandler = async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No PDF file uploaded' });
      return;
    }

    const text = await pdfService.readPDF(req.file.path);
    await chromaService.addDocument(text, {
      filename: req.file.originalname,
      path: req.file.path,
      type: 'pdf',
      size: req.file.size
    });

    res.json({ message: 'PDF processed and added to knowledge base' });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
};

app.post('/api/pdf/upload', upload.single('pdf'), uploadPDFHandler);

// Process PDF directory
const processDirectoryHandler: RequestHandler = async (req, res) => {
  try {
    const { directoryPath } = req.body;
    
    if (!directoryPath) {
      res.status(400).json({ error: 'Directory path is required' });
      return;
    }

    const documents = await pdfService.processPDFDirectory(directoryPath);
    
    for (const doc of documents) {
      await chromaService.addDocument(doc.text, doc.metadata);
    }

    res.json({ 
      message: 'PDFs processed and added to knowledge base',
      count: documents.length
    });
  } catch (error) {
    console.error('Error processing PDF directory:', error);
    res.status(500).json({ error: 'Failed to process PDF directory' });
  }
};

app.post('/api/pdf/directory', processDirectoryHandler);

// List all documents in Chroma
app.get('/api/documents', async (req, res) => {
  try {
    const documents = await chromaService.listDocuments();
    res.json({ documents });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await chromaService.deleteDocument(id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});
// Search documents
app.post('/api/documents/search', async (req, res) => {
  try {
    const { query, limit = 3 } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const results = await chromaService.search(query, limit);
    res.json({ results });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  console.log('Transport:', socket.conn.transport.name);

  // Handle chat messages
  socket.on('message', async (data) => {
    console.log('Message received:', data);

    try {
      // Search for relevant documents
      const relevantDocs = await chromaService.search(data.text);
      
      if (!relevantDocs) {
        throw new Error('No relevant documents found');
      }
      
      // Combine relevant documents into context
      const context = relevantDocs.map(doc => doc.pageContent).join("\n");
      
      // Generate response using Claude
      const response = await chromaService.generateResponse(data.text, context);
      
      // Send response back to client
      socket.emit('message', {
        type: 'bot',
        text: response,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to process your message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    console.log('Typing indicator:', data);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`Socket.IO endpoint: http://localhost:${PORT}/socket.io/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
}); 