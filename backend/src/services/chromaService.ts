import { ChromaClient, Collection, QueryResponse } from 'chromadb';
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";
import { ChatAnthropic } from "@langchain/anthropic";
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs/promises';

export class ChromaService {
  private client: ChromaClient;
  private _embeddings: VoyageEmbeddings;
  private vectorStore: Chroma | null = null;
  private llm: ChatAnthropic;
  private collection: Collection | null = null;

  constructor() {
    // Initialize Chroma client with persistence
    this.client = new ChromaClient({
      path: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
    });
    
    // Initialize Voyage embeddings
    this._embeddings = new VoyageEmbeddings({
      apiKey: process.env.VOYAGE_API_KEY,
      modelName: "voyage-2"
    });

    // Initialize Claude LLM
    this.llm = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: "claude-3-7-sonnet-20250219",
      temperature: 0.7
    });
  }

  get embeddings(): VoyageEmbeddings {
    return this._embeddings;
  }

  async initialize() {
    // Initialize vector store with persistence
    this.vectorStore = await Chroma.fromTexts(
      [], // Initial empty texts
      [], // Initial empty metadata
      this._embeddings,
      {
        collectionName: "chatbot_knowledge",
        url: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
      }
    );

    // Initialize collection
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: 'documents'
      });
    } catch (error) {
      console.error('Error getting collection:', error);
    }
  }

  public async getCollection(): Promise<Collection | null> {
    if (!this.collection) {
      await this.initialize();
    }
    return this.collection;
  }

  async addDocument(text: string, metadata: any = {}, embedding?: number[]) {
    if (!this.vectorStore) await this.initialize();
    
    // Add to vector store
    await this.vectorStore?.addDocuments([
      new Document({
        pageContent: text,
        metadata
      })
    ]);

    // Add to collection if embedding is provided
    if (embedding) {
      const collection = await this.getCollection();
      if (collection) {
        await collection.add({
          documents: [text],
          metadatas: [metadata],
          embeddings: [embedding],
          ids: [crypto.randomUUID()]
        });
      }
    }
  }

  async search(query: string, k: number = 3) {
    if (!this.vectorStore) await this.initialize();
    
    // Get the regular search results
    const results = await this.vectorStore?.similaritySearch(query, k);
    
    // Check if the results array exists
    if (!results) {
      console.log(`No results found for query: "${query}"`);
      return results;
    }
    
    // Get the collection to retrieve the output.json file directly
    const collection = await this.getCollection();
    if (collection) {
      try {
        // Search specifically for the reference output.json file that contains all URLs
        const referenceFileResults = await collection.get({
          where: { filename: "output.json" },
          limit: 1
        });
        
        // If the reference file was found and not already in results
        if (referenceFileResults && 
            referenceFileResults.ids && 
            referenceFileResults.ids.length > 0 && 
            referenceFileResults.documents && 
            referenceFileResults.documents.length > 0 &&
            referenceFileResults.metadatas && 
            referenceFileResults.metadatas.length > 0) {
          
          console.log("Found reference output.json file with URLs");
          
          // Check if this file is already in the results
          const isReferenceFileInResults = results.some(doc => 
            doc.metadata && 
            (doc.metadata.filename === "output.json" || 
             (doc.metadata.path && doc.metadata.path.includes("output.json")))
          );
          
          // Only add if not already in results
          if (!isReferenceFileInResults) {
            // Create a document object from the reference file
            const referenceDoc = new Document({
              pageContent: referenceFileResults.documents[0] || "",
              metadata: referenceFileResults.metadatas[0] || {}
            });
            
            // Add to results array
            results.push(referenceDoc);
            
            console.log("Added reference output.json file to search results");
          } else {
            console.log("Reference output.json file already in search results");
          }
        } else {
          console.log("Reference output.json file not found in the collection");
        }
      } catch (error) {
        console.error("Error retrieving reference output.json file:", error);
      }
    }
    
    // Log details about the search results for debugging
    console.log(`\n=== Search Results for "${query}" ===`);
    if (results && results.length > 0) {
      results.forEach((doc, i) => {
        console.log(`Result ${i+1}:`);
        console.log(`PageContent length: ${doc.pageContent?.length || 0} characters`);
        console.log(`Metadata:`, JSON.stringify(doc.metadata, null, 2));
      });
    } else {
      console.log(`No results found for query: "${query}"`);
    }
    
    return results;
  }

  async listDocuments() {
    if (!this.vectorStore) await this.initialize();
    const collection = await this.vectorStore?.collection;
    const documents = await collection?.get();
    return documents;
  }

  async deleteDocument(id: string) {
    if (!this.vectorStore) await this.initialize();
    const collection = await this.vectorStore?.collection;
    await collection?.delete({ ids: [id] });
  }

  public async getDocuments(): Promise<{ documents: string[], ids: string[], metadatas: any[] }> {
    const collection = await this.getCollection();
    if (!collection) {
      return { documents: [], ids: [], metadatas: [] };
    }

    const result = await collection.get();
    if (!result) {
      return { documents: [], ids: [], metadatas: [] };
    }

    return {
      documents: result.documents?.map(doc => doc || '') || [],
      ids: result.ids?.map(id => id || '') || [],
      metadatas: result.metadatas || []
    };
  }

  public async generateResponse(query: string, context: string | any[]): Promise<{ text: string, links: { url: string, title: string, type: string }[] }> {
    console.log('\n=== Generating Response ===');
    console.log('Query:', query);

    // Extract links from context if it's an array of documents
    let contextText = '';
    let extractedLinks: { url: string, title: string, type: string }[] = [];

    if (Array.isArray(context)) {
      // Process the reference output.json file first to extract URLs
      const outputJsonDoc = context.find(doc => 
        doc && doc.metadata && doc.metadata.filename === "output.json"
      );
      
      if (outputJsonDoc) {
        console.log("Processing output.json reference file for URLs");
        try {
          // Try to parse the JSON content
          let jsonData;
          if (typeof outputJsonDoc.pageContent === 'string') {
            try {
              jsonData = JSON.parse(outputJsonDoc.pageContent);
            } catch (parseError) {
              console.error("Initial JSON parsing failed:", parseError);
              
              // Try to clean the JSON string before parsing
              const cleanedJson = outputJsonDoc.pageContent
                .replace(/[\u0000-\u0019]+/g, "") // Remove control characters
                .trim();
              
              try {
                // Try parsing with cleaned JSON
                jsonData = JSON.parse(cleanedJson);
                console.log("Successfully parsed cleaned JSON");
              } catch (secondError) {
                // If that fails, try finding and extracting a valid JSON array
                console.error("Second parsing attempt failed:", secondError);
                
                // Look for array patterns in the content
                const arrayMatch = cleanedJson.match(/\[\s*\{.+\}\s*\]/s);
                if (arrayMatch) {
                  try {
                    jsonData = JSON.parse(arrayMatch[0]);
                    console.log("Successfully parsed extracted JSON array");
                  } catch (thirdError) {
                    console.error("Third parsing attempt failed:", thirdError);
                    
                    // As a last resort, try to process the content line by line
                    console.log("Attempting to process content line by line");
                    const lines = cleanedJson.split('\n');
                    jsonData = [];
                    
                    let currentObject = null;
                    for (const line of lines) {
                      if (line.trim().startsWith('{"url":')) {
                        // Start a new object if we find a line that looks like a JSON object with a URL
                        try {
                          if (currentObject) {
                            jsonData.push(currentObject);
                          }
                          currentObject = JSON.parse(line.trim());
                        } catch (e) {
                          currentObject = { url: extractUrlFromLine(line) };
                        }
                      } else if (currentObject && line.includes('title')) {
                        // Extract title if found
                        const titleMatch = line.match(/"title"\s*:\s*"([^"]+)"/);
                        if (titleMatch && titleMatch[1]) {
                          currentObject.title = titleMatch[1];
                        }
                      }
                    }
                    
                    // Add the last object if exists
                    if (currentObject) {
                      jsonData.push(currentObject);
                    }
                    
                    if (jsonData.length > 0) {
                      console.log(`Extracted ${jsonData.length} URL objects from line-by-line processing`);
                    } else {
                      console.error("Failed to extract any valid URL objects");
                    }
                  }
                } else {
                  console.error("No valid JSON array pattern found in content");
                  jsonData = [];
                }
              }
            }
          } else {
            jsonData = outputJsonDoc.pageContent;
          }
          
          // Extract URLs from the JSON data if it's an array
          if (Array.isArray(jsonData)) {
            console.log(`Found ${jsonData.length} items in output.json`);
            
            // Process each item to extract URLs
            jsonData.forEach((item, index) => {
              if (item && typeof item === 'object') {
                // Extract URL and title from each item
                if (item.url && typeof item.url === 'string') {
                  // Determine if this is a documentation entry based on URL or category
                  const isManualOrDocumentation = 
                    (item.url && (
                      item.url.includes('/manual') || 
                      item.url.includes('/documentation') ||
                      item.url.includes('/instruction') ||
                      item.url.includes('/guide') ||
                      item.url.includes('/download') ||
                      item.url.includes('.pdf')
                    )) ||
                    (item.category === 'download') ||
                    (item.title && /manual|guide|instruction|dokumentacja|install/i.test(item.title));
                  
                  // Format category for type field
                  const itemType = item.category === 'download' ? 'document' : 
                                   isManualOrDocumentation ? 'document' : 
                                   item.is_product ? 'webpage' : 'document';
                  
                  // Create better title if the original is just "file"
                  let displayTitle = item.title || item.name || `Document ${index + 1}`;
                  if (displayTitle.toLowerCase() === 'file' && item.url) {
                    // Try to extract a better title from the URL
                    const urlParts = item.url.split('/');
                    const lastPart = urlParts[urlParts.length - 2]; // Get the part before "file" in the URL
                    if (lastPart && lastPart !== 'file') {
                      displayTitle = lastPart.replace(/-/g, ' ').replace(/^\d+\s*/, '');
                      // Capitalize first letter of each word
                      displayTitle = displayTitle.split(' ')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                      
                      console.log(`Improved title from "file" to "${displayTitle}"`);
                    }
                  }
                  
                  // Add main URL with better typing
                  extractedLinks.push({
                    url: item.url,
                    title: String(displayTitle),
                    type: itemType
                  });
                  
                  // Also extract any download links with special treatment for manuals
                  if (item.download_links && Array.isArray(item.download_links)) {
                    item.download_links.forEach((link: any) => {
                      if (link && typeof link === 'object' && link.url) {
                        // For links with generic text like "file", try to improve the title
                        let linkTitle = link.text || link.title || displayTitle || `Download ${index + 1}`;
                        
                        if (linkTitle.toLowerCase() === 'file' && link.url) {
                          // First try using item's title
                          if (item.title && item.title.toLowerCase() !== 'file') {
                            linkTitle = item.title;
                          } else {
                            // Or try to extract from URL
                            const urlParts = link.url.split('/');
                            const lastPart = urlParts[urlParts.length - 2];
                            if (lastPart && lastPart !== 'file') {
                              linkTitle = lastPart.replace(/-/g, ' ').replace(/^\d+\s*/, '');
                              // Capitalize first letter of each word
                              linkTitle = linkTitle.split(' ')
                                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ');
                            }
                          }
                          
                          console.log(`Improved download link title from "file" to "${linkTitle}"`);
                        }
                        
                        // Extract file extension from URL if possible
                        let linkType = link.type || 'document';
                        if (link.url.toLowerCase().endsWith('.pdf')) {
                          linkType = 'application/pdf';
                        }
                        
                        extractedLinks.push({
                          url: link.url,
                          title: linkTitle,
                          type: linkType
                        });
                        
                        console.log(`Added download link: ${linkTitle} (${link.url})`);
                      }
                    });
                  }
                }
              }
            });
            
            console.log(`Extracted ${extractedLinks.length} links from output.json`);
          }
        } catch (error) {
          console.error("Error processing output.json:", error);
        }
      }
      
      // Helper function to extract URL from a string
      function extractUrlFromLine(line: string): string | null {
        const urlMatch = line.match(/"url"\s*:\s*"([^"]+)"/);
        return urlMatch && urlMatch[1] ? urlMatch[1] : null;
      }
      
      // Process other documents for context
      contextText = context.map(doc => {
        if (typeof doc === 'string') {
          return doc;
        } else if (doc && typeof doc === 'object') {
          // Skip output.json when building the context text
          if (doc.metadata && doc.metadata.filename === "output.json") {
            return '';
          }
          
          // Extract metadata if available
          const metadata = doc.metadata || {};
          console.log('Processing metadata for link extraction:', JSON.stringify(metadata, null, 2));
          
          // Extract URL from metadata
          if (metadata.url) {
            extractedLinks.push({
              url: metadata.url,
              title: metadata.title || metadata.filename || 'Link to product page',
              type: 'webpage'
            });
            console.log('Extracted webpage URL:', metadata.url);
          }
          
          // Extract download links from metadata
          if (metadata.download_links) {
            try {
              let downloadLinks;
              if (typeof metadata.download_links === 'string') {
                // Parse JSON string
                downloadLinks = JSON.parse(metadata.download_links);
                console.log('Parsed download_links from JSON string:', downloadLinks);
              } else if (Array.isArray(metadata.download_links)) {
                // Already an array
                downloadLinks = metadata.download_links;
                console.log('Using download_links array directly:', downloadLinks);
              }
              
              if (Array.isArray(downloadLinks)) {
                downloadLinks.forEach((link: any) => {
                  if (link && typeof link === 'object' && link.url) {
                    extractedLinks.push({
                      url: link.url,
                      title: link.text || link.title || 'Document',
                      type: link.type || 'document'
                    });
                    console.log('Extracted download link:', link.url);
                  } else if (typeof link === 'string') {
                    extractedLinks.push({
                      url: link,
                      title: 'Document',
                      type: 'document'
                    });
                    console.log('Extracted string download link:', link);
                  }
                });
              }
            } catch (error) {
              console.error('Error parsing download_links:', error);
            }
          }
          
          return doc.pageContent || '';
        }
        return '';
      }).join('\n');
    } else {
      // Context is a string
      contextText = context;
    }
    
    // Remove duplicate links
    extractedLinks = extractedLinks.filter((link, index, self) => 
      index === self.findIndex((t) => t.url === link.url)
    );
    
    // Smarter deduplication - remove pagination variants and similar URLs
    if (extractedLinks.length > 0) {
      // First group links by their base URL (without query params)
      const urlGroups = new Map<string, Array<typeof extractedLinks[0]>>();
      
      extractedLinks.forEach(link => {
        try {
          // Parse the URL and remove query parameters for comparison
          const url = new URL(link.url);
          // Get base URL without query parameters and trailing slash
          const baseUrl = (url.origin + url.pathname).replace(/\/$/, '');
          
          // Group by base URL
          if (!urlGroups.has(baseUrl)) {
            urlGroups.set(baseUrl, []);
          }
          urlGroups.get(baseUrl)!.push(link);
        } catch (e) {
          // If URL parsing fails, use the original URL
          const fallbackGroup = link.url.split('?')[0].replace(/\/$/, '');
          if (!urlGroups.has(fallbackGroup)) {
            urlGroups.set(fallbackGroup, []);
          }
          urlGroups.get(fallbackGroup)!.push(link);
        }
      });
      
      // For each group, select the best link
      const dedupedLinks: Array<typeof extractedLinks[0]> = [];
      urlGroups.forEach((links, baseUrl) => {
        if (links.length === 1) {
          // If there's only one link in the group, keep it
          dedupedLinks.push(links[0]);
        } else {
          // For multiple links with the same base URL:
          // 1. Prefer PDF/document over webpage
          // 2. Prefer shortest URL without query parameters
          // 3. Prefer highest relevance score if available
          
          // First check if any are PDFs/documents
          const documentLinks = links.filter(link => 
            link.type === 'application/pdf' || 
            link.type === 'document' || 
            link.url.toLowerCase().includes('.pdf')
          );
          
          if (documentLinks.length > 0) {
            // Choose the document with highest relevance score or first one
            documentLinks.sort((a, b) => 
              ((b as any).relevanceScore || 0) - ((a as any).relevanceScore || 0)
            );
            dedupedLinks.push(documentLinks[0]);
            console.log(`Selected best document from ${links.length} similar URLs: ${documentLinks[0].url}`);
          } else {
            // If no documents, prefer the cleanest URL with highest score
            // Cleaner URLs generally have fewer query parameters
            links.sort((a, b) => {
              // Compare by relevance score first
              const scoreA = (a as any).relevanceScore || 0;
              const scoreB = (b as any).relevanceScore || 0;
              if (scoreB !== scoreA) return scoreB - scoreA;
              
              // If scores are equal, prefer URLs without query parameters
              const queryParamsA = a.url.includes('?') ? a.url.split('?')[1].length : 0;
              const queryParamsB = b.url.includes('?') ? b.url.split('?')[1].length : 0;
              if (queryParamsA !== queryParamsB) return queryParamsA - queryParamsB;
              
              // If still tied, prefer shorter URLs
              return a.url.length - b.url.length;
            });
            
            dedupedLinks.push(links[0]);
            console.log(`Selected best page from ${links.length} similar URLs: ${links[0].url}`);
          }
        }
      });
      
      // Replace original links with deduplicated ones
      console.log(`Reduced ${extractedLinks.length} links to ${dedupedLinks.length} after deduplication`);
      extractedLinks = dedupedLinks;
    }
    
    // Filter links based on relevance to the query
    if (extractedLinks.length > 0) {
      // Break the query into keywords
      const queryKeywords = query.toLowerCase().split(/\s+/)
        .filter(word => word.length > 2)  // Only use significant words
        .map(word => word.replace(/[^\w-]/g, '')); // Remove non-word characters except hyphens
      
      console.log("Query keywords:", queryKeywords);
      
      // Extract potential product models from query
      const modelRegex = /\b([A-Z]{1,4}-?\d+|[A-Z]+-?\d+)\b/i;
      const modelMatches = query.match(new RegExp(modelRegex, 'gi')) || [];
      const queryModels = modelMatches.map(model => model.toUpperCase());
      
      if (queryModels.length > 0) {
        console.log("Detected product models in query:", queryModels);
      }
      
      // Check if query is specifically for a product manual/documentation
      const isDocumentationQuery = /document(ation)?|manual|guide|install(ation)?|instruction/i.test(query);
      
      // If we have product models or keywords, use them for relevance scoring
      if (queryModels.length > 0 || queryKeywords.length > 0) {
        // Score each link based on keyword matches in title, url and content
        extractedLinks.forEach(link => {
          const titleLower = link.title.toLowerCase();
          const urlLower = link.url.toLowerCase();
          
          // Initialize score components for better debugging
          const scoreComponents = {
            exactModelMatch: 0,
            partialModelMatch: 0, 
            titleKeywords: 0,
            urlKeywords: 0,
            contentKeywords: 0,
            documentTypeBoost: 0,
            documentFormatBoost: 0,
            negativeScore: 0
          };
          
          // 1. Check for exact product model matches
          if (queryModels.length > 0) {
            // Extract model from title and url
            const linkModelMatches: string[] = [];
            
            // Extract from title
            const titleModelMatch = titleLower.match(new RegExp(modelRegex, 'gi'));
            if (titleModelMatch) {
              linkModelMatches.push(...titleModelMatch.map(m => m.toUpperCase()));
            }
            
            // Extract from URL
            const urlModelMatch = urlLower.match(new RegExp(modelRegex, 'gi'));
            if (urlModelMatch) {
              linkModelMatches.push(...urlModelMatch.map(m => m.toUpperCase()));
            }
            
            // Check for exact model matches
            const exactMatches = queryModels.filter(qModel => 
              linkModelMatches.some(lModel => lModel === qModel)
            );
            
            if (exactMatches.length > 0) {
              scoreComponents.exactModelMatch = 70 * exactMatches.length; // High priority for exact model matches
              console.log(`Exact model match found: ${exactMatches.join(', ')} in ${link.title}, score +${scoreComponents.exactModelMatch}`);
            } else {
              // Check for partial model family matches
              const partialMatches = queryModels.filter(qModel => {
                // Extract model family (part before the dash)
                const modelFamily = qModel.split('-')[0];
                return linkModelMatches.some(lModel => lModel.startsWith(modelFamily));
              });
              
              if (partialMatches.length > 0) {
                scoreComponents.partialModelMatch = 25 * partialMatches.length; // Medium priority for model family matches
                console.log(`Model family match found: ${partialMatches.join(', ')} in ${link.title}, score +${scoreComponents.partialModelMatch}`);
              }
            }
          }
          
          // 2. Document type detection
          // Check if this is a direct PDF/manual link which should be prioritized for documentation queries
          const isManualLink = /manual|guide|instruction|dokumentacja|install/i.test(titleLower + ' ' + urlLower);
          const isPdfLink = link.type === 'application/pdf' || urlLower.includes('.pdf') || link.type === 'document';
          
          // 3. Boost score for documentation queries
          if (isDocumentationQuery) {
            if (isManualLink) {
              scoreComponents.documentTypeBoost = 30; // Higher priority for manuals when asking for documentation
              console.log(`Manual/guide link found: ${link.title}, score +30`);
            }
            
            if (isPdfLink) {
              scoreComponents.documentFormatBoost = 25; // Higher priority for PDFs when asking for documentation
              console.log(`PDF link found: ${link.title}, score +25`);
            }
            
            // Boost for "download" links when looking for documentation
            if (link.url.includes('download')) {
              scoreComponents.documentTypeBoost += 15;
              console.log(`Download link found: ${link.url}, score +15`);
            }
          }
          
          // 4. Standard keyword matching in title and URL (all queries)
          queryKeywords.forEach(keyword => {
            // Title matches are more relevant than URL matches
            if (titleLower.includes(keyword)) {
              scoreComponents.titleKeywords += 10;
              console.log(`Keyword match found in title: ${keyword} in ${link.title}, score +10`);
            }
            
            // URL can also contain relevant information
            if (urlLower.includes(keyword)) {
              scoreComponents.urlKeywords += 5;
              console.log(`Keyword match found in URL: ${keyword} in ${link.url}, score +5`);
            }
          });
          
          // 5. Content-based scoring - use the document content if available
          // This helps for PDF documents with extracted text
          const documentContent = (link as any).content || '';
          if (typeof documentContent === 'string' && documentContent.length > 0) {
            const contentLower = documentContent.toLowerCase();
            
            // Count keyword frequency in content
            let keywordMatches = 0;
            queryKeywords.forEach(keyword => {
              // Use regex to find all matches of the keyword
              const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'gi');
              const matches = contentLower.match(keywordRegex) || [];
              keywordMatches += matches.length;
            });
            
            // Add score based on keyword frequency, but with diminishing returns
            if (keywordMatches > 0) {
              // Use log scale to prevent extremely long content from dominating
              scoreComponents.contentKeywords = Math.min(25, 5 * Math.log2(1 + keywordMatches));
              console.log(`Content keyword matches: ${keywordMatches} in ${link.title}, score +${scoreComponents.contentKeywords}`);
            }
          }
          
          // 6. Anti-patterns: De-prioritize some links
          // De-prioritize regular web pages when looking for documentation
          if (isDocumentationQuery && !isPdfLink && !isManualLink) {
            scoreComponents.negativeScore = -10;
            console.log(`Non-document link for documentation query: ${link.url}, score ${scoreComponents.negativeScore}`);
          }
          
          // De-prioritize links with models that don't match when searching for a specific model
          if (queryModels.length > 0 && scoreComponents.exactModelMatch === 0 && scoreComponents.partialModelMatch === 0) {
            // If the link contains a model number but not the one we're looking for
            const linkHasModel = new RegExp(modelRegex, 'i').test(titleLower) || 
                              new RegExp(modelRegex, 'i').test(urlLower);
            if (linkHasModel) {
              scoreComponents.negativeScore -= 20;
              console.log(`Link contains different model than requested: ${link.title}, score ${scoreComponents.negativeScore}`);
            }
          }
          
          // Calculate final relevance score
          const relevanceScore = Object.values(scoreComponents).reduce((sum, value) => sum + value, 0);
          
          // Attach score for sorting
          (link as any).relevanceScore = relevanceScore;
          console.log(`Final relevance score for ${link.title}: ${relevanceScore} (${JSON.stringify(scoreComponents)})`);
        });
        
        // Sort by relevance score
        extractedLinks.sort((a, b) => {
          return ((b as any).relevanceScore || 0) - ((a as any).relevanceScore || 0);
        });
        
        // For documentation queries, ensure PDFs are appropriately represented
        if (isDocumentationQuery) {
          const documentLinks = extractedLinks.filter(link => 
            link.type === 'application/pdf' || 
            link.type === 'document' ||
            link.url.includes('.pdf')
          );
          
          const otherLinks = extractedLinks.filter(link => 
            link.type !== 'application/pdf' && 
            link.type !== 'document' &&
            !link.url.includes('.pdf')
          );
          
          // Make sure we have a mix of document and web links
          // but prioritize documents with good scores
          if (documentLinks.length > 0) {
            console.log(`Found ${documentLinks.length} document links`);
            
            // Only include web pages with positive scores
            const goodWebPages = otherLinks.filter(link => (link as any).relevanceScore > 0);
            
            // Ensure balanced results with highest scored links of each type
            if (goodWebPages.length > 0 && documentLinks.length > 0) {
              // Aim for 70% documents, 30% web pages but maintain minimum of 2 web pages
              const targetDocCount = Math.min(documentLinks.length, Math.max(5, Math.floor(extractedLinks.length * 0.7)));
              const targetWebCount = Math.min(goodWebPages.length, Math.max(2, extractedLinks.length - targetDocCount));
              
              extractedLinks = [
                ...documentLinks.slice(0, targetDocCount),
                ...goodWebPages.slice(0, targetWebCount)
              ];
              
              console.log(`Balanced results: ${targetDocCount} documents and ${targetWebCount} web pages`);
            }
          }
        }
        
        // Limit to 10 most relevant links if there are many
        if (extractedLinks.length > 10) {
          extractedLinks = extractedLinks.slice(0, 10);
        }
        
        // Clean up similar titles (e.g., "Manuals - Roger" appearing multiple times)
        const titleCounts = new Map<string, number>();
        extractedLinks.forEach(link => {
          const lowerTitle = link.title.toLowerCase();
          titleCounts.set(lowerTitle, (titleCounts.get(lowerTitle) || 0) + 1);
        });
        
        // Add URL section name to titles that are duplicated
        extractedLinks.forEach(link => {
          const lowerTitle = link.title.toLowerCase();
          if (titleCounts.get(lowerTitle)! > 1) {
            try {
              // Parse URL to extract useful information for distinguishing the link
              const url = new URL(link.url);
              const pathSegments = url.pathname.split('/').filter(Boolean);
              
              // If we have path segments, add the last meaningful one to the title
              if (pathSegments.length > 0) {
                // Get the last segment that's not "file" or a number
                let lastSegment = '';
                for (let i = pathSegments.length - 1; i >= 0; i--) {
                  if (pathSegments[i] !== 'file' && !/^\d+$/.test(pathSegments[i])) {
                    lastSegment = pathSegments[i].replace(/-/g, ' ');
                    break;
                  }
                }
                
                if (lastSegment) {
                  // Format the segment nicely
                  lastSegment = lastSegment
                    .split(' ')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  
                  // Only update if it adds new information
                  if (!link.title.toLowerCase().includes(lastSegment.toLowerCase())) {
                    link.title = `${link.title} - ${lastSegment}`;
                    console.log(`Improved duplicate title: ${link.title}`);
                  }
                }
              }
            } catch (e) {
              // URL parsing failed, add a simple numeric identifier
              const urls = Array.from(extractedLinks)
                .filter(l => l.title.toLowerCase() === lowerTitle)
                .map(l => l.url);
              const index = urls.indexOf(link.url) + 1;
              if (index > 1) {
                link.title = `${link.title} (${index})`;
              }
            }
          }
        });
      }
    }
    
    console.log(`Using ${extractedLinks.length} relevant links in response`);
    // Log top links and their scores for debugging
    if (extractedLinks.length > 0) {
      console.log("Top relevant links:");
      extractedLinks.slice(0, 5).forEach((link, index) => {
        console.log(`${index+1}. ${link.title} (${link.url}) - Score: ${(link as any).relevanceScore || 0}`);
      });
    }
    
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: 
        `You are a smart, friendly assistant working in both sales and customer support for our company. You help customers with product questions, technical inquiries, and general assistance. Your role is to sound human, helpful, and trustworthy — like a mix of a skilled support rep and a product expert.

        Here is relevant internal information to help answer the question:
        ${contextText}

        Please follow these tone and style guidelines:

        1. **Adapt your tone based on the type of question**:
          - If the question is about a **product or service**, take a **warm, persuasive, and confident sales tone**. Use positive language and "fizzle words" like *seamless*, *reliable*, *intuitive*, *flexible*, *powerful*, *efficient*, etc.
          - If the question is **technical**, shift to a **clear, informative, and professional tone**. Be precise and avoid unnecessary embellishment.

        2. **General rules**:
          - Never mention the word "context" or refer to the source of your information.
          - Always refer to our company as "we" or "our" — never by name.
          - Keep responses concise and easy to read.
          - Use simple language, but don't oversimplify technical answers.
          - Use bullet points or numbered lists for steps or multiple features.
          - If unsure about something, acknowledge it honestly and offer help to find out more.
          - End with a friendly offer to assist further or a follow-up question like:  
            "Would you like help with anything else?" or "Can I tell you more about that?"
        
        3. **Link handling**:
          - If the user is asking for documentation links or resources without being specific, summarize the available documents we have found and indicate you'll be sharing links to them.
          - Don't include direct links in your text - we'll add those separately at the end of your response.
          - If the user is asking for a specific document but we haven't found anything relevant, acknowledge this and ask for more details.
          - Only use trusted information from retrieved context. If unsure, say so.
        
          Customer question: ${query}

        Now write a helpful and appropriately-toned response:`
        }]
    });

    console.log('\n=== Message Content Details ===');
    console.log('Message:', message);

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    console.log('\n=== Final Response ===');
    console.log('Response Text:', responseText);
    console.log('Extracted Links:', extractedLinks);
    console.log('=== End Response ===\n');
    
    return { 
      text: responseText, 
      links: extractedLinks 
    };
  }

  public async refreshOutputJsonReference(): Promise<boolean> {
    console.log("Attempting to refresh output.json reference in database");
    
    try {
      // Check if we have a collection
      const collection = await this.getCollection();
      if (!collection) {
        console.error("Cannot refresh output.json: No collection available");
        return false;
      }
      
      // First check if output.json exists in the database
      const existingFiles = await collection.get({
        where: { filename: "output.json" }
      });
      
      if (existingFiles && existingFiles.ids && existingFiles.ids.length > 0) {
        console.log(`Found ${existingFiles.ids.length} existing output.json entries, removing them`);
        
        // Delete all existing output.json entries
        await collection.delete({
          where: { filename: "output.json" }
        });
        
        console.log("Deleted existing output.json entries");
      }
      
      // Check if output.json exists in uploads folder
      const uploadsDir = path.join(process.cwd(), 'uploads');
      try {
        const files = await fs.readdir(uploadsDir);
        const outputJsonFiles = files.filter(file => file.includes('output.json'));
        
        if (outputJsonFiles.length > 0) {
          console.log(`Found ${outputJsonFiles.length} output.json files in uploads folder`);
          
          // Use the most recent file
          const outputJsonPath = path.join(uploadsDir, outputJsonFiles[0]);
          console.log(`Using ${outputJsonPath} to refresh database`);
          
          // Read the file content
          const fileContent = await fs.readFile(outputJsonPath, 'utf-8');
          
          // Clean the content
          const cleanedContent = fileContent
            .replace(/^\uFEFF/, '') // Remove BOM
            .replace(/[\u0000-\u0019]+/g, " ") // Replace control chars with space
            .trim();
          
          // Basic validation - check if it contains valid JSON data
          try {
            const testParse = JSON.parse(cleanedContent);
            if (Array.isArray(testParse)) {
              console.log(`Content validation passed: Contains array with ${testParse.length} items`);
            } else {
              console.warn("Content validation warning: JSON doesn't contain an array of items");
            }
          } catch (err) {
            console.warn("Content validation warning: Not valid JSON, but will still process it", err);
          }
          
          // Add to collection
          const result = await collection.add({
            documents: [cleanedContent],
            metadatas: [{
              filename: "output.json",
              path: outputJsonPath,
              type: "json",
              size: fileContent.length,
              modified_time: new Date().toISOString()
            }],
            ids: [crypto.randomUUID()]
          });
          
          console.log("Successfully refreshed output.json in database");
          return true;
        } else {
          console.log("No output.json files found in uploads folder");
          
          // Look in parent directories
          const parentDirs = [
            path.join(process.cwd(), '..', 'scrapy', 'roger'),
            path.join(process.cwd(), '..', 'scrapy'),
            path.join(process.cwd(), '..')
          ];
          
          for (const dir of parentDirs) {
            try {
              const parentFiles = await fs.readdir(dir);
              const outputFile = parentFiles.find(file => file === 'output.json');
              
              if (outputFile) {
                const sourcePath = path.join(dir, outputFile);
                console.log(`Found output.json in parent directory: ${sourcePath}`);
                
                // Copy to uploads folder
                const destPath = path.join(uploadsDir, 'output.json');
                await fs.copyFile(sourcePath, destPath);
                console.log(`Copied output.json to uploads folder: ${destPath}`);
                
                // Recursively call this method to process the copied file
                return await this.refreshOutputJsonReference();
              }
            } catch (err) {
              console.error(`Error checking directory ${dir}:`, err);
            }
          }
          
          console.warn("Could not find output.json file in any location");
          return false;
        }
      } catch (error) {
        console.error("Error reading uploads directory:", error);
        return false;
      }
    } catch (error) {
      console.error("Error refreshing output.json reference:", error);
      return false;
    }
  }
} 