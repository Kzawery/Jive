import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { findMarkdownFiles } from './recursive-markdown-finder';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

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

const getMarkdownFileContent = async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
    const fullPath = path.join(baseDir, filePath);
    
    // Make sure the file is within the allowed directory (prevent directory traversal)
    const normalizedBasePath = path.normalize(baseDir);
    const normalizedRequestedPath = path.normalize(fullPath);
    
    if (!normalizedRequestedPath.startsWith(normalizedBasePath)) {
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
    
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.status(500).json({ error: 'Failed to read markdown file' });
  }
};

// Register routes
app.get('/api/markdown', listMarkdownFiles);
app.get('/api/markdown/file', getMarkdownFileContent);

// Start the server
export function startServer() {
  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// If this file is run directly, start the server
if (require.main === module) {
  startServer();
} 