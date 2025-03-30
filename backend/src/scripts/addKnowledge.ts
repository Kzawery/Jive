import { ChromaService } from '../chroma/chromaService';
import dotenv from 'dotenv';

dotenv.config();

async function addKnowledge() {
  const chromaService = new ChromaService();
  
  // Example documents
  const documents = [
    {
      text: "Jive is a modern communication platform that helps teams collaborate effectively.",
      metadata: {
        source: "company_info",
        category: "general"
      }
    },
    {
      text: "To use Jive, simply sign up for an account and start creating spaces for your team.",
      metadata: {
        source: "user_guide",
        category: "getting_started"
      }
    },
    // Add more documents as needed
  ];

  for (const doc of documents) {
    try {
      await chromaService.addDocument(doc.text, doc.metadata);
      console.log('Added document:', doc.text.substring(0, 50) + '...');
    } catch (error) {
      console.error('Error adding document:', error);
    }
  }

  console.log('Finished adding documents to knowledgebase');
}

addKnowledge().catch(console.error); 