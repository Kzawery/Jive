import { ChromaClient } from 'chromadb';
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";
import { ChatAnthropic } from "@langchain/anthropic";
import path from 'path';

export class ChromaService {
  private client: ChromaClient;
  private embeddings: VoyageEmbeddings;
  private vectorStore: Chroma | null = null;
  private llm: ChatAnthropic;

  constructor() {
    // Initialize Chroma client with persistence
    this.client = new ChromaClient({
      path: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
    });
    
    // Initialize Voyage embeddings
    this.embeddings = new VoyageEmbeddings({
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

  async initialize() {
    // Initialize vector store with persistence
    this.vectorStore = await Chroma.fromTexts(
      [], // Initial empty texts
      [], // Initial empty metadata
      this.embeddings,
      {
        collectionName: "chatbot_knowledge",
        url: process.env.CHROMA_SERVER_URL || "http://localhost:8000"
      }
    );
  }

  async addDocument(text: string, metadata: any = {}) {
    if (!this.vectorStore) await this.initialize();
    await this.vectorStore?.addDocuments([
      new Document({
        pageContent: text,
        metadata
      })
    ]);
  }

  async search(query: string, k: number = 3) {
    if (!this.vectorStore) await this.initialize();
    return await this.vectorStore?.similaritySearch(query, k);
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

  async generateResponse(query: string, context: string) {
    const prompt = `Context: ${context}\n\nQuestion: ${query}\n\nPlease provide a helpful response based on the context provided.`;
    
    const response = await this.llm.invoke(prompt);
    return response.content;
  }
} 