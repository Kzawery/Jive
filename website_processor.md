# Path-Based Website Structure Processor

Transform web crawler output into a clean, hierarchical, path-based representation of a website with automatic detection of common content patterns.

## Overview

This toolkit processes web crawler output data into a well-organized tree structure where:

1. **Only the master (root) node has a full URL** - All other nodes use relative paths
2. **Multiple paths can lead to the same content** - Supporting a deeper, more flexible structure
3. **Common content is extracted and centralized** - Repeated elements are stored once and referenced

## Key Features

- **Path-Based Hierarchy**: Organizes pages by path rather than full URLs
- **Common Block Detection**: Automatically identifies and extracts repeated content
- **Dictionary-Based Content**: Replaces duplicated content with references
- **Interactive Visualization**: Includes tools to explore the processed structure
- **Flexible Node Organization**: Supports multiple navigation paths to the same content

## Components

The toolkit consists of these Python scripts:

1. **`path_based_processor.py`**: The main processor that transforms URLs into a path-based structure
2. **`run_path_processor.py`**: A simple script to run the processor with command-line arguments
3. **`path_based_visualizer.py`**: An interactive tool to explore the processed structure

## Requirements

- Python 3.6 or higher
- `rich` library for the visualizer (install with `pip install rich`)

## Installation

1. Clone or download this repository
2. Install required packages:
   ```
   pip install rich
   ```

## Usage

### Basic Usage

1. **Process the crawler output**:
   ```
   python run_path_processor.py paste.txt roger_website_structure_path_based.json
   ```

2. **Explore the processed structure**:
   ```
   python path_based_visualizer.py roger_website_structure_path_based.json
   ```

### Visualizer Commands

In the interactive visualizer, use these commands:

- `help` - Show available commands
- `summary` - Display a summary of the website structure
- `tree [depth]` - Display the website structure as a tree (optional depth)
- `blocks` - List all common content blocks
- `block [id]` - Display details for a specific content block
- `home` or `root` - Navigate to the root node
- `navigate [path]` - Navigate to a specific path
- `search [query]` - Search for nodes containing the query
- `exit` or `quit` - Exit the visualizer

## Structure Format

The processor generates a JSON file with this structure:

```json
{
  "website": {
    "master_node": {
      "path": "/",
      "url": "https://example.com/",
      "title": "Homepage Title",
      "children": [
        {
          "path": "/section1",
          "title": "Section 1",
          "content": "Page content with [site_header] and [site_footer] references",
          "common_blocks": {
            "header": "site_header",
            "footer": "site_footer"
          },
          "children": [...]
        },
        ...
      ]
    },
    "domain": "example.com",
    "pages": 42,
    "nodes": 38,
    "common_blocks": 5
  },
  "common_blocks": {
    "header": {
      "name": "site_header",
      "type": "header",
      "content": "Actual header content",
      "occurrences": ["https://example.com/", "https://example.com/section1/", ...]
    },
    ...
  }
}
```

## How It Works

### Path-Based Organization

Unlike traditional URL-based approaches, this processor:

1. Uses **paths as the primary identifier** for each node
2. Keeps the full URL information only in the master (root) node
3. Builds a hierarchical tree based on path segments

This approach makes it easier to:
- Navigate through the site structure
- Handle cases where different URLs lead to the same content
- Create logical groupings beyond the strict URL hierarchy

### Node Creation Process

1. **Extract Paths**: Convert URLs into path components
2. **Create Master Node**: Generate the root node with the domain's full URL
3. **Create Child Nodes**: Convert each page to a node with a path property
4. **Build Relationships**: Connect nodes by analyzing path segments
5. **Handle Orphans**: Attach any disconnected nodes to the master node

### Common Block Processing

The system identifies repeated content patterns like:
- Headers and footers
- Navigation menus
- Link sections
- Repeated boilerplate text

These blocks are extracted into a central dictionary and replaced with references in the content, significantly reducing redundancy.

## Customization

You can customize the processor by modifying:

- The `_extract_common_blocks()` method to detect different patterns
- The `_build_tree_structure()` method to change hierarchy rules
- Output format in the `_export_data()` method

## Use Cases

- **Content Analysis**: Understand content distribution and duplication
- **Navigation Mapping**: Create cleaner site maps based on paths
- **SEO Optimization**: Identify structural issues and content patterns
- **Site Migrations**: Map current site structure for rebuilding
- **Documentation**: Generate path-based navigation guides

## Extending the Toolkit

This path-based approach can be extended to:

1. **Support Virtual Paths**: Create logical groupings beyond actual URL paths
2. **Handle Multiple Domains**: Process sites that span multiple domains
3. **Track Content Changes**: Version control for website content
4. **Generate Navigation**: Create site maps and navigation menus

## License

This toolkit is provided for educational and personal use.