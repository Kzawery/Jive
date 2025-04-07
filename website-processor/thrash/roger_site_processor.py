import json
import re
import os
from urllib.parse import urlparse
from collections import defaultdict

class RogerWebsiteProcessor:
    def __init__(self, input_file, output_file):
        self.input_file = input_file
        self.output_file = output_file
        self.pages = []
        self.common_blocks = {}
        self.site_structure = {}
    
    def process(self):
        """Main processing function"""
        print(f"Processing file: {self.input_file}")
        
        # Load and parse the data
        if not self._load_data():
            return False
        
        print(f"Successfully loaded {len(self.pages)} pages")
        
        # Extract common blocks
        self._extract_common_blocks()
        
        # Build the site hierarchy
        self._build_site_hierarchy()
        
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
    
    def _extract_common_blocks(self):
        """Find and extract common content blocks"""
        # Find the header (common at the start of pages)
        header_pattern = "Przykłady instalacji produktów Roger"
        header_pages = [page for page in self.pages if page["content"].startswith(header_pattern)]
        
        if len(header_pages) > len(self.pages) / 2:
            # This is a common header, extract it
            # Find the full header by getting the first line
            sample_page = header_pages[0]["content"]
            header_end = sample_page.find("\n") if "\n" in sample_page else 38  # Default to 38 chars
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
            # Find the full footer pattern by extracting the last part
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
        
        # Look for other common blocks across pages
        # Navigation menu
        nav_pattern = "Rozwiązania   Standardowa kontrola dostępu   Zaawansowana kontrola dostępu"
        nav_pages = [page for page in self.pages if nav_pattern in page["content"]]
        
        if len(nav_pages) > 2:  # At least 3 pages need to have it
            # Find the navigation menu pattern
            sample_page = nav_pages[0]["content"]
            nav_start = sample_page.find("Rozwiązania")
            nav_end = sample_page.find("Zastosowania", nav_start) if "Zastosowania" in sample_page else -1
            
            if nav_start != -1 and nav_end != -1:
                nav_content = sample_page[nav_start:nav_end].strip()
                
                self.common_blocks["nav_menu"] = {
                    "name": "main_navigation",
                    "type": "navigation",
                    "content": nav_content,
                    "occurrences": [page["url"] for page in nav_pages]
                }
                
                print(f"Identified navigation menu used on {len(nav_pages)} pages")
        
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
                
                print(f"Identified useful links section used on {len(links_pages)} pages")
        
        print(f"Extracted {len(self.common_blocks)} common blocks")
    
    def _build_site_hierarchy(self):
        """Build the website hierarchy based on URL structure"""
        # Initialize the site structure
        self.site_structure = {
            "root": None,
            "pages_by_url": {},
            "pages_by_depth": defaultdict(list)
        }
        
        # Process each page to extract URL components
        for page in self.pages:
            # Parse the URL
            parsed_url = urlparse(page["url"])
            
            # Extract path components
            path = parsed_url.path.strip("/")
            path_parts = path.split("/") if path else []
            
            # Add URL info to the page
            page["domain"] = parsed_url.netloc
            page["path"] = parsed_url.path
            page["path_parts"] = path_parts
            page["depth"] = len(path_parts)
            
            # Add children list for hierarchy
            page["children"] = []
            
            # Store page by URL for easy lookup
            self.site_structure["pages_by_url"][page["url"]] = page
            
            # Group pages by depth
            self.site_structure["pages_by_depth"][page["depth"]].append(page)
        
        # Find the root/homepage
        root_candidates = [page for page in self.pages if page["depth"] == 0]
        
        if root_candidates:
            self.site_structure["root"] = root_candidates[0]
        else:
            # Create a virtual root
            domain = self.pages[0]["domain"] if self.pages else "roger.pl"
            root_url = f"https://{domain}/"
            
            self.site_structure["root"] = {
                "url": root_url,
                "title": f"{domain} Homepage",
                "domain": domain,
                "path": "/",
                "path_parts": [],
                "depth": 0,
                "children": [],
                "content": "",
                "category": "root",
                "is_product": False
            }
            
            # Add to lookup
            self.site_structure["pages_by_url"][root_url] = self.site_structure["root"]
        
        # Build parent-child relationships
        # Start with depth 1 (direct children of root) and go deeper
        depths = sorted(self.site_structure["pages_by_depth"].keys())
        
        for depth in depths:
            if depth == 0:
                continue  # Skip root level
                
            for page in self.site_structure["pages_by_depth"][depth]:
                # Try to find parent
                parent_found = False
                
                if page["path_parts"]:
                    # Construct parent path
                    parent_path_parts = page["path_parts"][:-1]
                    parent_path = "/" + "/".join(parent_path_parts)
                    if parent_path_parts:
                        parent_path += "/"
                    parent_url = f"https://{page['domain']}{parent_path}"
                    
                    # Check if parent exists
                    if parent_url in self.site_structure["pages_by_url"]:
                        parent_page = self.site_structure["pages_by_url"][parent_url]
                        parent_page["children"].append(page)
                        parent_found = True
                    else:
                        # Try to find the closest ancestor
                        for i in range(len(parent_path_parts)-1, -1, -1):
                            ancestor_path = "/" + "/".join(parent_path_parts[:i])
                            if ancestor_path:
                                ancestor_path += "/"
                            ancestor_url = f"https://{page['domain']}{ancestor_path}"
                            
                            if ancestor_url in self.site_structure["pages_by_url"]:
                                ancestor_page = self.site_structure["pages_by_url"][ancestor_url]
                                ancestor_page["children"].append(page)
                                parent_found = True
                                break
                
                # If no parent found, attach to root
                if not parent_found:
                    self.site_structure["root"]["children"].append(page)
        
        # Count the number of pages at each level
        for depth, pages in self.site_structure["pages_by_depth"].items():
            print(f"Depth {depth}: {len(pages)} pages")
        
        # Print the number of direct children of root
        root_children = len(self.site_structure["root"]["children"])
        print(f"Root has {root_children} direct children")
    
    def _replace_common_blocks_in_content(self):
        """Replace common blocks in page content with references"""
        # Process each page
        for page in self.pages:
            # Initialize dict to track which blocks are used on this page
            page["common_blocks_used"] = {}
            
            # Skip if page has no content
            if "content" not in page or not page["content"]:
                continue
                
            content = page["content"]
            
            # Try to replace each common block
            for block_id, block in self.common_blocks.items():
                block_content = block["content"]
                
                # Check if this page uses this block
                if block_content in content and page["url"] in block["occurrences"]:
                    # Mark this block as used on this page
                    page["common_blocks_used"][block_id] = block["name"]
                    
                    # Replace the content with a reference
                    content = content.replace(block_content, f"[{block['name']}]")
            
            # Store the processed content
            page["processed_content"] = content
        
        # Count how many pages were processed
        processed_count = sum(1 for page in self.pages if "processed_content" in page)
        print(f"Processed content for {processed_count} pages")
    
    def _export_data(self):
        """Export the processed data to a JSON file"""
        # Prepare the export structure
        export_data = {
            "website": {
                "root": self._prepare_node_for_export(self.site_structure["root"]),
                "pages": len(self.pages),
                "common_blocks": len(self.common_blocks)
            },
            "common_blocks": self.common_blocks
        }
        
        # Write to file
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
    
    def _prepare_node_for_export(self, node):
        """Prepare a node for export by cleaning unnecessary fields"""
        if node is None:
            return None
        
        # Create a clean copy with just the needed fields
        clean_node = {
            "url": node.get("url", ""),
            "title": node.get("title", ""),
            "category": node.get("category", ""),
            "is_product": node.get("is_product", False),
            "children": []
        }
        
        # Add processed content if available
        if "processed_content" in node:
            clean_node["content"] = node["processed_content"]
        elif "content" in node:
            clean_node["content"] = node["content"]
        
        # Add common blocks used
        if "common_blocks_used" in node and node["common_blocks_used"]:
            clean_node["common_blocks"] = node["common_blocks_used"]
        
        # Process children recursively
        if "children" in node:
            clean_node["children"] = [
                self._prepare_node_for_export(child) for child in node["children"]
            ]
        
        return clean_node

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Process Roger website crawler output')
    parser.add_argument('input_file', help='Input JSON file with crawler output')
    parser.add_argument('output_file', help='Output file for processed structure')
    
    args = parser.parse_args()
    
    processor = RogerWebsiteProcessor(args.input_file, args.output_file)
    processor.process()

if __name__ == "__main__":
    main()