import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

// Define simple wrapper around the Express app
export function createServer() {
  // Create Express app
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Configure middleware
  app.use(cors());
  app.use(morgan('dev'));
  app.use(express.json());

  // List all markdown files
  app.get('/api/markdown', async (_req, res) => {
    try {
      const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
      
      // Simple markdown finder
      const mdFiles = [];
      
      // Read top-level files only for simplicity
      const files = await fs.readdir(baseDir);
      
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
      
      // Send the result
      res.json({ files: mdFiles });
    } catch (err) {
      console.error('Error getting markdown files:', err);
      res.status(500).json({ error: 'Failed to get markdown files' });
    }
  });

  // Get markdown file content
  app.get('/api/markdown/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }
      
      const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
      const fullPath = path.join(baseDir, filePath);
      
      // Simple security check
      if (path.relative(baseDir, fullPath).startsWith('..')) {
        return res.status(403).json({ error: 'Access to file is forbidden' });
      }
      
      // Read file content
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      
      res.json({
        filename: path.basename(filePath),
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime
      });
    } catch (err) {
      console.error('Error reading markdown file:', err);
      
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.status(500).json({ error: 'Failed to read markdown file' });
    }
  });

  // Start the server
  const start = () => {
    return app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} - API at http://localhost:${PORT}/api/markdown`);
    });
  };

  return { app, start };
} 