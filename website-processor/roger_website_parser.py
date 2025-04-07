import json
import re
import os
from urllib.parse import urlparse
from collections import defaultdict
import difflib

class WebsiteParser:
    def __init__(self, input_file):
        self.input_file = input_file
        self.pages = []
        self.common_blocks = {}
        self.site_hierarchy = {}
    
    def parse(self):
        """Parse the input file and process the website data"""
        # Read and parse JSON data
        with open(self.input_file, 'r', encoding='utf-8') as f:
            content = f.read()
            try:
                self.pages = json.loads(content)
                print(f"Successfully parsed {len(self.pages)} pages")
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON: {e}")
                return False
        
        # Process the data
        self._build_site_hierarchy()
        self._identify_common_blocks()
        
        return True
    
    def _build_site_hierarchy(self):
        """Build a hierarchical structure based on URL paths"""
        # Create a dictionary to store the hierarchy
        self.site_hierarchy = {
            "root": None,
            "nodes_by_url": {},
            "pages": len(self.pages)
        }
        
        # Add URL fields to each page for easy access
        for page in self.pages:
            parsed_url = urlparse(page["url"])
            
            page["domain"] = parsed_url.netloc
            page["path"] = parsed_url.path
            page["path_parts"] = [p for p in parsed_url.path.strip('/').split('/') if p]
            page["depth"] = len(page["path_parts"])
            page["children"] = []
            
            # Store nodes by URL for quick access
            self.site_hierarchy["nodes_by_url"][page["url"]] = page
        
        # Find the root page (homepage)
        for page in self.pages:
            if page["depth"] == 0 or page["path"] == "/":
                self.site_hierarchy["root"] = page
                break
        
        # If no clear homepage found, create a virtual root
        if not self.site_hierarchy["root"]:
            domain = self.pages[0]["domain"] if self.pages else "example.com"
            root_url = f"https://{domain}/"
            
            self.site_hierarchy["root"] = {
                "url": root_url,
                "title": f"{domain} Homepage",
                "domain": domain,
                "path": "/",
                "path_parts": [],
                "depth": 0,
                "content": "",
                "category": "root",
                "is_product": False,
                "children": []
            }
            
            self.site_hierarchy["nodes_by_url"][root_url] = self.site_hierarchy["root"]
        
        # Sort pages by depth to build the hierarchy from top down
        sorted_pages = sorted(self.pages, key=lambda p: p["depth"])
        
        # Build parent-child relationships
        for page in sorted_pages:
            if page == self.site_hierarchy["root"]:
                continue
            
            # Try to find direct parent
            parent_found = False
            
            if page["depth"] > 0:
                # Construct the parent URL by removing the last path segment
                parent_path_parts = page["path_parts"][:-1]
                parent_path = "/" + "/".join(parent_path_parts) + "/"
                parent_url = f"https://{page['domain']}{parent_path}"
                
                # Check if parent exists in our nodes
                if parent_url in self.site_hierarchy["nodes_by_url"]:
                    self.site_hierarchy["nodes_by_url"][parent_url]["children"].append(page)
                    parent_found = True
                else:
                    # Try to find closest ancestor
                    for i in range(len(parent_path_parts)-1, -1, -1):
                        ancestor_path = "/" + "/".join(parent_path_parts[:i]) + "/"
                        ancestor_url = f"https://{page['domain']}{ancestor_path}"
                        
                        if ancestor_url in self.site_hierarchy["nodes_by_url"]:
                            self.site_hierarchy["nodes_by_url"][ancestor_url]["children"].append(page)
                            parent_found = True
                            break
            
            # If no parent found, attach to root
            if not parent_found:
                self.site_hierarchy["root"]["children"].append(page)
    
    def _identify_common_blocks(self, min_length=30, similarity_threshold=0.8):
        """Identify common content blocks across pages"""
        # Split content into potential blocks
        content_blocks = []
        
        for page in self.pages:
            content = page.get("content", "")
            if not content:
                continue
            
            # Split content using common separators
            chunks = re.split(r'\s{2,}|\n+|\s+\s+', content)
            chunks = [chunk.strip() for chunk in chunks if len(chunk.strip()) >= min_length]
            
            for chunk in chunks:
                content_blocks.append({
                    "page_url": page["url"],
                    "content": chunk,
                    "length": len(chunk)
                })
        
        # Find similar blocks
        used_blocks = set()
        block_id = 0
        
        for i, block1 in enumerate(content_blocks):
            if i in used_blocks:
                continue
                
            similar_blocks = []
            
            for j, block2 in enumerate(content_blocks):
                if i == j or j in used_blocks:
                    continue
                
                # Skip blocks from the same page
                if block1["page_url"] == block2["page_url"]:
                    continue
                
                # Compare similarity
                similarity = difflib.SequenceMatcher(None, block1["content"], block2["content"]).ratio()
                
                if similarity >= similarity_threshold:
                    similar_blocks.append(j)
            
            # If similar blocks found, create a common block entry
            if similar_blocks:
                # Generate a type for the block
                block_type = self._classify_block(block1["content"])
                
                # Add to common blocks
                block_key = f"block_{block_id}"
                self.common_blocks[block_key] = {
                    "name": f"{block_type}_{block_id}",
                    "type": block_type,
                    "content": block1["content"],
                    "occurrences": [block1["page_url"]] + [content_blocks[j]["page_url"] for j in similar_blocks]
                }
                
                # Mark all similar blocks as used
                used_blocks.add(i)
                used_blocks.update(similar_blocks)
                
                block_id += 1
        
        # Now replace common blocks in page content
        self._replace_common_blocks_in_content()
    
    def _classify_block(self, content):
        """Classify the type of content block"""
        content_lower = content.lower()
        
        patterns = {
            "header": r"^przykłady|^menu|^kontrola\s+dostępu",
            "footer": r"newsletter|bądź\s+na\s+bieżąco|na\s+skróty|wsparcie|kontakt|komunikaty",
            "nav_menu": r"rozwiązania|produkty|zastosowania|integracje",
            "product_info": r"o\s+produkcie|charakterystyka|zasoby|powiązane\s+produkty",
            "case_study": r"case\s+study|wybrane\s+realizacje|wdrożonych\s+z\s+sukcesem",
            "intro": r"wprowadzenie"
        }
        
        for block_type, pattern in patterns.items():
            if re.search(pattern, content_lower):
                return block_type
        
        return "content"
    
    def _replace_common_blocks_in_content(self):
        """Replace common blocks in page content with references"""
        # Go through each page
        for page in self.pages:
            page["common_blocks_used"] = {}
            
            # Skip pages without content
            if "content" not in page or not page["content"]:
                continue
            
            content = page["content"]
            
            # Try to replace each common block
            for block_id, block in self.common_blocks.items():
                if page["url"] in block["occurrences"]:
                    # This page uses this block
                    page["common_blocks_used"][block_id] = block["name"]
                    
                    # Replace the content
                    content = content.replace(block["content"], f"[{block['name']}]")
            
            # Update the page with processed content
            page["processed_content"] = content
    
    def export_result(self, output_file):
        """Export the processed data to a JSON file"""
        result = {
            "website": {
                "root": self._clean_node_for_export(self.site_hierarchy["root"]),
                "pages": len(self.pages),
                "common_blocks": len(self.common_blocks)
            },
            "common_blocks": self.common_blocks
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"Exported website structure to {output_file}")
        print(f"Total pages: {len(self.pages)}")
        print(f"Common blocks identified: {len(self.common_blocks)}")
    
    def _clean_node_for_export(self, node):
        """Prepare a node for JSON export (recursive)"""
        if not node:
            return None
        
        cleaned = {
            "url": node.get("url", ""),
            "title": node.get("title", ""),
            "category": node.get("category", ""),
            "is_product": node.get("is_product", False)
        }
        
        # Add processed content if available
        if "processed_content" in node:
            cleaned["content"] = node["processed_content"]
        elif "content" in node:
            cleaned["content"] = node["content"]
        
        # Add common blocks used
        if "common_blocks_used" in node:
            cleaned["common_blocks"] = node["common_blocks_used"]
        
        # Add children recursively
        if "children" in node and node["children"]:
            cleaned["children"] = [self._clean_node_for_export(child) for child in node["children"]]
        else:
            cleaned["children"] = []
        
        return cleaned

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Process website crawler output into structured format')
    parser.add_argument('input_file', help='Input JSON file with crawler data')
    parser.add_argument('output_file', help='Output file for processed website structure')
    args = parser.parse_args()
    
    parser = WebsiteParser(args.input_file)
    if parser.parse():
        parser.export_result(args.output_file)
    else:
        print("Failed to process website data")

if __name__ == "__main__":
    main()