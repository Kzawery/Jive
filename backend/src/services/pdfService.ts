import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import path from 'path';

interface TextContent {
  items: Array<{
    str: string;
    transform: number[];
  }>;
}

export class PDFService {
  async readPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer, {
        max: 0, // No limit on pages
        pagerender: function(pageData) {
          return pageData.getTextContent()
            .then(function(textContent: TextContent) {
              let lastY, text = '';
              for (let item of textContent.items) {
                if (lastY != item.transform[5] && text) {
                  text += '\n';
                }
                text += item.str;
                lastY = item.transform[5];
              }
              return text;
            });
        }
      });
      return data.text;
    } catch (error) {
      console.error('Error reading PDF:', error);
      // Return empty string instead of throwing to continue processing other files
      return '';
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
          
          const text = await this.readPDF(filePath);
          const stats = await fs.stat(filePath);
          
          return {
            text,
            metadata: {
              filename: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime,
              type: 'pdf'
            }
          };
        })
      );

      // Filter out documents with empty text
      return documents.filter(doc => doc.text.trim().length > 0);
    } catch (error) {
      console.error('Error processing PDF directory:', error);
      throw error;
    }
  }
} 