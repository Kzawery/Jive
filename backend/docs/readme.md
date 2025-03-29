# Markdown API Backend

This is a simple backend service that provides an API to list and retrieve markdown files.

## API Endpoints

### List Markdown Files

```
GET /api/markdown
```

Returns a list of all markdown files in the configured directory.

### Get Markdown File Content

```
GET /api/markdown/:filename
```

Returns the content of a specific markdown file.

## Environment Variables

- `PORT`: The port number to run the server on (default: 3000)
- `MARKDOWN_DIR`: The directory to scan for markdown files (default: parent directory)

## Usage

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run in production mode
npm start
``` 