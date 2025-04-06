import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ChromaService } from './chromaService';

interface DocumentMetadata {
  [key: string]: string | number | boolean;
  filename: string;
  path: string;
  type: string;
  size: number;
  modified_time: string;  // Store Date as ISO string
  hash: string;
}

interface ProcessedDocument {
  text: string;
  metadata: DocumentMetadata;
}

export class DocumentService {
  private hashDatabase: Map<string, string> = new Map();
  private chromaService: ChromaService;

  constructor() {
    this.chromaService = new ChromaService();
  }

  async isDuplicate(filePath: string): Promise<boolean> {
    try {
      const fileHash = await this.calculateFileHash(filePath);
      
      // Check if hash exists
      if (this.hashDatabase.has(fileHash)) {
        return true;
      }

      // Check content similarity
      const currentContent = await this.readDocument(filePath);
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

  async processDocument(filePath: string, filename: string): Promise<any> {
    try {
      const text = await this.readDocument(filePath);
      const stats = await fs.stat(filePath);
      const hash = await this.calculateFileHash(filePath);

      const metadata: DocumentMetadata = {
        filename,
        path: filePath,
        type: path.extname(filename).toLowerCase().slice(1),
        size: stats.size,
        modified_time: stats.mtime.toISOString(),
        hash
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
      console.error('Error processing document:', error);
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

  private async readDocument(filePath: string): Promise<string> {
    try {
      const extension = path.extname(filePath).toLowerCase();
      
      switch (extension) {
        case '.pdf':
          const dataBuffer = await fs.readFile(filePath);
          const pdfData = await pdfParse(dataBuffer);
          return pdfData.text;
          
        case '.json':
          const jsonContent = await fs.readFile(filePath, 'utf-8');
          const jsonData = JSON.parse(jsonContent);
          // Convert JSON to searchable text format
          return this.jsonToText(jsonData);
          
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      console.error('Error reading document:', error);
      throw error;
    }
  }

  private jsonToText(json: any, prefix: string = ''): string {
    if (typeof json !== 'object' || json === null) {
      return `${prefix}${json}\n`;
    }

    let text = '';
    for (const [key, value] of Object.entries(json)) {
      if (Array.isArray(value)) {
        text += `${prefix}${key}:\n`;
        value.forEach((item, index) => {
          text += this.jsonToText(item, `${prefix}  [${index}] `);
        });
      } else if (typeof value === 'object' && value !== null) {
        text += `${prefix}${key}:\n`;
        text += this.jsonToText(value, `${prefix}  `);
      } else {
        text += `${prefix}${key}: ${value}\n`;
      }
    }
    return text;
  }

  async processDirectory(directoryPath: string): Promise<ProcessedDocument[]> {
    try {
      const absolutePath = path.resolve(directoryPath);
      console.log('Processing directory:', absolutePath);

      try {
        await fs.access(absolutePath);
      } catch (error) {
        throw new Error(`Directory not found: ${absolutePath}`);
      }

      const files = await fs.readdir(absolutePath);
      console.log('Found files:', files);

      const supportedFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.pdf', '.json'].includes(ext);
      });
      console.log('Supported files found:', supportedFiles);

      if (supportedFiles.length === 0) {
        throw new Error('No supported files found in directory');
      }
      
      const documents = await Promise.all(
        supportedFiles.map(async (file) => {
          const filePath = path.join(absolutePath, file);
          console.log('Processing file:', filePath);
          
          const isDuplicate = await this.isDuplicate(filePath);
          if (isDuplicate) {
            console.log('Skipping duplicate file:', file);
            return null;
          }
          
          const text = await this.readDocument(filePath);
          const stats = await fs.stat(filePath);
          const hash = await this.calculateFileHash(filePath);
          
          return {
            text,
            metadata: {
              filename: file,
              path: filePath,
              type: path.extname(file).toLowerCase().slice(1),
              size: stats.size,
              modified_time: stats.mtime.toISOString(),
              hash
            }
          };
        })
      );

      return documents.filter((doc): doc is ProcessedDocument => 
        doc !== null && doc.text.trim().length > 0
      );
    } catch (error) {
      console.error('Error processing directory:', error);
      throw error;
    }
  }
} 