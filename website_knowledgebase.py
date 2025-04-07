import json
import re
import difflib
from typing import List, Dict, Any, Tuple, Optional
import os

class WebsiteKnowledgeBase:
    """
    A knowledge base built from the path-based website structure 
    that provides intelligent search and retrieval capabilities for an AI agent.
    """
    
    def __init__(self, structure_file: str):
        """Initialize with a processed website structure file"""
        # Load the processed website structure
        with open(structure_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.website = data["website"]
        self.common_blocks = data["common_blocks"]
        self.master_node = self.website["master_node"]
        self.domain = self.website.get("domain", "")
        
        # Build lookup dictionaries
        self.nodes_by_path = {}
        self._build_path_map(self.master_node)
        
        # Build keyword index for faster searching
        self.keyword_index = self._build_keyword_index()
        
        # Track sections by category
        self.sections_by_category = self._categorize_sections()
        
        print(f"Loaded knowledge base with {len(self.nodes_by_path)} nodes and {len(self.common_blocks)} common blocks")
    
    def _build_path_map(self, node: Dict[str, Any]):
        """Recursively build a flat map of all nodes by path"""
        if "path" in node:
            self.nodes_by_path[node["path"]] = node
        
        for child in node.get("children", []):
            self._build_path_map(child)
    
    def _build_keyword_index(self) -> Dict[str, List[str]]:
        """Build a keyword-to-paths index for faster searching"""
        keyword_index = {}
        
        # Process each node
        for path, node in self.nodes_by_path.items():
            # Extract keywords from title and content
            title = node.get("title", "")
            content = node.get("content", "")
            
            # Extract keywords (simple implementation - could be improved)
            keywords = set()
            
            # From title
            for word in re.findall(r'\w+', title.lower()):
                if len(word) > 3:  # Skip short words
                    keywords.add(word)
            
            # From content
            for word in re.findall(r'\w+', content.lower()):
                if len(word) > 3:  # Skip short words
                    keywords.add(word)
            
            # Add path to index for each keyword
            for keyword in keywords:
                if keyword not in keyword_index:
                    keyword_index[keyword] = []
                keyword_index[keyword].append(path)
        
        return keyword_index
    
    def _categorize_sections(self) -> Dict[str, List[str]]:
        """Group sections by their category"""
        categories = {}
        
        for path, node in self.nodes_by_path.items():
            category = node.get("category", "uncategorized")
            
            if category not in categories:
                categories[category] = []
            
            categories[category].append(path)
        
        return categories
    
    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search for nodes matching the query.
        Returns a list of matching nodes with relevance scores.
        """
        query = query.lower()
        query_words = set(re.findall(r'\w+', query))
        results = []
        
        # First, try exact path match
        if query.startswith('/'):
            if query in self.nodes_by_path:
                node = self.nodes_by_path[query]
                results.append({
                    "path": query,
                    "title": node.get("title", ""),
                    "content_preview": self._get_content_preview(node),
                    "relevance": 1.0,
                    "match_type": "exact_path"
                })
                return results
            
            # Try approximate path match
            for path in self.nodes_by_path:
                if path.startswith(query):
                    node = self.nodes_by_path[path]
                    results.append({
                        "path": path,
                        "title": node.get("title", ""),
                        "content_preview": self._get_content_preview(node),
                        "relevance": 0.9,
                        "match_type": "path_prefix"
                    })
        
        # Use keyword index to find candidate paths
        candidate_paths = set()
        for word in query_words:
            if word in self.keyword_index:
                candidate_paths.update(self.keyword_index[word])
        
        # Score each candidate
        for path in candidate_paths:
            node = self.nodes_by_path[path]
            title = node.get("title", "").lower()
            content = node.get("content", "").lower()
            
            # Calculate relevance score
            title_score = self._calculate_relevance(title, query)
            content_score = self._calculate_relevance(content, query)
            
            # Combine scores (title matches are more important)
            relevance = (title_score * 0.6) + (content_score * 0.4)
            
            if relevance > 0.1:  # Only include somewhat relevant results
                results.append({
                    "path": path,
                    "title": node.get("title", ""),
                    "content_preview": self._get_content_preview(node, query),
                    "relevance": relevance,
                    "match_type": "content_match"
                })
        
        # Sort by relevance (highest first)
        results.sort(key=lambda x: x["relevance"], reverse=True)
        
        # Return top results
        return results[:limit]
    
    def _calculate_relevance(self, text: str, query: str) -> float:
        """Calculate relevance of a text to a query"""
        # Simple relevance calculation
        if query in text:
            return 0.8  # Direct match
        
        # Word overlap
        text_words = set(re.findall(r'\w+', text))
        query_words = set(re.findall(r'\w+', query))
        
        if not query_words:
            return 0.0
            
        overlap = len(text_words.intersection(query_words))
        return min(0.7, overlap / len(query_words))
    
    def _get_content_preview(self, node: Dict[str, Any], query: str = None) -> str:
        """Get a preview of the node's content, highlighting query terms if provided"""
        content = node.get("content", "")
        
        if not content:
            return ""
        
        # If no query, return the first 100 characters
        if not query:
            return content[:100] + "..." if len(content) > 100 else content
        
        # Try to find a section of content containing the query
        query_pos = content.lower().find(query.lower())
        
        if query_pos != -1:
            # Extract a window around the query
            start = max(0, query_pos - 50)
            end = min(len(content), query_pos + len(query) + 50)
            
            preview = content[start:end]
            
            # Add ellipsis if needed
            if start > 0:
                preview = "..." + preview
            if end < len(content):
                preview = preview + "..."
                
            return preview
        
        # Fallback to beginning of content
        return content[:100] + "..." if len(content) > 100 else content
    
    def get_node_content(self, path: str) -> Optional[Dict[str, Any]]:
        """Get the full content for a specific path"""
        if path in self.nodes_by_path:
            node = self.nodes_by_path[path]
            
            # Expand any references to common blocks
            content = self._expand_common_blocks(node)
            
            return {
                "path": path,
                "title": node.get("title", ""),
                "content": content,
                "category": node.get("category", ""),
                "is_product": node.get("is_product", False),
                "children": [{"path": child.get("path", ""), "title": child.get("title", "")} 
                            for child in node.get("children", [])]
            }
        
        return None
    
    def _expand_common_blocks(self, node: Dict[str, Any]) -> str:
        """Expand references to common blocks in the content"""
        if "processed_content" not in node:
            return node.get("content", "")
        
        content = node["processed_content"]
        
        # Replace all [block_name] references with their content
        for block_id, block_name in node.get("common_blocks", {}).items():
            if block_id in self.common_blocks:
                block_content = self.common_blocks[block_id].get("content", "")
                content = content.replace(f"[{block_name}]", block_content)
        
        return content
    
    def find_download_links(self, query: str = None) -> List[Dict[str, Any]]:
        """Find download links in the website, optionally filtered by query"""
        download_paths = []
        
        # Keywords that suggest download sections
        download_keywords = ["pobierz", "download", "firmware", "aktualizacja", "update"]
        
        # First check if we have any paths specifically related to downloads
        for path, node in self.nodes_by_path.items():
            title = node.get("title", "").lower()
            content = node.get("content", "").lower()
            
            is_download_related = (
                any(keyword in path.lower() for keyword in download_keywords) or
                any(keyword in title for keyword in download_keywords) or
                any(keyword in content for keyword in download_keywords)
            )
            
            if is_download_related:
                # If query is provided, check if it matches
                if query:
                    query_lower = query.lower()
                    if (query_lower in path.lower() or 
                        query_lower in title or 
                        query_lower in content):
                        download_paths.append(path)
                else:
                    download_paths.append(path)
        
        # Convert paths to result objects
        results = []
        for path in download_paths:
            node = self.nodes_by_path[path]
            
            # Try to extract download links from content
            links = self._extract_download_links(node)
            
            results.append({
                "path": path,
                "title": node.get("title", ""),
                "content_preview": self._get_content_preview(node),
                "links": links
            })
        
        return results
    
    def _extract_download_links(self, node: Dict[str, Any]) -> List[Dict[str, str]]:
        """Extract download links from node content"""
        content = node.get("content", "")
        links = []
        
        # This is a simplified implementation - in a real system,
        # you would parse the HTML content to extract links
        
        # For now, look for patterns that suggest links
        link_patterns = [
            r'(https?://[^\s]+\.(?:pdf|zip|exe|dmg|msi|apk|iso))',
            r'(pobierz\s+[^\.]+\.(?:pdf|zip|exe|dmg|msi|apk|iso))',
            r'(download\s+[^\.]+\.(?:pdf|zip|exe|dmg|msi|apk|iso))'
        ]
        
        for pattern in link_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                link_text = match.group(1)
                links.append({
                    "text": link_text,
                    "url": link_text if link_text.startswith("http") else None
                })
        
        return links
    
    def get_product_info(self, product_name: str) -> Optional[Dict[str, Any]]:
        """Find information about a specific product"""
        # Search for product pages
        product_paths = []
        
        for path, node in self.nodes_by_path.items():
            # Check if this is a product node
            if node.get("is_product", False):
                title = node.get("title", "").lower()
                content = node.get("content", "").lower()
                
                # Check if product name appears in title or content
                product_name_lower = product_name.lower()
                if (product_name_lower in title or 
                    product_name_lower in content or
                    product_name_lower in path.lower()):
                    product_paths.append(path)
        
        # If no products found, try a more general search
        if not product_paths:
            results = self.search(product_name)
            product_paths = [result["path"] for result in results]
        
        # Process the most relevant product path
        if product_paths:
            # Get the first (most relevant) product
            path = product_paths[0]
            node = self.nodes_by_path[path]
            
            # Expand content (including common blocks)
            full_content = self._expand_common_blocks(node)
            
            # Extract key product information
            features = self._extract_product_features(full_content)
            specifications = self._extract_product_specifications(full_content)
            
            # Find related pages (e.g., downloads, manuals)
            related_pages = self._find_related_pages(path)
            
            return {
                "path": path,
                "title": node.get("title", ""),
                "summary": self._generate_product_summary(node),
                "features": features,
                "specifications": specifications,
                "related_pages": related_pages
            }
        
        return None
    
    def _extract_product_features(self, content: str) -> List[str]:
        """Extract product features from content"""
        features = []
        
        # Look for feature lists (simple implementation)
        feature_sections = re.findall(r'(Cechy|Funkcje|Charakterystyka).*?(\n\s*\n|\Z)', 
                                     content, re.DOTALL | re.IGNORECASE)
        
        for section in feature_sections:
            section_text = section[0]
            # Extract bullet points or numbered list items
            for item in re.findall(r'[\•\-\*]\s*([^\n]+)', section_text):
                features.append(item.strip())
        
        # If no structured list found, look for key phrases
        if not features:
            for sentence in re.split(r'[.!?]', content):
                sentence = sentence.strip().lower()
                if any(kw in sentence for kw in ["umożliwia", "zapewnia", "oferuje", "pozwala"]):
                    features.append(sentence)
        
        return features[:10]  # Limit to top 10 features
    
    def _extract_product_specifications(self, content: str) -> Dict[str, str]:
        """Extract product specifications from content"""
        specs = {}
        
        # Look for specification sections
        spec_sections = re.findall(r'(Specyfikacja|Dane techniczne).*?(\n\s*\n|\Z)', 
                                   content, re.DOTALL | re.IGNORECASE)
        
        for section in spec_sections:
            section_text = section[0]
            # Look for key-value pairs
            for line in section_text.split('\n'):
                # Try to split at common separators
                for sep in [':', '-', '=']:
                    if sep in line:
                        key, value = line.split(sep, 1)
                        specs[key.strip()] = value.strip()
                        break
        
        return specs
    
    def _find_related_pages(self, path: str) -> List[Dict[str, str]]:
        """Find pages related to a given path"""
        related = []
        
        # Get current node
        if path not in self.nodes_by_path:
            return related
            
        current_node = self.nodes_by_path[path]
        
        # First, add direct children
        for child in current_node.get("children", []):
            related.append({
                "path": child.get("path", ""),
                "title": child.get("title", ""),
                "relation": "child"
            })
        
        # Add siblings (other pages with same parent)
        parent_path = self._get_parent_path(path)
        if parent_path and parent_path in self.nodes_by_path:
            parent = self.nodes_by_path[parent_path]
            for sibling in parent.get("children", []):
                sibling_path = sibling.get("path", "")
                if sibling_path != path:  # Skip the current node
                    related.append({
                        "path": sibling_path,
                        "title": sibling.get("title", ""),
                        "relation": "sibling"
                    })
        
        # Look for pages with similar keywords
        current_title = current_node.get("title", "").lower()
        title_words = set(re.findall(r'\w+', current_title))
        title_words = {w for w in title_words if len(w) > 3}  # Skip short words
        
        if title_words:
            for other_path, other_node in self.nodes_by_path.items():
                if other_path != path:  # Skip the current node
                    other_title = other_node.get("title", "").lower()
                    other_words = set(re.findall(r'\w+', other_title))
                    
                    # Check word overlap
                    common_words = title_words.intersection(other_words)
                    if len(common_words) >= 2:  # At least 2 words in common
                        related.append({
                            "path": other_path,
                            "title": other_node.get("title", ""),
                            "relation": "keyword_match"
                        })
        
        # Limit to a reasonable number
        return related[:5]
    
    def _get_parent_path(self, path: str) -> Optional[str]:
        """Get the parent path for a given path"""
        if path == "/" or not path:
            return None
            
        parts = path.strip("/").split("/")
        if not parts:
            return "/"
            
        return "/" + "/".join(parts[:-1])
    
    def _generate_product_summary(self, node: Dict[str, Any]) -> str:
        """Generate a concise summary of a product"""
        title = node.get("title", "")
        content = node.get("content", "")
        
        # Extract first paragraph as summary
        paragraphs = re.split(r'\n\s*\n', content)
        if paragraphs:
            summary = paragraphs[0].strip()
            # Truncate if too long
            if len(summary) > 200:
                summary = summary[:197] + "..."
            return summary
        
        return f"Product information about {title}"

    def navigate_path(self, current_path: str, target: str) -> str:
        """
        Navigate from current path to target using filesystem-like navigation
        Examples: 
          navigate_path("/products", "firmware") -> "/products/firmware"
          navigate_path("/products/racs5", "..") -> "/products"
          navigate_path("/", "products/firmware") -> "/products/firmware"
        """
        # Handle absolute paths
        if target.startswith('/'):
            return target
        
        # Handle parent navigation (..)
        if target == '..':
            return self._get_parent_path(current_path) or '/'
        
        # Handle current directory (.)
        if target == '.':
            return current_path
        
        # Handle relative paths
        if current_path.endswith('/'):
            new_path = current_path + target
        else:
            new_path = current_path + '/' + target
            
        # Normalize path
        parts = []
        for part in new_path.split('/'):
            if not part or part == '.':
                continue
            elif part == '..':
                if parts:
                    parts.pop()
            else:
                parts.append(part)
                
        return '/' + '/'.join(parts)
    
    def answer_question(self, question: str) -> Dict[str, Any]:
        """
        Answer a question about the website using the knowledge base.
        This is the main method that the AI agent would call.
        """
        question_lower = question.lower()
        
        # Handle different types of questions
        if any(term in question_lower for term in ["download", "pobierz", "firmware", "update", "aktualizacja"]):
            # Extract product name if mentioned
            product_match = re.search(r'(?:dla|for|the)\s+([A-Za-z0-9\s]+)', question_lower)
            product_name = product_match.group(1) if product_match else None
            
            # Find download links
            results = self.find_download_links(product_name)
            
            return {
                "question_type": "download_query",
                "results": results,
                "answer": f"I found {len(results)} pages with download links" + 
                         (f" for {product_name}" if product_name else "")
            }
            
        elif any(term in question_lower for term in ["product", "produkt", "information", "informacja"]):
            # Extract product name
            product_matches = re.findall(r'([A-Za-z0-9\s]{2,}(?:RACS|RCP|RKDS)[A-Za-z0-9\s]*)', question)
            
            if not product_matches:
                # Try more general product keywords
                product_matches = re.findall(r'(?:o|about|on)\s+([A-Za-z0-9\s]{3,})', question_lower)
            
            if product_matches:
                product_name = product_matches[0].strip()
                product_info = self.get_product_info(product_name)
                
                if product_info:
                    return {
                        "question_type": "product_query",
                        "product_info": product_info,
                        "answer": f"Here's information about {product_name}"
                    }
            
        # Default to general search
        results = self.search(question)
        
        return {
            "question_type": "general_query",
            "results": results,
            "answer": f"I found {len(results)} relevant pages that might help answer your question"
        }


class AIAgent:
    """
    An AI agent that uses the website knowledge base to answer questions.
    This is a simplified example that would be integrated with your actual AI system.
    """
    
    def __init__(self, structure_file: str):
        """Initialize the AI agent with a knowledge base"""
        self.knowledge_base = WebsiteKnowledgeBase(structure_file)
        self.current_path = "/"  # Start at root
    
    def process_query(self, query: str) -> str:
        """Process a user query and generate a response"""
        # Handle navigation commands
        if query.startswith("navigate "):
            target = query[len("navigate "):].strip()
            new_path = self.knowledge_base.navigate_path(self.current_path, target)
            
            if new_path in self.knowledge_base.nodes_by_path:
                self.current_path = new_path
                node = self.knowledge_base.get_node_content(new_path)
                
                response = f"Navigated to: {new_path}\n"
                response += f"Title: {node['title']}\n"
                
                if node['children']:
                    response += "\nSubpaths:\n"
                    for i, child in enumerate(node['children'], 1):
                        response += f"{i}. {child['title']} ({child['path']})\n"
                
                return response
            else:
                return f"Path not found: {new_path}"
        
        # Handle search commands
        elif query.startswith("search "):
            search_term = query[len("search "):].strip()
            results = self.knowledge_base.search(search_term)
            
            if results:
                response = f"Found {len(results)} results for '{search_term}':\n\n"
                for i, result in enumerate(results, 1):
                    response += f"{i}. {result['title']} ({result['path']})\n"
                    response += f"   Relevance: {result['relevance']:.2f}\n"
                    response += f"   Preview: {result['content_preview']}\n\n"
                
                return response
            else:
                return f"No results found for '{search_term}'"
        
        # Handle download queries
        elif query.startswith("download ") or "firmware" in query.lower():
            product = query[len("download "):].strip() if query.startswith("download ") else None
            results = self.knowledge_base.find_download_links(product)
            
            if results:
                response = f"Found {len(results)} download pages"
                response += f" for '{product}'" if product else ""
                response += ":\n\n"
                
                for i, result in enumerate(results, 1):
                    response += f"{i}. {result['title']} ({result['path']})\n"
                    if result['links']:
                        response += "   Links:\n"
                        for link in result['links']:
                            response += f"   - {link['text']}\n"
                    response += "\n"
                
                return response
            else:
                return f"No download links found" + (f" for '{product}'" if product else "")
        
        # Handle product info queries
        elif "product" in query.lower() or any(kw in query.lower() for kw in ["racs", "rcp", "rkds"]):
            # Extract product name
            product_matches = re.findall(r'([A-Za-z0-9\s]{2,}(?:RACS|RCP|RKDS)[A-Za-z0-9\s]*)', query)
            
            if product_matches:
                product_name = product_matches[0].strip()
                product_info = self.knowledge_base.get_product_info(product_name)
                
                if product_info:
                    response = f"Information about {product_name}:\n\n"
                    response += f"Title: {product_info['title']}\n"
                    response += f"Path: {product_info['path']}\n\n"
                    response += f"Summary: {product_info['summary']}\n\n"
                    
                    if product_info['features']:
                        response += "Features:\n"
                        for feature in product_info['features']:
                            response += f"- {feature}\n"
                        response += "\n"
                    
                    if product_info['related_pages']:
                        response += "Related Pages:\n"
                        for page in product_info['related_pages']:
                            response += f"- {page['title']} ({page['path']})\n"
                    
                    return response
                else:
                    return f"No product information found for '{product_name}'"
            else:
                return "Please specify which product you're interested in."
        
        # Handle general questions by using the answer_question method
        else:
            answer = self.knowledge_base.answer_question(query)
            
            if answer["question_type"] == "general_query":
                response = answer["answer"] + ":\n\n"
                
                for i, result in enumerate(answer["results"][:5], 1):
                    response += f"{i}. {result['title']} ({result['path']})\n"
                    response += f"   {result['content_preview']}\n\n"
                
                return response
            else:
                # The other question types are already handled above
                return "I didn't understand your question. Try asking about a product, downloads, or use search."
    
    def interactive_mode(self):
        """Run in interactive mode, allowing the user to query the agent"""
        print("AI Agent with Website Knowledge Base")
        print("Type 'exit' or 'quit' to end the session")
        print("Commands: search <term>, navigate <path>, download <product>")
        
        while True:
            query = input(f"\n[{self.current_path}]> ")
            
            if query.lower() in ["exit", "quit", "q"]:
                break
                
            response = self.process_query(query)
            print("\n" + response)


# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python ai_agent.py <structure_file>")
        sys.exit(1)
    
    structure_file = sys.argv[1]
    
    if not os.path.isfile(structure_file):
        print(f"Error: File '{structure_file}' not found")
        sys.exit(1)
    
    agent = AIAgent(structure_file)
    agent.interactive_mode()