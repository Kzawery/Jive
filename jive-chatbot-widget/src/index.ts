// Export components
export * from './components/JiveChatbot';

// Register web components if in browser environment
if (typeof window !== 'undefined') {
  // Dynamically import components to register them
  import('./register');
} 