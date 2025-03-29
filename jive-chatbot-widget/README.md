# Jive Chatbot Widget

A customizable web component for embedding an AI-powered support chatbot into business websites.

## Features

- Lightweight and framework-agnostic (works with any website)
- Responsive design that adapts to different screen sizes
- Customizable appearance (themes, positioning, branding)
- Support for rich message content and file attachments
- Built using Web Components standard for maximum compatibility

## Installation

### NPM

```bash
npm install jive-chatbot-widget
```

### CDN

```html
<script src="https://cdn.example.com/jive-chatbot/jive-chatbot.min.js"></script>
```

## Basic Usage

Add the following HTML to your website:

```html
<jive-chatbot 
  api-endpoint="https://your-api-endpoint.com" 
  company-name="Your Company" 
  welcome-message="Hello! How can I help you today?">
</jive-chatbot>
```

## Configuration Options

| Attribute | Description | Default |
|-----------|-------------|---------|
| `api-endpoint` | The endpoint URL for your chatbot API | Required |
| `company-name` | Your company name shown in the header | "Jive Support" |
| `welcome-message` | Initial message shown to users | "Hello! How can I help you today?" |
| `theme` | Custom theme colors (format: "primary:secondary") | "#4a90e2:#f2f2f2" |
| `position` | Widget position (top-right, top-left, bottom-right, bottom-left) | "bottom-right" |
| `company-logo` | URL to your company logo | none |

## Advanced Usage

### JavaScript API

```javascript
// Get reference to the chatbot element
const chatbot = document.querySelector('jive-chatbot');

// Programmatically send a message
chatbot.sendMessageProgrammatically('Hello from JavaScript!');

// Listen for events
chatbot.addEventListener('message-sent', (event) => {
  console.log('User sent message:', event.detail.message);
});

chatbot.addEventListener('message-received', (event) => {
  console.log('Bot response:', event.detail.message);
});
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/your-organization/jive-chatbot-widget.git

# Install dependencies
cd jive-chatbot-widget
npm install

# Start development server
npm run build:watch
```

### Build

```bash
# Build for production
npm run build
```

### Test

```bash
# Run tests
npm test
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- IE11 with polyfills

## License

MIT 