import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { findMarkdownFiles } from './recursive-markdown-finder';
import http from 'http';
import { Server } from 'socket.io';
import { ChromaService } from './services/chromaService';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
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

console.log('Socket.IO server initialized with CORS:', {
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true,
  transports: ['polling', 'websocket']
});

// Initialize Chroma service
const chromaService = new ChromaService();

// Configure middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Serve Socket.IO client
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(require.resolve('socket.io-client/dist/socket.io.js'));
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
            links: []
          }
        });
        
        return;
      }
      
      // Generate response using Claude with context including metadata
      const responseData = await chromaService.generateResponse(data.text, relevantDocs);
      
      // Format the response with markdown links if there are any
      let formattedText = responseData.text;
      
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
      
      // Send response back to client
      socket.emit('message', {
        type: 'bot',
        text: formattedText,
        timestamp: Date.now(),
        metadata: {
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
    // console.log('Typing indicator:', data);
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

// Define route handlers separately to work around TypeScript issues
const listMarkdownFiles = async (req: Request, res: Response) => {
  try {
    // Get the base directory for markdown files
    const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
    
    // Find all markdown files recursively
    const mdFiles = await findMarkdownFiles(baseDir);
    
    // Send the result
    res.json({
      files: mdFiles.map(file => ({
        name: file.name,
        path: file.relativePath,
        size: file.size,
        modified: file.modified
      }))
    });
  } catch (err) {
    console.error('Error getting markdown files:', err);
    res.status(500).json({ error: 'Failed to get markdown files' });
  }
};

const getMarkdownFileContent: RequestHandler = async (req, res) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
    const fullPath = path.join(baseDir, filePath);

    if (path.relative(baseDir, fullPath).startsWith('..')) {
      res.status(403).json({ error: 'Access to file is forbidden' });
      return;
    }

    const stats = await fs.stat(fullPath);

    if (!stats.isFile() || !fullPath.endsWith('.md')) {
      res.status(404).json({ error: 'File not found or not a markdown file' });
      return;
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    res.json({
      filename: path.basename(filePath),
      path: filePath,
      content,
      size: stats.size,
      modified: stats.mtime
    });
  } catch (err) {
    console.error('Error reading markdown file:', err);

    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.status(500).json({ error: 'Failed to read markdown file' });
  }
};

// Register routes
app.get('/api/markdown', listMarkdownFiles);
app.get('/api/markdown/file', getMarkdownFileContent);

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server
export function startServer() {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server is running on ws://localhost:${PORT}`);
    console.log(`Socket.IO endpoint: http://localhost:${PORT}/socket.io/`);
  });
}

// If this file is run directly, start the server
if (require.main === module) {
  startServer();
} 