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
import { v4 as uuidv4 } from 'uuid';

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
    credentials: true,
    allowedHeaders: ['*']
  },
  path: '/socket.io/',
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  allowUpgrades: true,
  cookie: false
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

// Types for chat and review system
interface Chat {
  id: string;
  question: string;
  answer: string;
  timestamp: Date;
  resolved: boolean;
  category?: string;
  review?: Review;
}

interface Review {
  id: string;
  chatId: string;
  resolved: boolean;
  comments: Comment[];
  timestamp: Date;
}

interface Comment {
  id: string;
  reviewerId: string;
  text: string;
  timestamp: Date;
}

interface ChatRequest extends Request {
  params: {
    chatId: string;
  };
}

interface ReviewRequest extends Request {
  params: {
    reviewId: string;
  };
}

// In-memory storage (replace with database in production)
const chats: Map<string, Chat> = new Map();
const reviews: Map<string, Review> = new Map();

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

// Chat storage endpoint
app.post('/api/chats', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const chat: Chat = {
      id: uuidv4(),
      question,
      answer,
      timestamp: new Date(),
      resolved: false
    };
    
    chats.set(chat.id, chat);
    res.status(201).json(chat);
  } catch (error) {
    console.error('Error storing chat:', error);
    res.status(500).json({ error: 'Failed to store chat' });
  }
});

// Get all chats
app.get('/api/chats', (req, res) => {
  try {
    const chatList = Array.from(chats.values());
    res.json(chatList);
  } catch (error) {
    console.error('Error retrieving chats:', error);
    res.status(500).json({ error: 'Failed to retrieve chats' });
  }
});

// Create review for a chat
app.post('/api/chats/:chatId/reviews', (async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params as { chatId: string };
    const { resolved, comments } = req.body;
    
    const chat = chats.get(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const review: Review = {
      id: uuidv4(),
      chatId,
      resolved,
      comments: comments.map((comment: { reviewerId: string; text: string }) => ({
        id: uuidv4(),
        reviewerId: comment.reviewerId,
        text: comment.text,
        timestamp: new Date()
      })),
      timestamp: new Date()
    };
    
    reviews.set(review.id, review);
    chat.review = review;
    chat.resolved = resolved;
    
    res.status(201).json(review);
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
}) as RequestHandler);

// Add comment to a review
app.post('/api/reviews/:reviewId/comments', (async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params as { reviewId: string };
    const { reviewerId, text } = req.body;
    
    const review = reviews.get(reviewId);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    const comment: Comment = {
      id: uuidv4(),
      reviewerId,
      text,
      timestamp: new Date()
    };
    
    review.comments.push(comment);
    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}) as RequestHandler);

// Update chat category
app.patch('/api/chats/:chatId/category', (async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params as { chatId: string };
    const { category } = req.body;
    
    const chat = chats.get(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    chat.category = category;
    res.json(chat);
  } catch (error) {
    console.error('Error updating chat category:', error);
    res.status(500).json({ error: 'Failed to update chat category' });
  }
}) as RequestHandler);

// Get chats by category
app.get('/api/chats/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const chatList = Array.from(chats.values())
      .filter(chat => chat.category === category);
    res.json(chatList);
  } catch (error) {
    console.error('Error retrieving chats by category:', error);
    res.status(500).json({ error: 'Failed to retrieve chats by category' });
  }
});

// Add CORS headers for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
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
      
      // Store the chat
      const chat: Chat = {
        id: uuidv4(),
        question: data.text,
        answer: typeof response === 'string' ? response : JSON.stringify(response),
        timestamp: new Date(),
        resolved: false
      };
      chats.set(chat.id, chat);
      
      // Send response back to client
      socket.emit('message', {
        type: 'bot',
        text: typeof response === 'string' ? response : JSON.stringify(response),
        timestamp: Date.now(),
        chatId: chat.id
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