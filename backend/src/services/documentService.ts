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

interface ExtractedUrlData {
  url?: string;
  title?: string;
  download_links?: any[];
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

      // Base metadata
      const metadata: DocumentMetadata = {
        filename,
        path: filePath,
        type: path.extname(filename).toLowerCase().slice(1),
        size: stats.size,
        modified_time: stats.mtime.toISOString(),
        hash
      };

      // Extract URLs and links from JSON files
      if (path.extname(filename).toLowerCase() === '.json') {
        try {
          const jsonContent = await fs.readFile(filePath, 'utf-8');
          const jsonData = JSON.parse(jsonContent);
          
          console.log(`Processing JSON file: ${filename}`);
          
          // Extract URLs and download links
          const extracted = this.extractUrls(jsonData);
          
          if (extracted.url) {
            metadata['url'] = extracted.url;
            console.log(`Added URL to metadata: ${extracted.url}`);
          }
          
          if (extracted.title) {
            metadata['title'] = extracted.title;
            console.log(`Added title to metadata: ${extracted.title}`);
          }
          
          if (extracted.download_links && extracted.download_links.length > 0) {
            const linksJson = JSON.stringify(extracted.download_links);
            metadata['download_links'] = linksJson;
            console.log(`Added ${extracted.download_links.length} download links to metadata`);
            console.log(`Serialized links JSON (first 100 chars): ${linksJson.substring(0, 100)}${linksJson.length > 100 ? '...' : ''}`);
          }
        } catch (error) {
          console.error('Error extracting URLs from JSON:', error);
          // Continue even if URL extraction fails
        }
      }

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
          try {
            const filename = path.basename(filePath);
            const isOutputJsonFile = filename === 'output.json';
            
            // Read file with specific encoding options for output.json
            const jsonContent = await fs.readFile(
              filePath, 
              isOutputJsonFile ? { encoding: 'utf8', flag: 'r' } : 'utf-8'
            );
            
            if (!jsonContent.trim()) {
              throw new Error('JSON file is empty');
            }
            
            let validJsonContent = jsonContent;
            
            // For output.json, add additional cleaning/validation
            if (isOutputJsonFile) {
              console.log('Processing special output.json file');
              // Remove BOM and other potential control characters
              validJsonContent = jsonContent
                .replace(/^\uFEFF/, '') // Remove BOM
                .replace(/[\u0000-\u0019]+/g, " ") // Replace control chars with space
                .trim();
            }
            
            try {
              // Validate that the content is proper JSON
              const jsonData = JSON.parse(validJsonContent);
              
              if (!jsonData || typeof jsonData !== 'object') {
                throw new Error('Invalid JSON structure');
              }
              
              // For output.json, just return the cleaned content
              if (isOutputJsonFile) {
                return validJsonContent;
              }
              
              // Convert JSON to searchable text format
              return this.jsonToText(jsonData);
            } catch (jsonError) {
              console.error('JSON parse error:', jsonError);
              
              // For output.json, return the cleaned content even if parsing failed
              // This allows our more robust parser in ChromaService to handle it
              if (isOutputJsonFile) {
                console.log('Returning cleaned but unparsed content for output.json');
                return validJsonContent;
              }
              
              throw jsonError;
            }
          } catch (error: unknown) {
            console.error('Error processing JSON file:', error);
            if (error instanceof Error) {
              throw new Error(`Failed to process JSON file: ${error.message}`);
            }
            throw new Error('Failed to process JSON file: Unknown error');
          }
          
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

  private extractUrls(json: any): ExtractedUrlData {
    let extracted: ExtractedUrlData = {};
    
    // Handle common JSON structures for scraped data
    if (json.url && typeof json.url === 'string') {
      extracted.url = json.url;
      console.log('Extracted URL from JSON:', json.url);
    }
    
    if (json.title && typeof json.title === 'string') {
      extracted.title = json.title;
      console.log('Extracted title from JSON:', json.title);
    } else if (json.name && typeof json.name === 'string') {
      extracted.title = json.name;
      console.log('Extracted name as title from JSON:', json.name);
    } else if (json.header && typeof json.header === 'string') {
      extracted.title = json.header;
      console.log('Extracted header as title from JSON:', json.header);
    }
    
    // Look for deeply nested properties
    this.findUrlsInObject(json, extracted);
    
    return extracted;
  }
  
  private findUrlsInObject(obj: any, extracted: ExtractedUrlData, path: string = ''): void {
    // Base case: not an object or null
    if (typeof obj !== 'object' || obj === null) {
      return;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.findUrlsInObject(item, extracted, `${path}[${index}]`);
      });
      return;
    }
    
    // Process each property in the object
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if this is a URL property
      if ((key === 'url' || key === 'link' || key.includes('Url') || key.includes('Link')) && 
          typeof value === 'string' && 
          (value.startsWith('http') || value.startsWith('www'))) {
        if (!extracted.url) {
          extracted.url = value;
          console.log(`Found URL at ${currentPath}:`, value);
        }
      }
      
      // Check if this is a download_links property
      if ((key === 'download_links' || key === 'downloads' || key === 'attachments' || 
           key === 'documents' || key === 'files' || key.includes('Download')) && 
          Array.isArray(value)) {
        
        const links = value.map((item: any) => {
          if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('www'))) {
            console.log(`Found direct link in ${currentPath}:`, item);
            return { 
              url: item, 
              text: 'Document', 
              type: item.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'document' 
            };
          } else if (item && typeof item === 'object') {
            const link = {
              url: item.url || item.link || '',
              text: item.text || item.title || item.name || 'Document',
              type: item.type || item.mime_type || 'document'
            };
            if (link.url) {
              console.log(`Found complex link in ${currentPath}:`, link);
              return link;
            }
          }
          return null;
        }).filter(Boolean);
        
        if (links.length > 0) {
          if (!extracted.download_links) {
            extracted.download_links = [];
          }
          extracted.download_links = [...extracted.download_links, ...links];
          console.log(`Added ${links.length} download links from ${currentPath}`);
        }
      }
      
      // Recursively check nested objects
      if (typeof value === 'object' && value !== null) {
        this.findUrlsInObject(value, extracted, currentPath);
      }
    }
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
          
          // Create base metadata
          const metadata: DocumentMetadata = {
            filename: file,
            path: filePath,
            type: path.extname(file).toLowerCase().slice(1),
            size: stats.size,
            modified_time: stats.mtime.toISOString(),
            hash
          };
          
          // Extract URLs and links from JSON files
          if (path.extname(file).toLowerCase() === '.json') {
            try {
              const jsonContent = await fs.readFile(filePath, 'utf-8');
              const jsonData = JSON.parse(jsonContent);
              
              // Extract URLs and download links
              const extracted = this.extractUrls(jsonData);
              
              if (extracted.url) {
                metadata['url'] = extracted.url;
              }
              
              if (extracted.title) {
                metadata['title'] = extracted.title;
              }
              
              if (extracted.download_links && extracted.download_links.length > 0) {
                metadata['download_links'] = JSON.stringify(extracted.download_links);
              }
            } catch (error) {
              console.error('Error extracting URLs from JSON:', error);
              // Continue even if URL extraction fails
            }
          }
          
          return {
            text,
            metadata
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