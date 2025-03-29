/**
 * JiveChatbot Web Component
 * 
 * A customizable chatbot widget that can be embedded in any website
 */
export class JiveChatbot extends HTMLElement {
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private chatContainer: HTMLDivElement;
  private inputContainer: HTMLDivElement;
  
  // Define observed attributes for component configuration
  static get observedAttributes(): string[] {
    return [
      'theme',
      'position',
      'api-endpoint',
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
      }
      
      .jive-message-bot {
        align-self: flex-start;
        background-color: var(--secondary-color);
        color: var(--text-color);
      }
      
      .jive-message-user {
        align-self: flex-end;
        background-color: var(--primary-color);
        color: white;
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
   * Public method to programmatically send a message
   */
  public sendMessageProgrammatically(text: string): void {
    if (text && text.trim()) {
      this.addUserMessage(text);
      
      // Simulate response (will be replaced with actual API call)
      setTimeout(() => {
        this.addBotMessage('This is a placeholder response. The actual integration with the chatbot API will be implemented soon.');
      }, 1000);
      
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
    message.textContent = text;
    
    this.chatContainer.appendChild(message);
    this.scrollToBottom();
  }
  
  /**
   * Add a bot message to the chat
   */
  private addBotMessage(text: string): void {
    const message = document.createElement('div');
    message.className = 'jive-message jive-message-bot';
    message.textContent = text;
    
    this.chatContainer.appendChild(message);
    this.scrollToBottom();
    
    // Dispatch event
    this.dispatchEvent(new CustomEvent('message-received', {
      bubbles: true,
      composed: true,
      detail: { message: text }
    }));
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
    // Add welcome message if provided
    const welcomeMessage = this.getAttribute('welcome-message');
    if (welcomeMessage) {
      this.addBotMessage(welcomeMessage);
    } else {
      this.addBotMessage('Hello! How can I help you today?');
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