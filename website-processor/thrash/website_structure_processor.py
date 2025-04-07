import json
import re
import os
from urllib.parse import urlparse
from collections import defaultdict, Counter
import difflib

class WebsiteNode:
    def __init__(self, url, title, content, category=None, is_product=False, timestamp=None):
        self.url = url
        self.title = title
        self.content = content
        self.category = category
        self.is_product = is_product
        self.timestamp = timestamp
        self.children = []
        self.parent = None
        self.common_blocks = {}  # Will store references to common content blocks
    
    def add_child(self, child_node):
        self.children.append(child_node)
        child_node.parent = self
    
    def __repr__(self):
        return f"Node({self.url}, {self.title}, {len(self.children)} children)"

class WebsiteStructure:
    def __init__(self):
        self.root = None
        self.all_nodes = {}  # url -> node
        self.common_blocks = {}  # id -> content
    
    def build_from_json_list(self, json_items):
        # First, create all nodes
        for item in json_items:
            url = item.get('url', '')
            node = WebsiteNode(
                url=url,
                title=item.get('title', ''),
                content=item.get('content', ''),
                category=item.get('category', ''),
                is_product=item.get('is_product', False),
                timestamp=item.get('timestamp', '')
            )
            self.all_nodes[url] = node
        
        # Determine the root node (homepage)
        root_candidates = [url for url in self.all_nodes.keys() 
                          if urlparse(url).path == '/' or urlparse(url).path == '']
        
        if root_candidates:
            self.root = self.all_nodes[root_candidates[0]]
        else:
            # If no clear homepage, use the shortest URL as root
            shortest_url = min(self.all_nodes.keys(), key=lambda x: len(x))
            self.root = self.all_nodes[shortest_url]
        
        # Build parent-child relationships based on URL paths
        for url, node in self.all_nodes.items():
            if node == self.root:
                continue
                
            parsed_url = urlparse(url)
            path_parts = parsed_url.path.strip('/').split('/')
            
            if not path_parts or path_parts[0] == '':
                # This is a top-level page, connect to root
                self.root.add_child(node)
            else:
                # Try to find parent by path
                parent_path = '/'.join(path_parts[:-1])
                parent_url = f"{parsed_url.scheme}://{parsed_url.netloc}/{parent_path}"
                
                if parent_url in self.all_nodes:
                    self.all_nodes[parent_url].add_child(node)
                else:
                    # If exact parent not found, find closest ancestor
                    ancestor_found = False
                    for i in range(len(path_parts)-1, 0, -1):
                        ancestor_path = '/'.join(path_parts[:i])
                        ancestor_url = f"{parsed_url.scheme}://{parsed_url.netloc}/{ancestor_path}"
                        
                        if ancestor_url in self.all_nodes:
                            self.all_nodes[ancestor_url].add_child(node)
                            ancestor_found = True
                            break
                    
                    if not ancestor_found:
                        # If no ancestor found, connect to root
                        self.root.add_child(node)
    
    def identify_common_blocks(self, min_length=50, similarity_threshold=0.8):
        """Identify common text blocks across pages"""
        # Extract content chunks by splitting on common delimiters
        all_content = []
        for url, node in self.all_nodes.items():
            chunks = re.split(r'\s{2,}|\n+', node.content)
            chunks = [chunk.strip() for chunk in chunks if len(chunk.strip()) >= min_length]
            for chunk in chunks:
                all_content.append((node, chunk))
        
        # Find similar chunks
        processed_chunks = set()
        block_id = 0
        
        for i, (node1, chunk1) in enumerate(all_content):
            if chunk1 in processed_chunks:
                continue
                
            similar_chunks = []
            
            for j, (node2, chunk2) in enumerate(all_content):
                if i == j or chunk2 in processed_chunks:
                    continue
                
                # Use difflib to compare similarity
                similarity = difflib.SequenceMatcher(None, chunk1, chunk2).ratio()
                if similarity >= similarity_threshold:
                    similar_chunks.append((node2, chunk2))
                    processed_chunks.add(chunk2)
            
            # If we found similar chunks, create a common block
            if similar_chunks:
                block_name = self._generate_block_name(chunk1)
                block_id_str = f"common_block_{block_id}"
                self.common_blocks[block_id_str] = {
                    "name": block_name,
                    "content": chunk1
                }
                
                # Replace content in all affected nodes
                node1.common_blocks[block_id_str] = block_name
                node1.content = node1.content.replace(chunk1, f"[{block_name}]")
                
                for node2, chunk2 in similar_chunks:
                    node2.common_blocks[block_id_str] = block_name
                    node2.content = node2.content.replace(chunk2, f"[{block_name}]")
                
                block_id += 1
                processed_chunks.add(chunk1)
    
    def _generate_block_name(self, text):
        """Generate a descriptive name for a content block"""
        # Look for common website sections
        section_patterns = {
            r'newsletter|subscribe|bądź na bieżąco': 'newsletter_subscription',
            r'wsparcie|support|pomoc': 'support_section',
            r'kontakt|contact': 'contact_info',
            r'na skróty|quick links': 'quick_links',
            r'menu|nawigacja|navigation': 'menu_navigation',
            r'stopka|footer': 'footer',
            r'produkt|product': 'product_info',
            r'firma|about|o nas': 'company_info',
            r'rozwiązania|solutions': 'solutions_info',
            r'pobierz|download': 'download_section',
            r'aktualności|news|blog': 'news_section'
        }
        
        for pattern, name in section_patterns.items():
            if re.search(pattern, text.lower()):
                return name
        
        # If no pattern matches, use the first few words
        words = re.findall(r'\w+', text)
        if words:
            return f"content_block_{'_'.join(words[:3])}"
        else:
            return "general_content_block"
    
    def export_to_json(self, output_file):
        """Export the website structure to a JSON file"""
        result = {
            "structure": self._node_to_dict(self.root),
            "common_blocks": self.common_blocks
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    
    def _node_to_dict(self, node):
        """Convert a node to a dictionary representation"""
        return {
            "url": node.url,
            "title": node.title,
            "category": node.category,
            "is_product": node.is_product,
            "content_summary": self._summarize_content(node.content),
            "common_blocks": node.common_blocks,
            "children": [self._node_to_dict(child) for child in node.children]
        }
    
    def _summarize_content(self, content, max_length=200):
        """Create a short summary of the content"""
        if len(content) <= max_length:
            return content
        
        return content[:max_length] + "..."
    
    def visualize(self, output_file=None):
        """Generate a visualization of the website structure"""
        try:
            import graphviz
            dot = graphviz.Digraph(comment='Website Structure')
            
            # Add nodes
            for url, node in self.all_nodes.items():
                label = f"{node.title}\n({url})"
                dot.node(url, label=label)
            
            # Add edges
            for url, node in self.all_nodes.items():
                for child in node.children:
                    dot.edge(url, child.url)
            
            # Render the graph
            if output_file:
                dot.render(output_file, format='png', cleanup=True)
                print(f"Visualization saved to {output_file}.png")
            else:
                print(dot.source)
                
        except ImportError:
            print("Graphviz not available. Install with 'pip install graphviz'")


def parse_input_file(file_path):
    """Parse the input file containing JSON objects"""
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Find all JSON objects in the text
    json_objects = []
    pattern = r'\{"url": "[^"]+", "title": "[^"]*", "content": "[^"]*"(?:[^{}]|{[^{}]*})*\}'
    matches = re.finditer(pattern, text)
    
    for match in matches:
        try:
            json_obj = json.loads(match.group())
            json_objects.append(json_obj)
        except json.JSONDecodeError:
            # Skip invalid JSON
            continue
    
    return json_objects

def main():
    # Example usage
    input_file = 'output-new.json'  # Using the specified input file
    output_file = 'website_structure.json'
    
    # Parse JSON data from input file
    json_objects = parse_input_file(input_file)
    
    # Build website structure
    website = WebsiteStructure()
    website.build_from_json_list(json_objects)
    
    # Identify common content blocks
    website.identify_common_blocks()
    
    # Export the result
    website.export_to_json(output_file)
    
    # Generate visualization
    website.visualize('website_graph')

if __name__ == "__main__":
    main()