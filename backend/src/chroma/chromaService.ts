// import { ChromaClient } from 'chromadb';
// import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
// import { Chroma } from "@langchain/community/vectorstores/chroma";
// import { Document } from "@langchain/core/documents";
// import { ChatAnthropic } from "@langchain/anthropic";
// import Anthropic from '@anthropic-ai/sdk';
// import path from 'path';

// export class ChromaService {
//   private client: ChromaClient;
//   private _embeddings: VoyageEmbeddings;
//   private vectorStore: Chroma | null = null;
//   private llm: ChatAnthropic;

//   constructor() {
//     // Initialize Chroma client with persistence
//     this.client = new ChromaClient({
//       path: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
//     });
    
//     // Initialize Voyage embeddings
//     this._embeddings = new VoyageEmbeddings({
//       apiKey: process.env.VOYAGE_API_KEY,
//       modelName: "voyage-2"
//     });

//     // Initialize Claude LLM
//     this.llm = new ChatAnthropic({
//       anthropicApiKey: process.env.ANTHROPIC_API_KEY,
//       modelName: "claude-3-7-sonnet-20250219",
//       temperature: 0.7
//     });
//   }

//   get embeddings(): VoyageEmbeddings {
//     return this._embeddings;
//   }

//   async initialize() {
//     // Initialize vector store with persistence
//     this.vectorStore = await Chroma.fromTexts(
//       [], // Initial empty texts
//       [], // Initial empty metadata
//       this._embeddings,
//       {
//         collectionName: "chatbot_knowledge",
//         url: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
//       }
//     );
//   }

//   async addDocument(text: string, metadata: any = {}) {
//     if (!this.vectorStore) await this.initialize();
//     await this.vectorStore?.addDocuments([
//       new Document({
//         pageContent: text,
//         metadata
//       })
//     ]);
//   }

//   async search(query: string, k: number = 3) {
//     if (!this.vectorStore) await this.initialize();
//     return await this.vectorStore?.similaritySearch(query, k);
//   }

//   async listDocuments() {
//     if (!this.vectorStore) await this.initialize();
//     const collection = await this.vectorStore?.collection;
//     const documents = await collection?.get();
//     return documents;
//   }

//   async deleteDocument(id: string) {
//     if (!this.vectorStore) await this.initialize();
//     const collection = await this.vectorStore?.collection;
//     await collection?.delete({ ids: [id] });
//   }

//   public async generateResponse(query: string, context: string): Promise<string> {
//     console.log('\n=== Generating Response ===');
//     console.log('Query:', query);


//     const anthropic = new Anthropic({
//       apiKey: process.env.ANTHROPIC_API_KEY
//     });

//     const message = await anthropic.messages.create({
//       model: 'claude-3-5-sonnet-20240620',
//       max_tokens: 1000,
//       messages: [{
//         role: 'user',
//         content: 
//        `You are a smart, friendly assistant working in both sales and customer support for our company. You help customers with product questions, technical inquiries, and general assistance. Your role is to sound human, helpful, and trustworthy — like a mix of a skilled support rep and a product expert.

//         Here is relevant internal information to help answer the question:
//         ${context}

//         Please follow these tone and style guidelines:

//         1. **Adapt your tone based on the type of question**:
//           - If the question is about a **product or service**, take a **warm, persuasive, and confident sales tone**. Use positive language and "fizzle words" like *seamless*, *reliable*, *intuitive*, *flexible*, *powerful*, *efficient*, etc.
//           - If the question is **technical**, shift to a **clear, informative, and professional tone**. Be precise and avoid unnecessary embellishment.

//         2. **General rules**:
//           - Never mention the word "context" or refer to the source of your information.
//           - Always refer to our company as "we" or "our" — never by name.
//           - Keep responses concise and easy to read.
//           - Use simple language, but don't oversimplify technical answers.
//           - Use bullet points or numbered lists for steps or multiple features.
//           - If unsure about something, acknowledge it honestly and offer help to find out more.
//           - End with a friendly offer to assist further or a follow-up question like:  
//             "Would you like help with anything else?" or "Can I tell you more about that?"
//         3.When relevant, include the title and a link to the source (if available).

//           For example:  
//           **Title**: Invalid communication key  
//           **Link**: https://www.roger.pl/en/...

//           Only use trusted information from retrieved context. If unsure, say so.
        
//           Customer question: ${query}

//         Now write a helpful and appropriately-toned response:`
//             }]
//     });

//     console.log('\n=== Message Content Details ===');
//     console.log('Message:', message);

//     const response = message.content[0].type === 'text' ? message.content[0].text : '';

//     console.log('\n=== Final Response ===');
//     console.log('Response:', response);
//     console.log('=== End Response ===\n');
    
//     return response;
//   }
// } 