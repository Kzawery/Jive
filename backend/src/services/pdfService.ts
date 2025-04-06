import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ChromaService } from './chromaService';

interface TextContent {
  text: string;
  metadata: {
    filename: string;
    path: string;
    type: string;
    size: number;
  };
}

export class PDFService {
  private hashDatabase: Map<string, string> = new Map();
  private chromaService: ChromaService;

  constructor() {
    this.chromaService = new ChromaService();
  }

  async isDuplicate(filePath: string, filename: string): Promise<boolean> {
    try {
      const fileHash = await this.calculateFileHash(filePath);
      
      // Check if hash exists
      if (this.hashDatabase.has(fileHash)) {
        return true;
      }

      // Check content similarity
      const currentContent = await this.readPDF(filePath);
      for (const [existingHash, existingContent] of this.hashDatabase.entries()) {
        if (this.calculateSimilarity(currentContent, existingContent) > 0.95) {
          return true;
        }
      }

      // Add to database if not duplicate
      this.hashDatabase.set(fileHash, currentContent);
      return false;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return false;
    }
  }

  async processPDF(filePath: string, filename: string): Promise<any> {
    try {
      const text = await this.readPDF(filePath);
      const metadata = {
        filename,
        path: filePath,
        type: 'pdf',
        size: (await fs.stat(filePath)).size
      };

      // Add to Chroma collection
      const collection = await this.chromaService.getCollection();
      if (!collection) {
        throw new Error('Failed to get collection');
      }

      const result = await collection.add({
        documents: [text],
        metadatas: [metadata],
        ids: [uuidv4()]
      });

      return result;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  private calculateSimilarity(text1: string, text2: string): number {
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
          const isDuplicate = await this.isDuplicate(filePath, file);
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