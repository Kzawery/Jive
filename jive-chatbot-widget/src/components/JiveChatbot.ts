/**
 * JiveChatbot Web Component
 * 
 * A customizable chatbot widget that can be embedded in any website
 */
import type { Socket } from 'socket.io-client';
import { marked } from 'marked';

declare global {
  interface Window {
    io: any;
  }
}

export class JiveChatbot extends HTMLElement {
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private chatContainer: HTMLDivElement;
  private inputContainer: HTMLDivElement;
  private socket: Socket | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private socketConnected = false;
  
  // Define observed attributes for component configuration
  static get observedAttributes(): string[] {
    return [
      'theme',
      'position',
      'api-endpoint',
      'socket-endpoint',
      'welcome-message',
      'company-logo',
      'company-name'
    ];
  }
  
  constructor() {
    super();
    
    // Create shadow DOM
    this.shadow = this.attachShadow({ mode: 'open' });
    
    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'jive-chatbot-widget';
    
    // Create chat container for messages
    this.chatContainer = document.createElement('div');
    this.chatContainer.className = 'jive-chatbot-messages';
    
    // Create input container
    this.inputContainer = document.createElement('div');
    this.inputContainer.className = 'jive-chatbot-input';
    
    // Initialize the component
    this.initialize();
  }
  
  /**
   * Initialize the component by creating the DOM structure and adding event listeners
   */
  private initialize(): void {
    // Add styles to shadow DOM
    this.addStyles();
    
    // Create chat header
    const header = this.createHeader();
    
    // Create input area with send button
    const inputArea = this.createInputArea();
    
    // Assemble the components
    this.container.appendChild(header);
    this.container.appendChild(this.chatContainer);
    this.container.appendChild(inputArea);
    
    // Add the container to shadow DOM
    this.shadow.appendChild(this.container);
  }
  
  /**
   * Add styles to the shadow DOM
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        --primary-color: #4a90e2;
        --secondary-color: #f2f2f2;
        --text-color: #333333;
        --border-radius: 8px;
        --font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        
        display: block;
      }
      
      .jive-chatbot-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 350px;
        height: 500px;
        border-radius: var(--border-radius);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
        background-color: #ffffff;
        font-family: var(--font-family);
      }
      
      .jive-chatbot-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background-color: var(--primary-color);
        color: white;
      }
      
      .jive-chatbot-title {
        font-weight: bold;
        font-size: 16px;
      }
      
      .jive-chatbot-controls button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        margin-left: 10px;
        opacity: 0.8;
        transition: opacity 0.2s;
      }
      
      .jive-chatbot-controls button:hover {
        opacity: 1;
      }
      
      .jive-chatbot-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .jive-chatbot-input {
        padding: 12px;
        border-top: 1px solid #e0e0e0;
        display: flex;
      }
      
      .jive-chatbot-input input {
        flex: 1;
        padding: 10px;
        border: 1px solid #e0e0e0;
        border-radius: var(--border-radius);
        font-family: var(--font-family);
        font-size: 14px;
      }
      
      .jive-chatbot-input button {
        margin-left: 8px;
        padding: 10px 16px;
        border: none;
        border-radius: var(--border-radius);
        background-color: var(--primary-color);
        color: white;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .jive-chatbot-input button:hover {
        background-color: #3a80d2;
      }
      
      .jive-message {
        max-width: 80%;
        padding: 12px;
        border-radius: var(--border-radius);
        animation: fadeIn 0.3s;
        line-height: 1.5;
      }
      
      .jive-message pre {
        background-color: #f5f5f5;
        padding: 12px;
        border-radius: 4px;
        overflow-x: auto;
        margin: 8px 0;
        font-size: 14px;
      }
      
      .jive-message code {
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
      }
      
      .jive-message p {
        margin: 8px 0;
      }
      
      .jive-message ul, .jive-message ol {
        margin: 8px 0;
        padding-left: 20px;
      }
      
      .jive-message a {
        color: #4a90e2;
        text-decoration: none;
      }
      
      .jive-message a:hover {
        text-decoration: underline;
      }
      
      .jive-message blockquote {
        border-left: 4px solid #ddd;
        margin: 8px 0;
        padding-left: 10px;
        color: #666;
      }
      
      .jive-message table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
      }
      
      .jive-message th, .jive-message td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      
      .jive-message th {
        background-color: #f5f5f5;
      }
      
      .jive-message-bot {
        align-self: flex-start;
        background-color: var(--secondary-color);
        color: var(--text-color);
      }
      
      .jive-message-bot strong {
        font-weight: 600;
      }
      
      .jive-message-bot em {
        font-style: italic;
      }
      
      .jive-message-bot ul, .jive-message-bot ol {
        margin: 8px 0;
        padding-left: 24px;
      }
      
      .jive-message-bot li {
        margin: 4px 0;
      }
      
      .jive-message-bot blockquote {
        border-left: 4px solid #ddd;
        margin: 8px 0;
        padding: 4px 12px;
        color: #666;
      }
      
      .jive-message-bot h1, 
      .jive-message-bot h2, 
      .jive-message-bot h3, 
      .jive-message-bot h4, 
      .jive-message-bot h5, 
      .jive-message-bot h6 {
        margin: 16px 0 8px 0;
        font-weight: 600;
        line-height: 1.25;
      }
      
      .jive-message-bot h1 { font-size: 1.5em; }
      .jive-message-bot h2 { font-size: 1.3em; }
      .jive-message-bot h3 { font-size: 1.2em; }
      .jive-message-bot h4 { font-size: 1.1em; }
      .jive-message-bot h5 { font-size: 1em; }
      .jive-message-bot h6 { font-size: 0.9em; }
      
      .jive-message-bot a {
        color: #4a90e2;
        text-decoration: none;
      }
      
      .jive-message-bot a:hover {
        text-decoration: underline;
      }
      
      .jive-message-bot table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
        font-size: 14px;
      }
      
      .jive-message-bot th,
      .jive-message-bot td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      
      .jive-message-bot th {
        background-color: #f5f5f5;
        font-weight: 600;
      }
      
      .jive-message-bot hr {
        border: none;
        border-top: 1px solid #ddd;
        margin: 16px 0;
      }
      
      .jive-message-bot img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 8px 0;
      }
      
      .jive-message-bot code:not(pre code) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 0.9em;
      }
      
      .jive-message-user {
        align-self: flex-end;
        background-color: var(--primary-color);
        color: white;
      }
      
      .typing-indicator {
        display: flex;
        align-items: center;
        align-self: flex-start;
        background-color: var(--secondary-color);
        padding: 12px;
        border-radius: var(--border-radius);
        margin-top: 8px;
      }
      
      .typing-indicator span {
        height: 8px;
        width: 8px;
        background-color: #666;
        border-radius: 50%;
        display: inline-block;
        margin: 0 2px;
        opacity: 0.4;
      }
      
      .typing-indicator span:nth-child(1) {
        animation: blink 1s infinite 0.2s;
      }
      
      .typing-indicator span:nth-child(2) {
        animation: blink 1s infinite 0.4s;
      }
      
      .typing-indicator span:nth-child(3) {
        animation: blink 1s infinite 0.6s;
      }
      
      @keyframes blink {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      
      .connection-status {
        text-align: center;
        font-size: 12px;
        padding: 4px;
        color: #999;
        background-color: #f8f8f8;
      }
      
      .connection-status.connected {
        color: #4caf50;
      }
      
      .connection-status.disconnected {
        color: #f44336;
      }
      
      .minimized {
        height: 50px;
        overflow: hidden;
      }
      
      .minimized .jive-chatbot-messages,
      .minimized .jive-chatbot-input {
        display: none;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    
    this.shadow.appendChild(style);
  }
  
  /**
   * Create the chat header with title and controls
   */
  private createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'jive-chatbot-header';
    
    const title = document.createElement('div');
    title.className = 'jive-chatbot-title';
    title.textContent = this.getAttribute('company-name') || 'Jive Support';
    
    const controls = document.createElement('div');
    controls.className = 'jive-chatbot-controls';
    
    const minimizeButton = document.createElement('button');
    minimizeButton.innerHTML = '&minus;';
    minimizeButton.title = 'Minimize';
    minimizeButton.addEventListener('click', this.toggleMinimize.bind(this));
    
    controls.appendChild(minimizeButton);
    header.appendChild(title);
    header.appendChild(controls);
    
    return header;
  }
  
  /**
   * Create the input area with text input and send button
   */
  private createInputArea(): HTMLDivElement {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'jive-chatbot-input';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your message...';
    
    // Add input event for typing indicator
    input.addEventListener('input', () => {
      this.handleTypingIndicator();
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
    
    const sendButton = document.createElement('button');
    sendButton.textContent = 'Send';
    sendButton.addEventListener('click', this.sendMessage.bind(this));
    
    inputContainer.appendChild(input);
    inputContainer.appendChild(sendButton);
    
    return inputContainer;
  }
  
  /**
   * Toggle the minimized state of the chatbot
   */
  private toggleMinimize(): void {
    this.container.classList.toggle('minimized');
  }
  
  /**
   * Initialize WebSocket connection
   */
  private initWebSocket(): void {
    const socketEndpoint = this.getAttribute('socket-endpoint') || 'http://localhost:3000';
    
    // Check if Socket.IO is available
    if (typeof window.io === 'undefined') {
      console.error('Socket.IO client is not available. Make sure to include socket.io-client before loading this component.');
      this.addSystemMessage('Chat connection unavailable. Socket.IO client not loaded.');
      return;
    }
    
    try {
      this.socket = window.io(socketEndpoint);
      
      if (this.socket) {
        // Connection events
        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.socketConnected = true;
          this.updateConnectionStatus(true);
        });
        
        // Message events
        this.socket.on('message', (data: any) => {
          // Process incoming message data
          this.handleIncomingMessage(data);
        });
        
        this.socket.on('typing', () => {
          this.showTypingIndicator();
        });
        
        this.socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
          this.socketConnected = false;
          this.updateConnectionStatus(false);
        });
        
        // Error handling
        this.socket.on('error', (error: any) => {
          console.error('WebSocket error:', error);
          this.addSystemMessage(`Error: ${error.message || 'Connection error'}`);
        });
      }
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.addSystemMessage('Failed to connect to chat server');
    }
  }
  
  /**
   * Update connection status indicator
   */
  private updateConnectionStatus(connected: boolean): void {
    // Remove existing status element if any
    const existingStatus = this.shadow.querySelector('.connection-status');
    if (existingStatus) {
      existingStatus.remove();
    }
    
    // Create status element
    const statusElement = document.createElement('div');
    statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    statusElement.textContent = connected ? 'Connected' : 'Disconnected';
    
    // Insert after header
    const header = this.shadow.querySelector('.jive-chatbot-header');
    if (header && header.nextSibling) {
      this.container.insertBefore(statusElement, header.nextSibling);
    } else {
      this.container.appendChild(statusElement);
    }
    
    // Remove after a few seconds if connected
    if (connected) {
      setTimeout(() => {
        statusElement.remove();
      }, 3000);
    }
  }
  
  /**
   * Handle typing indicator
   */
  private handleTypingIndicator(): void {
    if (!this.socket || !this.socketConnected) return;
    
    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Send typing event
    this.socket.emit('typing', { isTyping: true });
    
    // Set timeout to clear typing indicator
    this.typingTimeout = setTimeout(() => {
      if (this.socket) {
        this.socket.emit('typing', { isTyping: false });
      }
    }, 2000);
  }
  
  /**
   * Show typing indicator in chat
   */
  private showTypingIndicator(): HTMLDivElement {
    // Remove any existing typing indicator
    this.hideTypingIndicator();
    
    // Create typing indicator
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    
    this.chatContainer.appendChild(indicator);
    this.scrollToBottom();
    
    return indicator;
  }
  
  /**
   * Hide typing indicator
   */
  private hideTypingIndicator(): void {
    const indicator = this.shadow.querySelector('.typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  /**
   * Handle incoming message from WebSocket
   */
  private handleIncomingMessage(data: any): void {
    // Hide typing indicator if present
    this.hideTypingIndicator();
    
    // Add message to chat
    if (data.type === 'bot') {
      this.addBotMessage(data.text);
    } else if (data.type === 'system') {
      this.addSystemMessage(data.text);
    }
  }
  
  /**
   * Public method to programmatically send a message
   */
  public sendMessageProgrammatically(text: string): void {
    if (text && text.trim()) {
      this.addUserMessage(text);
      
      // Send message via WebSocket if connected
      if (this.socket && this.socketConnected) {
        this.socket.emit('message', {
          text,
          timestamp: Date.now()
        });
        
        // Show typing indicator
        this.showTypingIndicator();
      } else {
        // Fallback if not connected
        setTimeout(() => {
          this.addBotMessage('Sorry, I\'m not connected to the server. Please try again later.');
        }, 1000);
      }
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('message-sent', {
        bubbles: true,
        composed: true,
        detail: { message: text }
      }));
    }
  }
  
  /**
   * Send a message to the chatbot
   */
  private sendMessage(): void {
    const input = this.shadow.querySelector('input') as HTMLInputElement;
    const message = input.value.trim();
    
    if (message) {
      this.sendMessageProgrammatically(message);
      input.value = '';
    }
  }
  
  /**
   * Add a user message to the chat
   */
  private addUserMessage(text: string): void {
    const message = document.createElement('div');
    message.className = 'jive-message jive-message-user';
    message.textContent = text; // User messages don't need markdown
    
    this.chatContainer.appendChild(message);
    this.scrollToBottom();
  }
  
  /**
   * Add a bot message to the chat
   */
  private async addBotMessage(text: string): Promise<void> {
    const message = document.createElement('div');
    message.className = 'jive-message jive-message-bot';
    
    try {
      // Convert markdown to HTML with proper configuration
      const html = await marked.parse(text, {
        breaks: true,  // Enable line breaks
        gfm: true,     // Enable GitHub Flavored Markdown
        async: true    // Use async parsing
      });
      
      message.innerHTML = html;
      
      // Add syntax highlighting for code blocks
      const codeBlocks = message.querySelectorAll('pre code');
      codeBlocks.forEach((block) => {
        block.classList.add('language-javascript');
      });
      
      this.chatContainer.appendChild(message);
      this.scrollToBottom();
      
      // Dispatch event
      this.dispatchEvent(new CustomEvent('message-received', {
        bubbles: true,
        composed: true,
        detail: { message: text }
      }));
    } catch (error) {
      console.error('Error parsing markdown:', error);
      // Fallback to plain text if markdown parsing fails
      message.textContent = text;
      this.chatContainer.appendChild(message);
      this.scrollToBottom();
    }
  }
  
  /**
   * Add a system message to the chat
   */
  private addSystemMessage(text: string): void {
    const message = document.createElement('div');
    message.className = 'jive-message jive-message-system';
    message.style.alignSelf = 'center';
    message.style.backgroundColor = '#ffe8e8';
    message.style.color = '#d32f2f';
    message.style.fontSize = '12px';
    message.style.padding = '8px 12px';
    message.textContent = text; // System messages don't need markdown
    
    this.chatContainer.appendChild(message);
    this.scrollToBottom();
  }
  
  /**
   * Scroll the chat container to the bottom
   */
  private scrollToBottom(): void {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
  
  /**
   * Called when the element is inserted into the DOM
   */
  connectedCallback(): void {
    // Initialize WebSocket connection
    this.initWebSocket();
    
    // Add welcome message if provided
    const welcomeMessage = this.getAttribute('welcome-message');
    if (welcomeMessage) {
      this.addBotMessage(welcomeMessage);
    } else {
      this.addBotMessage('Hello! How can I help you today?');
    }
  }
  
  /**
   * Called when the element is removed from the DOM
   */
  disconnectedCallback(): void {
    // Clean up WebSocket connection
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clear any timeouts
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }
  
  /**
   * Called when attributes are changed
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return;
    
    switch (name) {
      case 'theme':
        this.updateTheme(newValue);
        break;
      case 'position':
        this.updatePosition(newValue);
        break;
      case 'socket-endpoint':
        // Reconnect WebSocket if endpoint changes
        if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
        }
        this.initWebSocket();
        break;
      case 'welcome-message':
        // Only update welcome message if the chat is empty
        if (this.chatContainer && this.chatContainer.childNodes.length === 0) {
          this.addBotMessage(newValue);
        }
        break;
      case 'company-name':
        const title = this.shadow.querySelector('.jive-chatbot-title');
        if (title) title.textContent = newValue;
        break;
    }
  }
  
  /**
   * Update the theme colors
   */
  private updateTheme(theme: string): void {
    // Parse theme (expected format: primary:secondary)
    const colors = theme.split(':');
    if (colors.length >= 1) {
      this.style.setProperty('--primary-color', colors[0]);
    }
    if (colors.length >= 2) {
      this.style.setProperty('--secondary-color', colors[1]);
    }
  }
  
  /**
   * Update the position of the widget
   */
  private updatePosition(position: string): void {
    const container = this.container;
    
    // Reset positions
    container.style.top = '';
    container.style.right = '';
    container.style.bottom = '';
    container.style.left = '';
    
    // Set new position
    switch (position) {
      case 'top-right':
        container.style.top = '20px';
        container.style.right = '20px';
        break;
      case 'top-left':
        container.style.top = '20px';
        container.style.left = '20px';
        break;
      case 'bottom-left':
        container.style.bottom = '20px';
        container.style.left = '20px';
        break;
      default: // bottom-right is default
        container.style.bottom = '20px';
        container.style.right = '20px';
    }
  }
} 