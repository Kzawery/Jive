import { JiveChatbot } from './components/JiveChatbot';

// Register all web components
export function registerComponents(): void {
  if (!customElements.get('jive-chatbot')) {
    customElements.define('jive-chatbot', JiveChatbot);
  }
}

// Auto-register when this file is imported
registerComponents(); 