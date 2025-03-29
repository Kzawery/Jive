/**
 * Position options for the chatbot widget
 */
export type ChatbotPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/**
 * Message type definitions
 */
export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

/**
 * Attachment type for file uploads or rich content
 */
export interface Attachment {
  type: 'image' | 'file' | 'document' | 'citation';
  url?: string;
  name?: string;
  size?: number;
  preview?: string;
  mime?: string;
  citation?: {
    source: string;
    text: string;
    url?: string;
  };
}

/**
 * Event types for chatbot
 */
export interface MessageSentEvent extends CustomEvent {
  detail: {
    message: string;
    attachments?: Attachment[];
  };
}

export interface MessageReceivedEvent extends CustomEvent {
  detail: {
    message: string;
    attachments?: Attachment[];
  };
}

/**
 * Configuration options for the chatbot
 */
export interface ChatbotConfig {
  apiEndpoint: string;
  companyName?: string;
  welcomeMessage?: string;
  theme?: string;
  position?: ChatbotPosition;
  companyLogo?: string;
}

/**
 * API Response structure
 */
export interface ChatbotResponse {
  text: string;
  attachments?: Attachment[];
  citations?: Attachment[];
  metadata?: Record<string, unknown>;
} 