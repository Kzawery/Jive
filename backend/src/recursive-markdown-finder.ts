import fs from 'fs/promises';
import path from 'path';

interface MarkdownFile {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: Date;
}

/**
 * Recursively finds all markdown files in a directory
 * 
 * @param baseDir The base directory to start searching from
 * @param relativePath The relative path from the base directory (used for recursion)
 * @returns Promise with an array of markdown file information
 */
export async function findMarkdownFiles(
  baseDir: string, 
  relativePath: string = ''
): Promise<MarkdownFile[]> {
  const currentDir = path.join(baseDir, relativePath);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  
  const markdownFiles: MarkdownFile[] = [];
  
  for (const entry of entries) {
    const entryRelativePath = path.join(relativePath, entry.name);
    const fullPath = path.join(baseDir, entryRelativePath);
    
    if (entry.isDirectory()) {
      // Recursively search in subdirectories
      const nestedFiles = await findMarkdownFiles(baseDir, entryRelativePath);
      markdownFiles.push(...nestedFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // It's a markdown file, add it to the results
      const stats = await fs.stat(fullPath);
      markdownFiles.push({
        name: entry.name,
        path: fullPath,
        relativePath: entryRelativePath,
        size: stats.size,
        modified: stats.mtime
      });
    }
  }
  
  return markdownFiles;
} 