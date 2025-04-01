import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface TextContent {
  items: Array<{
    str: string;
    transform: number[];
  }>;
}

export class PDFService {
  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private async isDuplicate(filePath: string, hash: string): Promise<boolean> {
    try {
      // Check if hash exists in our hash database
      const hashDbPath = path.join(process.cwd(), 'data', 'file_hashes.json');
      let hashDb: Record<string, { hash: string; content: string }> = {};
      
      try {
        const hashDbContent = await fs.readFile(hashDbPath, 'utf-8');
        hashDb = JSON.parse(hashDbContent);
      } catch (error) {
        // If file doesn't exist, create it
        await fs.writeFile(hashDbPath, JSON.stringify({}, null, 2));
      }

      // Read current file content
      const currentContent = await this.readPDF(filePath);

      // Check if hash exists
      if (hashDb[filePath]?.hash === hash) {
        console.log('Exact duplicate found by hash:', filePath);
        return true;
      }

      // Check content similarity with existing files
      for (const [existingPath, existingData] of Object.entries(hashDb)) {
        const similarity = this.calculateSimilarity(currentContent, existingData.content);
        if (similarity > 0.95) { // 95% similarity threshold
          console.log('Similar content found:', filePath, 'similar to', existingPath);
          return true;
        }
      }

      // Add new file to database
      hashDb[filePath] = {
        hash,
        content: currentContent
      };
      await fs.writeFile(hashDbPath, JSON.stringify(hashDb, null, 2));
      
      return false;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return false;
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation based on common words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  async readPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error reading PDF:', error);
      throw error;
    }
  }

  async processPDFDirectory(directoryPath: string): Promise<Array<{ text: string; metadata: any }>> {
    try {
      // Resolve the absolute path
      const absolutePath = path.resolve(directoryPath);
      console.log('Processing directory:', absolutePath);

      // Check if directory exists
      try {
        await fs.access(absolutePath);
      } catch (error) {
        throw new Error(`Directory not found: ${absolutePath}`);
      }

      // Read directory contents
      const files = await fs.readdir(absolutePath);
      console.log('Found files:', files);

      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
      console.log('PDF files found:', pdfFiles);

      if (pdfFiles.length === 0) {
        throw new Error('No PDF files found in directory');
      }
      
      const documents = await Promise.all(
        pdfFiles.map(async (file) => {
          const filePath = path.join(absolutePath, file);
          console.log('Processing file:', filePath);
          
          // Calculate file hash
          const hash = await this.calculateFileHash(filePath);
          
          // Check for duplicates
          const isDuplicate = await this.isDuplicate(filePath, hash);
          if (isDuplicate) {
            console.log('Skipping duplicate file:', file);
            return null;
          }
          
          const text = await this.readPDF(filePath);
          const stats = await fs.stat(filePath);
          
          return {
            text,
            metadata: {
              filename: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime,
              type: 'pdf',
              hash
            }
          };
        })
      );

      // Filter out null values (duplicates) and empty documents
      return documents.filter((doc): doc is { text: string; metadata: any } => 
        doc !== null && doc.text.trim().length > 0
      );
    } catch (error) {
      console.error('Error processing PDF directory:', error);
      throw error;
    }
  }
} 