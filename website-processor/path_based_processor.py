import json
import re
import os
from urllib.parse import urlparse
from collections import defaultdict

class WebsiteNode:
    def __init__(self, path="", title="", content="", category="", is_product=False):
        self.path = path
        self.title = title
        self.content = content
        self.category = category
        self.is_product = is_product
        self.children = []
        self.parent = None
        self.full_url = None  # Only used for the master node
        self.common_blocks_used = {}
        self.processed_content = None
    
    def add_child(self, child_node):
        """Add a child node and set its parent reference"""
        self.children.append(child_node)
        child_node.parent = self
    
    def __repr__(self):
        """String representation of the node"""
        return f"Node(path='{self.path}', title='{self.title}', children={len(self.children)})"

class PathBasedWebsiteProcessor:
    def __init__(self, input_file, output_file):
        self.input_file = input_file
        self.output_file = output_file
        self.pages = []
        self.common_blocks = {}
        self.master_node = None
        self.nodes_by_path = {}
        self.nodes_by_url = {}
        self.domain = None
    
    def process(self):
        """Main processing function"""
        print(f"Processing file: {self.input_file}")
        
        # Load and parse the data
        if not self._load_data():
            return False
        
        print(f"Successfully loaded {len(self.pages)} pages")
        
        # Create all nodes
        self._create_nodes()
        
        # Build the tree structure
        self._build_tree_structure()
        
        # Extract common blocks
        self._extract_common_blocks()
        
        # Replace common blocks in content
        self._replace_common_blocks_in_content()
        
        # Export the processed data
        self._export_data()
        
        print(f"Processing complete. Output saved to: {self.output_file}")
        return True
    
    def _load_data(self):
        """Load and parse the JSON data from the input file"""
        try:
            with open(self.input_file, 'r', encoding='utf-8') as f:
                content = f.read()
                self.pages = json.loads(content)
            return True
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading data: {e}")
            return False
    
    def _create_nodes(self):
        """Create nodes for all pages"""
        # Extract domain from the first page
        first_url = self.pages[0]["url"]
        parsed_url = urlparse(first_url)
        self.domain = parsed_url.netloc
        
        # Create the master (root) node
        self.master_node = WebsiteNode(
            path="/",
            title=f"{self.domain} Homepage",
            category="root"
        )
        self.master_node.full_url = f"https://{self.domain}/"
        
        # Track nodes by path and URL
        self.nodes_by_path["/"] = self.master_node
        self.nodes_by_url[f"https://{self.domain}/"] = self.master_node
        
        # Create nodes for all pages
        for page in self.pages:
            url = page["url"]
            parsed_url = urlparse(url)
            
            # Skip if this is the homepage (already created as master node)
            if parsed_url.path == "/" or parsed_url.path == "":
                # Update master node with homepage data if available
                if url == f"https://{self.domain}/":
                    self.master_node.title = page["title"]
                    self.master_node.content = page["content"]
                    self.master_node.category = page["category"]
                    self.master_node.is_product = page["is_product"]
                continue
            
            # Create path
            path = parsed_url.path
            if not path.startswith("/"):
                path = "/" + path
            
            # Create node
            node = WebsiteNode(
                path=path,
                title=page["title"],
                content=page["content"],
                category=page.get("category", ""),
                is_product=page.get("is_product", False)
            )
            
            # Store in lookup dictionaries
            self.nodes_by_path[path] = node
            self.nodes_by_url[url] = node
        
        print(f"Created {len(self.nodes_by_path)} nodes")
    
    def _build_tree_structure(self):
        """Build the tree structure based on paths"""
        # Process all nodes except the master node
        for path, node in self.nodes_by_path.items():
            if path == "/":  # Skip master node
                continue
            
            # Find parent path
            path_parts = path.strip("/").split("/")
            
            # Try different parent paths, starting with the most specific
            parent_found = False
            
            for i in range(len(path_parts)-1, -1, -1):
                if i == 0:
                    # If we're down to the top level, the parent is the root
                    parent_path = "/"
                else:
                    # Otherwise, try the path up to this level
                    parent_path = "/" + "/".join(path_parts[:i]) + "/"
                
                if parent_path in self.nodes_by_path:
                    parent_node = self.nodes_by_path[parent_path]
                    parent_node.add_child(node)
                    parent_found = True
                    break
            
            # If no parent found, attach to master node
            if not parent_found:
                self.master_node.add_child(node)
        
        # Verify tree structure
        orphan_count = 0
        for path, node in self.nodes_by_path.items():
            if path != "/" and node.parent is None:
                orphan_count += 1
                # Attach orphans to master node
                self.master_node.add_child(node)
        
        if orphan_count > 0:
            print(f"Warning: Found {orphan_count} orphaned nodes, attached to master node")
        
        # Check for duplicate paths
        path_counts = defaultdict(int)
        for path in self.nodes_by_path:
            path_counts[path] += 1
        
        duplicate_paths = [path for path, count in path_counts.items() if count > 1]
        if duplicate_paths:
            print(f"Warning: Found {len(duplicate_paths)} duplicate paths")
    
    def _extract_common_blocks(self):
    """Intelligently find and extract common content blocks"""
    # Start with the predefined blocks (header, footer, etc.)
    self._extract_predefined_blocks()
    
    # Then intelligently detect other common patterns
    self._detect_repeated_content_blocks()
    
    print(f"Total common blocks extracted: {len(self.common_blocks)}")

def _extract_predefined_blocks(self):
    """Extract commonly known blocks like headers and footers"""
    # Find the header (common at the start of pages)
    header_pattern = "Przykłady instalacji produktów Roger"
    header_pages = [page for page in self.pages if page["content"].startswith(header_pattern)]
    
    if len(header_pages) > len(self.pages) / 2:
        # This is a common header, extract it
        sample_page = header_pages[0]["content"]
        header_end = sample_page.find("\n") if "\n" in sample_page else 38
        header_content = sample_page[:header_end].strip()
        
        self.common_blocks["header"] = {
            "name": "site_header",
            "type": "header",
            "content": header_content,
            "occurrences": [page["url"] for page in header_pages]
        }
        
        print(f"Identified common header used on {len(header_pages)} pages")
    
    # Find the footer (common at the end of pages)
    footer_pattern = "Newsletter     Bądź na bieżąco   Na skróty       Wsparcie       Kontakt   Komunikaty"
    footer_pages = [page for page in self.pages if page["content"].endswith(footer_pattern)]
    
    if len(footer_pages) > len(self.pages) / 2:
        # This is a common footer
        sample_page = footer_pages[0]["content"]
        footer_start = sample_page.rfind("Newsletter")
        if footer_start != -1:
            footer_content = sample_page[footer_start:].strip()
            
            self.common_blocks["footer"] = {
                "name": "site_footer",
                "type": "footer",
                "content": footer_content,
                "occurrences": [page["url"] for page in footer_pages]
            }
            
            print(f"Identified common footer used on {len(footer_pages)} pages")
    
    # Extract common "przydatne linki" section
    links_pattern = "Przydatne linki"
    links_pages = [page for page in self.pages if links_pattern in page["content"]]
    
    if len(links_pages) > 2:
        sample_page = links_pages[0]["content"]
        links_start = sample_page.find(links_pattern)
        links_end = sample_page.find("Newsletter", links_start) if "Newsletter" in sample_page else -1
        
        if links_start != -1 and links_end != -1:
            links_content = sample_page[links_start:links_end].strip()
            
            self.common_blocks["useful_links"] = {
                "name": "useful_links",
                "type": "links_section",
                "content": links_content,
                "occurrences": [page["url"] for page in links_pages]
            }
            
            print(f"Identified predefined useful links section on {len(links_pages)} pages")

def _detect_repeated_content_blocks(self):
    """Intelligently detect repeated content blocks across pages"""
    import re
    import difflib
    from collections import defaultdict
    
    # Parameters for content block detection
    MIN_BLOCK_LENGTH = 40        # Minimum characters for a content block
    MIN_OCCURRENCES = 3          # Minimum number of pages a block must appear on
    SIMILARITY_THRESHOLD = 0.85  # How similar blocks need to be (0-1)
    
    # Step 1: Split content into potential blocks
    all_chunks = []
    
    for page in self.pages:
        content = page["content"]
        url = page["url"]
        
        # Skip if this page has no content
        if not content:
            continue
            
        # Split content by common delimiters
        # This is more sophisticated than just splitting on newlines - we look for 
        # section breaks, paragraph breaks, and other structural elements
        potential_delimiters = [
            r'\n\s*\n',             # Double newline (paragraph break)
            r'\s{3,}',              # Multiple spaces (often used for formatting)
            r'(?<=[.!?])\s{2,}',    # Sentence end followed by multiple spaces
            r'\s+(?=[A-Z][a-z]+\s)', # Space followed by a capitalized word (likely a new section)
        ]
        
        # Create a combined pattern
        split_pattern = '|'.join(potential_delimiters)
        chunks = re.split(split_pattern, content)
        
        # Process each chunk
        for chunk in chunks:
            # Clean and normalize the chunk
            chunk = chunk.strip()
            
            # Skip empty or very short chunks
            if not chunk or len(chunk) < MIN_BLOCK_LENGTH:
                continue
                
            all_chunks.append({
                "url": url,
                "content": chunk,
                "length": len(chunk)
            })
    
    print(f"Extracted {len(all_chunks)} content chunks for analysis")
    
    # Step 2: Find similar chunks
    # Group chunks that likely represent the same content block
    chunk_groups = []
    processed_indices = set()
    
    for i, chunk1 in enumerate(all_chunks):
        if i in processed_indices:
            continue
            
        # Find similar chunks
        similar_chunks = []
        urls_in_group = set([chunk1["url"]])
        
        for j, chunk2 in enumerate(all_chunks):
            if i == j or j in processed_indices:
                continue
                
            # Skip chunks from the same page
            if chunk2["url"] in urls_in_group:
                continue
                
            # Calculate similarity
            similarity = difflib.SequenceMatcher(None, chunk1["content"], chunk2["content"]).ratio()
            
            if similarity >= SIMILARITY_THRESHOLD:
                similar_chunks.append(j)
                urls_in_group.add(chunk2["url"])
                processed_indices.add(j)
        
        # If this chunk appears on multiple pages, consider it a repeated block
        if len(similar_chunks) >= MIN_OCCURRENCES - 1:  # -1 because we also count chunk1
            chunk_group = {
                "representative": chunk1,
                "similar_indices": similar_chunks,
                "occurrences": len(similar_chunks) + 1
            }
            chunk_groups.append(chunk_group)
            processed_indices.add(i)
    
    print(f"Found {len(chunk_groups)} potential repeated content blocks")
    
    # Step 3: Classify and add repeated blocks
    for i, group in enumerate(chunk_groups):
        # Skip very small groups (likely false positives)
        if group["occurrences"] < MIN_OCCURRENCES:
            continue
            
        # Get the representative chunk
        rep_chunk = group["representative"]
        
        # Try to classify what type of content this is
        block_type = self._classify_content_block(rep_chunk["content"])
        
        # Create a name for this block
        block_name = f"{block_type}_{i+1}"
        
        # Get all URLs where this block appears
        occurrence_urls = [rep_chunk["url"]]
        for idx in group["similar_indices"]:
            occurrence_urls.append(all_chunks[idx]["url"])
        
        # Add to common blocks
        block_id = f"auto_block_{i+1}"
        self.common_blocks[block_id] = {
            "name": block_name,
            "type": block_type,
            "content": rep_chunk["content"],
            "occurrences": occurrence_urls,
            "auto_detected": True,
            "confidence": group["occurrences"] / len(self.pages)  # Confidence score
        }
    
    print(f"Added {sum(1 for block in self.common_blocks.values() if block.get('auto_detected', False))} auto-detected blocks")

def _classify_content_block(self, content):
    """Classify the type of content in a block"""
    content_lower = content.lower()
    
    # Common content types and their detection patterns
    patterns = {
        "navigation": [r'rozwiązania', r'produkty', r'menu', r'zastosowania'],
        "product_list": [r'racs', r'produkty', r'powiązane produkty'],
        "contact_info": [r'kontakt', r'skontaktuj', r'wsparcie'],
        "links_section": [r'przydatne linki', r'gdzie kupić', r'pobierz'],
        "form_section": [r'formularz', r'rejestracja', r'logowanie'],
        "intro_section": [r'wprowadzenie', r'o produkcie', r'charakterystyka'],
        "case_study": [r'przypadek', r'realizacja', r'wdrożenie', r'case study'],
        "key_features": [r'charakterystyka', r'cechy', r'funkcje', r'dostępne'],
        "download_section": [r'pobierz', r'download', r'pliki']
    }
    
    # Check each pattern against the content
    for block_type, keywords in patterns.items():
        if any(re.search(pattern, content_lower) for pattern in keywords):
            return block_type
    
    # If no specific type is detected, use a generic content_block type
    return "content_block"
    
    def _replace_common_blocks_in_content(self):
        """Replace common blocks in node content with references"""
        # Process nodes using URL mapping
        for url, page in self.nodes_by_url.items():
            # Skip nodes without content
            if not hasattr(page, 'content') or not page.content:
                continue
                
            content = page.content
            
            # Try to replace each common block
            for block_id, block in self.common_blocks.items():
                block_content = block["content"]
                
                # Check if this page uses this block
                if url in block["occurrences"] and block_content in content:
                    # Mark this block as used on this page
                    page.common_blocks_used[block_id] = block["name"]
                    
                    # Replace the content with a reference
                    content = content.replace(block_content, f"[{block['name']}]")
            
            # Store the processed content
            page.processed_content = content
        
        # Count processed nodes
        processed_count = sum(1 for node in self.nodes_by_path.values() 
                             if hasattr(node, 'processed_content') and node.processed_content)
        print(f"Processed content for {processed_count} nodes")
    
    def _export_data(self):
        """Export the processed data to a JSON file"""
        # Prepare the export structure
        export_data = {
            "website": {
                "master_node": self._node_to_dict(self.master_node),
                "domain": self.domain,
                "pages": len(self.pages),
                "nodes": len(self.nodes_by_path),
                "common_blocks": len(self.common_blocks)
            },
            "common_blocks": self.common_blocks
        }
        
        # Write to file
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
    
    def _node_to_dict(self, node):
        """Convert a node to a dictionary for export"""
        result = {
            "path": node.path,
            "title": node.title,
            "category": node.category,
            "is_product": node.is_product,
            "children": []
        }
        
        # Add full URL only for master node
        if node.full_url:
            result["url"] = node.full_url
        
        # Add processed content if available
        if node.processed_content:
            result["content"] = node.processed_content
        elif node.content:
            result["content"] = node.content
        
        # Add common blocks used
        if node.common_blocks_used:
            result["common_blocks"] = node.common_blocks_used
        
        # Add children recursively
        if node.children:
            result["children"] = [self._node_to_dict(child) for child in node.children]
        
        return result

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Process website crawler output into a path-based structure')
    parser.add_argument('input_file', help='Input JSON file with crawler output')
    parser.add_argument('output_file', help='Output file for processed structure')
    
    args = parser.parse_args()
    
    processor = PathBasedWebsiteProcessor(args.input_file, args.output_file)
    processor.process()

if __name__ == "__main__":
    main()