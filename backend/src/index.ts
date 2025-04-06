import { Server } from 'socket.io';
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { ChromaService } from './services/chromaService';
import { PDFService } from './services/pdfService';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { DocumentService } from './services/documentService';

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
    const allowedMimeTypes = ['application/pdf', 'application/json'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and JSON files are allowed'));
    }
  }
});

// Configure middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['*']
  },
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
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
const documentService = new DocumentService();

// Initialize documents collection
let documents: { documents: string[], ids: string[], metadatas: any[] } = {
  documents: [],
  ids: [],
  metadatas: []
};

// Serve Socket.IO client
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(require.resolve('socket.io-client/dist/socket.io.js'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Types for chat and review system
interface DownloadLink {
  url: string;
  text: string;
  type: string;
}

interface Chat {
  id: string;
  question: string;
  answer: string;
  timestamp: Date;
  resolved: boolean;
  category?: string;
  review?: Review;
  metadata?: {
    relevantLinks: DownloadLink[];
    sourceUrls: string[];
  };
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
    const { text, metadata, embedding } = req.body;;
    if (!text) {
      res.status(400).json({ error: 'Text content is required' });
      return;
    }

    await chromaService.addDocument(text, metadata, embedding);
    res.json({ message: 'Document added successfully' });
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({ error: 'Failed to add document' });
  }
};

app.post('/api/knowledge', addKnowledgeHandler);

// Get all documents
app.get('/api/documents', (async (req: Request, res: Response) => {
  try {
    // Get documents from Chroma
    const result = await chromaService.getDocuments();
    
    // Update our local documents collection
    documents = result;

    res.json({ documents });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
}) as RequestHandler);

// Upload document (PDF or JSON)
app.post('/api/documents/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: 'File too large',
          details: 'The uploaded file exceeds the size limit'
        });
      }
      if (err.message === 'Unexpected field') {
        return res.status(400).json({ 
          error: 'Invalid field name',
          details: 'The form field name must be "file"'
        });
      }
      return res.status(400).json({ 
        error: err.message,
        details: 'Error uploading file'
      });
    } else if (err) {
      if (err.message === 'Only PDF and JSON files are allowed') {
        return res.status(415).json({ 
          error: 'Unsupported file type',
          details: 'Only PDF and JSON files are allowed'
        });
      }
      return res.status(500).json({ 
        error: 'Internal server error',
        details: err.message
      });
    }

    // No file uploaded
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please select a file to upload'
      });
    }

    // Process the uploaded file
    const filePath = req.file.path;
    console.log('Processing file:', filePath);

    documentService.isDuplicate(filePath)
      .then(isDuplicate => {
        if (isDuplicate) {
          // Clean up the duplicate file
          return fs.promises.unlink(filePath)
            .then(() => {
              res.status(409).json({ 
                error: 'Duplicate file',
                details: 'This file has already been uploaded'
              });
            });
        }

        // Process the document
        return documentService.processDocument(filePath, req.file!.originalname)
          .then(result => {
            console.log('Document processing result:', result);
            return chromaService.getDocuments()
              .then(updatedDocs => {
                documents = updatedDocs;
                res.json({ 
                  message: 'File processed successfully',
                  result 
                });
              });
          });
      })
      .catch(error => {
        console.error('Error processing document:', error);
        // Clean up the file if processing failed
        fs.promises.unlink(filePath).catch(console.error);
        res.status(500).json({ 
          error: 'Failed to process document',
          details: error.message
        });
      });
  });
});

// Delete document
app.delete('/api/documents/:id', (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collection = await chromaService.getCollection();
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    await collection.delete({ ids: [id] });

    // Update our local documents collection
    documents = {
      documents: documents.documents.filter((_, index) => documents.ids[index] !== id),
      ids: documents.ids.filter(docId => docId !== id),
      metadatas: documents.metadatas.filter((_, index) => documents.ids[index] !== id)
    };

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}) as RequestHandler);

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
      
      if (!relevantDocs || relevantDocs.length === 0) {
        throw new Error('No relevant documents found');
      }
      
      // Combine relevant documents into context and collect links
      const context = relevantDocs.map(doc => {
        const metadata = doc.metadata || {};
        const links = metadata.download_links || [];
        const url = metadata.url || '';
        return {
          content: doc.pageContent,
          links: links.map((link: DownloadLink) => ({
            url: link.url,
            text: link.text,
            type: link.type
          })),
          sourceUrl: url
        };
      });

      // Generate response using Claude with context
      const response = await chromaService.generateResponse(data.text, context.map(c => c.content).join("\n"));
      
      // Format response to include links
      const formattedResponse = context.flatMap(c => c.links).length > 0 
        ? `${response}\n\nDostępne dokumenty:\n${context.flatMap(c => c.links)
            .filter(link => link.type === 'application/pdf' || link.type === 'application/json')
            .map(link => `- [${link.text}](${link.url})`)
            .join('\n')}`
        : response;
      
      // Store the chat with links
      const chat: Chat = {
        id: uuidv4(),
        question: data.text,
        answer: formattedResponse,
        timestamp: new Date(),
        resolved: false,
        metadata: {
          relevantLinks: context.flatMap(c => c.links)
            .filter(link => link.type === 'application/pdf' || link.type === 'application/json'),
          sourceUrls: context.map(c => c.sourceUrl)
        }
      };
      chats.set(chat.id, chat);
      
      // Send response back to client with links
      socket.emit('message', {
        type: 'bot',
        text: formattedResponse,
        timestamp: Date.now(),
        chatId: chat.id,
        links: context.flatMap(c => c.links)
          .filter(link => link.type === 'application/pdf' || link.type === 'application/json'),
        sourceUrls: context.map(c => c.sourceUrl)
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

// Add error handling for server startup
server.on('error', (error) => {
  console.error('Server error:', error);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`Socket.IO endpoint: http://localhost:${PORT}/socket.io/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Test the server is actually listening
  const address = server.address();
  console.log('Server address:', address);
}); 