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
    const originalFilename = req.file.originalname;
    console.log('Processing file:', filePath);

    // Special handling for output.json file
    const isOutputJson = originalFilename === 'output.json' || path.basename(filePath).includes('output.json');
    if (isOutputJson) {
      console.log('Special handling for output.json file detected');
      
      // Skip duplicate check for output.json as we always want the latest version
      documentService.processDocument(filePath, originalFilename)
        .then(result => {
          console.log('output.json processing result:', result);
          return chromaService.getDocuments()
            .then(updatedDocs => {
              documents = updatedDocs;
              res.json({ 
                message: 'output.json file processed successfully',
                result 
              });
            });
        })
        .catch(error => {
          console.error('Error processing output.json:', error);
          // Don't delete the file even if processing failed
          res.status(500).json({ 
            error: 'Failed to process output.json',
            details: error.message
          });
        });
      return;
    }

    // Regular file processing with duplicate check
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
        return documentService.processDocument(filePath, originalFilename)
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

// Add endpoint to refresh the output.json reference
app.post('/api/refresh-output-json', async (req, res) => {
  try {
    console.log("Refresh output.json endpoint called");
    const success = await chromaService.refreshOutputJsonReference();
    
    if (success) {
      // Update our local documents collection
      const updatedDocs = await chromaService.getDocuments();
      documents = updatedDocs;
      
      res.json({ 
        success: true, 
        message: 'Successfully refreshed output.json reference'
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Failed to refresh output.json - file not found or error occurred'
      });
    }
  } catch (error) {
    console.error('Error refreshing output.json:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh output.json',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
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
      // Log the incoming query for debugging
      console.log(`Processing query: "${data.text}"`);
      
      // Determine if the query is specifically asking for documentation or links
      const isAskingForDocs = /document(ation)?|manual|guide|instruction|pdf|download|links?/i.test(data.text);
      
      // Search for relevant documents
      const relevantDocs = await chromaService.search(data.text);
      
      if (!relevantDocs || relevantDocs.length === 0) {
        console.log('No relevant documents found for query');
        
        // Generate a response even when no documents are found
        const fallbackResponse = await chromaService.generateResponse(data.text, 
          "I don't have specific information about this in my knowledge base. " +
          "Please ask for more details or try a different query.");
        
        socket.emit('message', {
          type: 'bot',
          text: fallbackResponse.text,
          timestamp: Date.now(),
          metadata: {
            chatId: uuidv4(),
            links: []
          }
        });
        
        return;
      }
      
      // Generate response using Claude with context including metadata
      const responseData = await chromaService.generateResponse(data.text, relevantDocs);
      
      // Format the response with markdown links if there are any
      let formattedText = responseData.text;
      
      // Process links to remove similar/duplicate pages
      const processedLinks = responseData.links ? [...responseData.links] : [];
      
      // More aggressive grouping for links with the same base path
      if (processedLinks.length > 0) {
        const urlGroups = new Map<string, Array<typeof responseData.links[0]>>();
        
        // Group by base URL path (excluding query params)
        processedLinks.forEach(link => {
          try {
            // Get base URL without query parameters and trailing slash
            const url = new URL(link.url);
            const baseUrl = (url.origin + url.pathname).replace(/\/$/, '');
            
            if (!urlGroups.has(baseUrl)) {
              urlGroups.set(baseUrl, []);
            }
            urlGroups.get(baseUrl)!.push(link);
          } catch (e) {
            // If URL parsing fails, group by everything before ?
            const fallbackGroup = link.url.split('?')[0].replace(/\/$/, '');
            if (!urlGroups.has(fallbackGroup)) {
              urlGroups.set(fallbackGroup, []);
            }
            urlGroups.get(fallbackGroup)!.push(link);
          }
        });
        
        // For each group, select the best link
        const filteredLinks: Array<typeof responseData.links[0]> = [];
        urlGroups.forEach((links, baseUrl) => {
          if (links.length === 1) {
            // If only one link in the group, keep it
            filteredLinks.push(links[0]);
          } else {
            // If multiple links, prefer PDFs/documents over webpages
            const documentLinks = links.filter((link: {type: string, url: string}) => 
              link.type === 'application/pdf' || 
              link.type === 'document' || 
              link.url.includes('.pdf')
            );
            
            if (documentLinks.length > 0) {
              // Keep the first document link (should already be sorted by relevance)
              filteredLinks.push(documentLinks[0]);
            } else {
              // Otherwise keep the one with shortest URL (no query params)
              links.sort((a: {url: string}, b: {url: string}) => a.url.length - b.url.length);
              filteredLinks.push(links[0]);
            }
          }
        });
        
        // Update the processed links
        console.log(`Reduced ${responseData.links.length} to ${filteredLinks.length} links after grouping similar URLs`);
        responseData.links = filteredLinks;
      }
      
      // Add links section if links are available
      if (responseData.links && responseData.links.length > 0) {
        console.log(`Adding ${responseData.links.length} links to response`);
        
        // If user specifically asked for documentation, put links at the top
        if (isAskingForDocs) {
          const tempText = formattedText;
          formattedText = "**Znalezione dokumenty:**\n\n";
          
          // Group links by type
          const webpageLinks = responseData.links.filter(link => link.type === 'webpage');
          const documentLinks = responseData.links.filter(link => 
            link.type === 'application/pdf' || 
            link.type === 'document' || 
            link.type.includes('pdf')
          );
          
          // Add document links first since they were specifically requested
          if (documentLinks.length > 0) {
            formattedText += "**Dokumenty:**\n";
            documentLinks.forEach(link => {
              formattedText += `- [${link.title}](${link.url})\n`;
            });
            formattedText += "\n";
          }
          
          // Add webpage links
          if (webpageLinks.length > 0) {
            formattedText += "**Strony internetowe:**\n";
            webpageLinks.forEach(link => {
              formattedText += `- [${link.title}](${link.url})\n`;
            });
            formattedText += "\n";
          }
          
          // Add Claude's response after the links
          formattedText += "**Odpowiedź:**\n\n" + tempText;
        } else {
          // Regular query - add links at the bottom
          formattedText += '\n\n**Dostępne źródła:**';
          
          // Group links by type
          const webpageLinks = responseData.links.filter(link => link.type === 'webpage');
          const documentLinks = responseData.links.filter(link => 
            link.type === 'application/pdf' || 
            link.type === 'document' || 
            link.type.includes('pdf')
          );
          
          // Add webpage links
          if (webpageLinks.length > 0) {
            formattedText += '\n\n**Strony internetowe:**';
            webpageLinks.forEach(link => {
              formattedText += `\n- [${link.title}](${link.url})`;
            });
          }
          
          // Add document links
          if (documentLinks.length > 0) {
            formattedText += '\n\n**Dokumenty:**';
            documentLinks.forEach(link => {
              formattedText += `\n- [${link.title}](${link.url})`;
            });
          }
        }
      } else {
        console.log('No links found to add to response');
        
        // Check if query appears to be asking for links or documentation
        if (isAskingForDocs) {
          formattedText += '\n\nNie znaleziono odpowiednich dokumentów dla tego zapytania. Proszę spróbować bardziej szczegółowego zapytania lub skontaktować się z naszym zespołem wsparcia, aby uzyskać pomoc w znalezieniu potrzebnych zasobów.';
        }
      }
      
      // Store the chat with links metadata
      const chat: Chat = {
        id: uuidv4(),
        question: data.text,
        answer: formattedText,
        timestamp: new Date(),
        resolved: false,
        metadata: {
          relevantLinks: responseData.links.map(link => ({
            url: link.url,
            text: link.title,
            type: link.type
          })),
          sourceUrls: responseData.links
            .filter(link => link.type === 'webpage')
            .map(link => link.url)
        }
      };
      
      // Store chat in memory
      chats.set(chat.id, chat);
      
      // Send response back to client
      socket.emit('message', {
        type: 'bot',
        text: formattedText,
        timestamp: Date.now(),
        metadata: {
          chatId: chat.id,
          links: responseData.links
        }
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

// Ensure output.json is available in uploads
async function ensureOutputJsonAvailable() {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      console.log("Ensured uploads directory exists");
    } catch (err) {
      console.error("Error creating uploads directory:", err);
    }

    // Check if output.json exists in uploads
    const files = await fs.promises.readdir(uploadsDir);
    const outputJsonFiles = files.filter(file => file.includes('output.json'));
    
    if (outputJsonFiles.length === 0) {
      console.log("No output.json found in uploads, checking source directories");
      
      // Look for output.json in common source directories
      const potentialSources = [
        path.join(process.cwd(), '../scrapy/roger/output.json'),
        path.join(process.cwd(), '../scrapy/output.json'),
        path.join(process.cwd(), 'output.json')
      ];
      
      let sourcePath = null;
      for (const source of potentialSources) {
        try {
          await fs.promises.access(source);
          sourcePath = source;
          console.log(`Found output.json at: ${source}`);
          break;
        } catch (err) {
          // File doesn't exist, try next path
        }
      }
      
      if (sourcePath) {
        // Copy the file to uploads directory
        const destPath = path.join(uploadsDir, 'output.json');
        await fs.promises.copyFile(sourcePath, destPath);
        console.log(`Copied output.json from ${sourcePath} to ${destPath}`);
        return true;
      } else {
        console.warn("Could not find output.json in any common locations");
        return false;
      }
    } else {
      console.log(`Found existing output.json in uploads: ${outputJsonFiles[0]}`);
      return true;
    }
  } catch (err) {
    console.error("Error ensuring output.json is available:", err);
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`Socket.IO endpoint: http://localhost:${PORT}/socket.io/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Test the server is actually listening
  const address = server.address();
  console.log('Server address:', address);
  
  // Initialize the system - ensure output.json is loaded
  (async () => {
    try {
      console.log("Initializing system - ensuring output.json reference is available");
      
      // Ensure the file exists in uploads
      const fileAvailable = await ensureOutputJsonAvailable();
      
      // Only refresh if the file is available or found
      if (fileAvailable) {
        // Give a moment for the server to fully initialize
        setTimeout(async () => {
          const success = await chromaService.refreshOutputJsonReference();
          if (success) {
            console.log("Successfully initialized output.json reference on startup");
          } else {
            console.warn("Unable to initialize output.json reference on startup");
          }
        }, 2000);
      } else {
        console.warn("Output.json file not found, system will operate without it");
      }
    } catch (error) {
      console.error("Error during system initialization:", error);
    }
  })();
}); 