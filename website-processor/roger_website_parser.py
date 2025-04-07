import json
import re
import os
import sys
import time
from urllib.parse import urlparse
from collections import defaultdict
import difflib
from enhanced_logging import add_logging_to_processor, add_progress_tracking

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
        # Logger will be added by the decorator
    
    def process(self):
        """Main processing function"""
        start_time = time.time()
        self.logger.info(f"Processing file: {self.input_file}")
        
        # Load and parse the data
        if not self._load_data():
            return False
        
        load_time = time.time()
        self.logger.info(f"Successfully loaded {len(self.pages)} pages in {load_time - start_time:.2f} seconds")
        
        # Create all nodes
        self._create_nodes()
        nodes_time = time.time()
        self.logger.info(f"Created nodes in {nodes_time - load_time:.2f} seconds")
        
        # Build the tree structure
        self._build_tree_structure()
        tree_time = time.time()
        self.logger.info(f"Built tree structure in {tree_time - nodes_time:.2f} seconds")
        
        # Extract common blocks
        self._extract_common_blocks()
        extract_time = time.time()
        self.logger.info(f"Extracted common blocks in {extract_time - tree_time:.2f} seconds")
        
        # Replace common blocks in content
        self._replace_common_blocks_in_content()
        replace_time = time.time()
        self.logger.info(f"Replaced common blocks in {replace_time - extract_time:.2f} seconds")
        
        # Export the processed data
        self._export_data()
        export_time = time.time()
        self.logger.info(f"Exported data in {export_time - replace_time:.2f} seconds")
        
        total_time = time.time() - start_time
        self.logger.info(f"Processing complete. Total time: {total_time:.2f} seconds")
        self.logger.info(f"Output saved to: {self.output_file}")
        return True
    
    def _load_data(self):
        """Load and parse the JSON data from the input file"""
        try:
            self.logger.info(f"Loading data from {self.input_file}")
        with open(self.input_file, 'r', encoding='utf-8') as f:
            content = f.read()
                self.pages = json.loads(content)
            self.logger.info(f"Successfully parsed JSON with {len(self.pages)} pages")
            return True
        except (json.JSONDecodeError, FileNotFoundError) as e:
            self.logger.error(f"Error loading data: {e}")
                return False
    
    def _create_nodes(self):
        """Create nodes for all pages"""
        self.logger.info("Creating nodes for all pages")
        
        # Extract domain from the first page
        first_url = self.pages[0]["url"]
        parsed_url = urlparse(first_url)
        self.domain = parsed_url.netloc
        self.logger.info(f"Domain detected: {self.domain}")
        
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
        created_count = 1  # Already created the master node
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
                    self.logger.debug(f"Updated master node with data from {url}")
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
            created_count += 1
            
            # Log progress periodically
            if created_count % 500 == 0:
                self.logger.info(f"Created {created_count} nodes so far...")
        
        self.logger.info(f"Created {created_count} nodes in total")
    
    def _build_tree_structure(self):
        """Build the tree structure based on paths"""
        self.logger.info("Building tree structure based on paths")
        
        # Process all nodes except the master node
        connected_count = 0
        orphan_count = 0
        
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
                    connected_count += 1
                            break
            
            # If no parent found, attach to master node
            if not parent_found:
                self.master_node.add_child(node)
                orphan_count += 1
            
            # Log progress periodically
            if (connected_count + orphan_count) % 500 == 0:
                self.logger.info(f"Connected {connected_count + orphan_count} nodes so far...")
        
        # Verify tree structure
        total_nodes = len(self.nodes_by_path)
        self.logger.info(f"Tree structure built: {connected_count} nodes connected to parents, "
                        f"{orphan_count} orphaned nodes attached to root")
        
        # Check for duplicate paths
        path_counts = defaultdict(int)
        for path in self.nodes_by_path:
            path_counts[path] += 1
        
        duplicate_paths = [path for path, count in path_counts.items() if count > 1]
        if duplicate_paths:
            self.logger.warning(f"Found {len(duplicate_paths)} duplicate paths")
            for path in duplicate_paths[:5]:  # Show first 5
                self.logger.warning(f"  Duplicate path: {path}")
            if len(duplicate_paths) > 5:
                self.logger.warning(f"  ...and {len(duplicate_paths) - 5} more")

    def _extract_common_blocks(self, use_ai = False):
        """Find and extract common content blocks"""
        self.logger.info("Extracting common content blocks")
        
        # First, extract predefined blocks (header, footer, etc.)
        self._extract_predefined_blocks()
        predefined_count = len(self.common_blocks)
        self.logger.info(f"Extracted {predefined_count} predefined common blocks")
        if use_ai:
            # Then, intelligently detect other repeated blocks
            self._detect_repeated_content_blocks()
        total_count = len(self.common_blocks)
        auto_detected_count = total_count - predefined_count
        self.logger.info(f"Auto-detected {auto_detected_count} additional common blocks")
        
        self.logger.info(f"Total common blocks extracted: {total_count}")
    
    def _extract_predefined_blocks(self):
        """Extract commonly known blocks like headers and footers"""
        self.logger.info("Extracting predefined content blocks (header, footer, etc.)")
        
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
            
            self.logger.info(f"Identified common header used on {len(header_pages)} pages")
        
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
                
                self.logger.info(f"Identified common footer used on {len(footer_pages)} pages")
        
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
                
                self.logger.info(f"Identified predefined useful links section on {len(links_pages)} pages")
    
    def _detect_repeated_content_blocks(self):
        """Intelligently detect repeated content blocks across pages"""
        import re
        import difflib
        from collections import defaultdict
        
        self.logger.info("Starting intelligent content block detection")
        
        # Parameters for content block detection
        MIN_BLOCK_LENGTH = 40        # Minimum characters for a content block
        MIN_OCCURRENCES = 3          # Minimum number of pages a block must appear on
        SIMILARITY_THRESHOLD = 0.85  # How similar blocks need to be (0-1)
        MAX_CHUNKS = 10000           # Limit total chunks to analyze
        CHUNK_MIN_LENGTH = 60        # Increase minimum chunk length
        
        # Step 1: Split content into potential blocks
        self.logger.info("Splitting content into potential blocks for analysis")
        all_chunks = []
        
        for i, page in enumerate(self.pages):
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
                if not chunk or len(chunk) < CHUNK_MIN_LENGTH:
                    continue
                    
                all_chunks.append({
                    "url": url,
                    "content": chunk,
                    "length": len(chunk)
                })
        
            # Log progress periodically
            if i % 500 == 0 and i > 0:
                self.logger.info(f"Processed {i} pages, extracted {len(all_chunks)} chunks so far...")
        
        # Limit the number of chunks if too many
        if len(all_chunks) > MAX_CHUNKS:
            self.logger.warning(f"Too many chunks ({len(all_chunks)}). Limiting to {MAX_CHUNKS} longest chunks for analysis.")
            all_chunks.sort(key=lambda x: x["length"], reverse=True)
            all_chunks = all_chunks[:MAX_CHUNKS]
            self.logger.info(f"Selected {len(all_chunks)} chunks for comparison")
        
        self.logger.info(f"Extracted {len(all_chunks)} content chunks for analysis")
        
        # Step 2: Find similar chunks
        self.logger.info("Finding similar chunks that appear across multiple pages")
        # Group chunks that likely represent the same content block
        chunk_groups = []
        processed_indices = set()
        
        # Track progress
        total_comparisons = len(all_chunks) * (len(all_chunks) - 1) // 2
        progress_step = max(1, total_comparisons // 20)  # Log 20 times
        comparisons_done = 0
        
        self.logger.info(f"Beginning similarity comparison of {len(all_chunks)} chunks (approx. {total_comparisons:,} comparisons)")
        
        for i, chunk1 in enumerate(all_chunks):
            if i in processed_indices:
                continue
                
            # Find similar chunks
            similar_chunks = []
            urls_in_group = set([chunk1["url"]])
            
            for j, chunk2 in enumerate(all_chunks):
                comparisons_done += 1
                if comparisons_done % progress_step == 0:
                    percent_done = (comparisons_done / total_comparisons) * 100
                    self.logger.info(f"Comparison progress: {percent_done:.1f}% ({comparisons_done:,}/{total_comparisons:,})")
                
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
            
            # Log progress periodically
            if i % progress_step == 0 and i > 0:
                self.logger.info(f"Analyzed {i}/{len(all_chunks)} chunks ({i/len(all_chunks)*100:.1f}%), "
                                f"found {len(chunk_groups)} potential block groups so far...")
        
        self.logger.info(f"Found {len(chunk_groups)} potential repeated content blocks")
        
        # Step 3: Classify and add repeated blocks
        self.logger.info("Classifying and adding repeated blocks")
        blocks_added = 0
        
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
            
            blocks_added += 1
            
            # Log details of this block
            content_preview = rep_chunk["content"][:50] + "..." if len(rep_chunk["content"]) > 50 else rep_chunk["content"]
            self.logger.info(f"Added auto-detected block {block_id} ({block_name}): "
                           f"Type: {block_type}, Occurrences: {len(occurrence_urls)}, "
                           f"Preview: {content_preview}")
            
            # Log progress periodically
            if blocks_added % 10 == 0 and blocks_added > 0:
                self.logger.info(f"Added {blocks_added}/{len(chunk_groups)} blocks so far...")
        
        self.logger.info(f"Added {blocks_added} auto-detected blocks to the common blocks dictionary")
    
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
        self.logger.info("Replacing common blocks in node content with references")
        
        # First, create a list of all blocks to replace
        blocks_to_replace = []
        for block_id, block in self.common_blocks.items():
            blocks_to_replace.append({
                "id": block_id,
                "name": block["name"],
                "content": block["content"],
                "occurrences": block["occurrences"],
                "is_auto": block.get("auto_detected", False)
            })
        
        # Sort blocks by length (descending) to handle nested blocks correctly
        # This ensures larger blocks are replaced before smaller ones that might be inside them
        blocks_to_replace.sort(key=lambda x: len(x["content"]), reverse=True)
        self.logger.info(f"Prepared {len(blocks_to_replace)} blocks for replacement (sorted by size)")
        
        # Process each node
        processed_count = 0
        replacement_count = 0
        
        for path, node in self.nodes_by_path.items():
            # Skip nodes without content
            if not hasattr(node, 'content') or not node.content:
                continue
            
            # Get the node's content and URL (for occurrence checking)
            content = node.content
            node_url = node.full_url if hasattr(node, 'full_url') else None
            
            # Initialize or reset common blocks used dictionary
            node.common_blocks_used = {}
            
            # Track replacements to handle overlapping blocks
            replacements = []
            
            # Try to replace each common block
            for block in blocks_to_replace:
                block_content = block["content"]
                block_id = block["id"]
                block_name = block["name"]
                
                # Skip if this node's URL isn't in occurrences and we have URL info
                if node_url and node_url not in block["occurrences"] and not block.get("is_auto", False):
                    continue
                
                # For now, use exact matching for all blocks (simplified)
                start_pos = 0
                while True:
                    # Find the next occurrence of this block
                    pos = content.find(block_content, start_pos)
                    if pos == -1:
                        break
                    
                    # Record this replacement
                    replacements.append({
                        "start": pos,
                        "end": pos + len(block_content),
                        "replacement": f"[{block_name}]",
                        "block_id": block_id
                    })
                    
                    # Move past this occurrence
                    start_pos = pos + len(block_content)
            
            # Apply replacements (in reverse order to maintain positions)
            # Sort by start position in descending order
            replacements.sort(key=lambda x: x["start"], reverse=True)
            
            # Remove overlapping replacements
            non_overlapping = self._remove_overlapping_replacements(replacements)
            
            # Apply the replacements
            for replacement in non_overlapping:
                # Mark this block as used
                node.common_blocks_used[replacement["block_id"]] = blocks_to_replace[
                    next(i for i, b in enumerate(blocks_to_replace) if b["id"] == replacement["block_id"])
                ]["name"]
                
                # Apply the replacement
                content = content[:replacement["start"]] + replacement["replacement"] + content[replacement["end"]:]
                replacement_count += 1
            
            # Store the processed content
            node.processed_content = content
            processed_count += 1
            
            # Log progress periodically
            if processed_count % 500 == 0:
                self.logger.info(f"Processed {processed_count} nodes, made {replacement_count} replacements so far...")
        
        self.logger.info(f"Completed block replacement. Processed {processed_count} nodes with content.")
        self.logger.info(f"Made {replacement_count} block replacements in total.")
        
        # Log details about blocks that were most frequently used
        block_usage = defaultdict(int)
        for node in self.nodes_by_path.values():
            if hasattr(node, 'common_blocks_used'):
                for block_id in node.common_blocks_used:
                    block_usage[block_id] += 1
        
        # Sort blocks by usage
        if block_usage:
            self.logger.info("Most frequently used blocks:")
            for block_id, count in sorted(block_usage.items(), key=lambda x: x[1], reverse=True)[:10]:
                if block_id in self.common_blocks:
                    block_name = self.common_blocks[block_id]["name"]
                    self.logger.info(f"  {block_name} ({block_id}): Used on {count} pages")
    
    def _remove_overlapping_replacements(self, replacements):
        """Remove overlapping replacements, keeping the largest ones"""
        if not replacements:
            return []
        
        # Create a list to track which positions are already covered
        covered_positions = set()
        final_replacements = []
        
        for r in replacements:
            # Check if this replacement overlaps with existing covered positions
            positions = set(range(r["start"], r["end"]))
            if not positions.intersection(covered_positions):
                # No overlap, add this replacement
                final_replacements.append(r)
                covered_positions.update(positions)
        
        self.logger.debug(f"Filtered {len(replacements)} potential replacements to {len(final_replacements)} non-overlapping ones")
        return final_replacements
    
    def _export_data(self):
        """Export the processed data to a JSON file"""
        self.logger.info(f"Exporting processed data to {self.output_file}")
        
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
        
        # Calculate stats
        total_content_size = sum(len(node.content) if hasattr(node, 'content') and node.content else 0 
                               for node in self.nodes_by_path.values())
        
        processed_content_size = sum(len(node.processed_content) if hasattr(node, 'processed_content') and node.processed_content else 0 
                                   for node in self.nodes_by_path.values())
        
        if total_content_size > 0:
            savings_percentage = (total_content_size - processed_content_size) / total_content_size * 100
            self.logger.info(f"Content size reduction: {total_content_size:,} -> {processed_content_size:,} bytes "
                           f"({savings_percentage:.1f}% savings)")
        
        self.logger.info(f"Export complete. Saved {len(self.nodes_by_path)} nodes and {len(self.common_blocks)} common blocks.")
    
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
        if hasattr(node, 'processed_content') and node.processed_content:
            result["content"] = node.processed_content
        elif hasattr(node, 'content') and node.content:
            result["content"] = node.content
        
        # Add common blocks used
        if hasattr(node, 'common_blocks_used') and node.common_blocks_used:
            result["common_blocks"] = node.common_blocks_used
        
        # Add children recursively
        if hasattr(node, 'children') and node.children:
            result["children"] = [self._node_to_dict(child) for child in node.children]
        
        return result


# Apply logging enhancements to the processor class
PathBasedWebsiteProcessor = add_logging_to_processor(PathBasedWebsiteProcessor)
PathBasedWebsiteProcessor = add_progress_tracking(PathBasedWebsiteProcessor)

def main():
    if len(sys.argv) < 3:
        print("Usage: python roger_parser_with_logging.py <input_file> <output_file>")
        return 1
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Check if input file exists
    if not os.path.isfile(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        return 1
    
    # Process the website data
    processor = PathBasedWebsiteProcessor(input_file, output_file)
    
    if processor.process():
        print("Processing completed successfully.")
        return 0
    else:
        print("Processing failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())