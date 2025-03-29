const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Create app and server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your domains
    methods: ['GET', 'POST']
  }
});

// Configure middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// WebSocket handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle chat messages
  socket.on('message', async (data) => {
    console.log('Message received:', data);
    
    try {
      // Echo back the message to simulate immediate response
      socket.emit('message', {
        type: 'bot',
        text: `You said: "${data.text}"`,
        timestamp: Date.now()
      });
      
      // Simulate delay for a thoughtful response
      setTimeout(() => {
        socket.emit('message', {
          type: 'bot',
          text: 'This is a simulated response from the AI chatbot. In a real implementation, this would connect to an AI service.',
          timestamp: Date.now()
        });
      }, 2000);
      
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to process your message' });
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    console.log('Typing indicator:', data);
    // If needed, broadcast to others that this user is typing
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// List all markdown files in the root directory
app.get('/api/markdown', async (req, res) => {
  try {
    const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
    const files = await fs.readdir(baseDir);
    
    const mdFiles = [];
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(baseDir, file);
        const stats = await fs.stat(filePath);
        
        mdFiles.push({
          name: file,
          path: file,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
    
    res.json({ files: mdFiles });
  } catch (err) {
    console.error('Error getting markdown files:', err);
    res.status(500).json({ error: 'Failed to get markdown files' });
  }
});

// Get content of a markdown file
app.get('/api/markdown/file', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
    const fullPath = path.join(baseDir, filePath);
    
    // Simple security check to prevent directory traversal
    if (path.relative(baseDir, fullPath).startsWith('..')) {
      return res.status(403).json({ error: 'Access to file is forbidden' });
    }
    
    // Check if file exists and is a markdown file
    const stats = await fs.stat(fullPath);
    
    if (!stats.isFile() || !fullPath.endsWith('.md')) {
      return res.status(404).json({ error: 'File not found or not a markdown file' });
    }
    
    // Read file content
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
    
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.status(500).json({ error: 'Failed to read markdown file' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - API available at http://localhost:${PORT}/api/markdown`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
}); 