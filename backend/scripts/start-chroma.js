const { ChromaClient } = require('chromadb');
const path = require('path');

// Set the Chroma persistence directory
process.env.CHROMA_PERSIST_DIRECTORY = path.join(__dirname, '..', 'data', 'chroma');

const client = new ChromaClient({
  path: "http://localhost:8000"
});

console.log('Starting Chroma server with persistent storage at:', process.env.CHROMA_PERSIST_DIRECTORY);

// Keep the script running
process.on('SIGINT', () => {
  console.log('Shutting down Chroma server...');
  process.exit(0);
}); 