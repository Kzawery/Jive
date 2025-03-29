import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Simple recursive function to find markdown files
async function findMarkdownFiles(dir: string): Promise<any[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = path.resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        try {
          return await findMarkdownFiles(res);
        } catch (err) {
          // Handle permissions errors in some directories
          console.error(`Error reading directory ${res}:`, err);
          return [];
        }
      } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
        try {
          const stats = await fs.stat(res);
          return {
            name: dirent.name,
            path: res,
            size: stats.size,
            modified: stats.mtime
          };
        } catch (err) {
          console.error(`Error getting file stats for ${res}:`, err);
          return null;
        }
      }
      return null;
    })
  );
  
  // Flatten the array and filter out nulls
  return files
    .flat()
    .filter(file => file !== null);
}

// List all markdown files
app.use('/api/markdown', async (req, res, next) => {
  if (req.path === '/' && req.method === 'GET') {
    try {
      // Get the base directory for markdown files
      const baseDir = process.env.MARKDOWN_DIR || path.join(process.cwd(), '../');
      
      // Find all markdown files recursively
      const mdFiles = await findMarkdownFiles(baseDir);
      
      // Send the result
      return res.json({
        files: mdFiles.map(file => ({
          name: file.name,
          // Make path relative to base directory
          path: path.relative(baseDir, file.path),
          size: file.size,
          modified: file.modified
        }))
      });
    } catch (err) {
      console.error('Error getting markdown files:', err);
      return res.status(500).json({ error: 'Failed to get markdown files' });
    }
  } else {
    next();
  }
});

// Get content of a specific markdown file
app.use('/api/markdown/file', async (req, res) => {
  if (req.method === 'GET') {
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
      
      return res.json({
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
      
      return res.status(500).json({ error: 'Failed to read markdown file' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});

// Start the server
export function startServer() {
  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} - API at http://localhost:${PORT}/api/markdown`);
  });
} 