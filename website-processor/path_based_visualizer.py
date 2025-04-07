import json
import os
import sys
import re
from rich.console import Console
from rich.tree import Tree
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

class PathBasedVisualizer:
    def __init__(self, input_file):
        """Initialize with a processed website structure file"""
        self.console = Console()
        
        # Load the website structure
        with open(input_file, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        
        self.website = self.data["website"]
        self.common_blocks = self.data["common_blocks"]
        self.master_node = self.website["master_node"]
        self.domain = self.website["domain"]
        
        # Build a flat path map for quick lookups
        self.nodes_by_path = {}
        self._build_path_map(self.master_node)
        
        # Keep track of navigation history
        self.current_path = "/"
        self.navigation_history = ["/"]
        self.history_position = 0
    
    def _build_path_map(self, node, parent_path=None):
        """Recursively build a map of all nodes by path with enhanced content extraction"""
        if "path" in node:
            self.nodes_by_path[node["path"]] = node
            
            # Enhanced content extraction for search
            # Include metadata from the node to make it more searchable
            searchable_content = []
            
            if "title" in node and node["title"]:
                searchable_content.append(node["title"])
                
            if "content" in node and node["content"]:
                searchable_content.append(node["content"])
                
            # Extract filenames and version numbers from content for better firmware searches
            if "content" in node and node["content"]:
                content = node["content"]
                
                # Look for patterns like "ProductName Firmware v1.2.3.45"
                firmware_pattern = re.compile(r'(\w+[-\s]?\w+)\s+Firmware\s+v\.?(\d+\.\d+\.\d+\.?\d*)', re.IGNORECASE)
                firmware_matches = firmware_pattern.findall(content)
                
                for product, version in firmware_matches:
                    searchable_content.append(f"{product} Firmware v{version}")
                    searchable_content.append(f"Firmware {product}")
                    searchable_content.append(f"v{version}")
            
            # Store the searchable content
            node["_searchable_content"] = " ".join(searchable_content)
            
        for child in node.get("children", []):
            self._build_path_map(child, node["path"] if "path" in node else None)
    
    def display_summary(self):
        """Display a summary of the website structure"""
        self.console.print("\n[bold green]Website Structure Summary[/bold green]")
        
        table = Table(show_header=False)
        table.add_column("Property", style="cyan")
        table.add_column("Value")
        
        table.add_row("Domain", self.domain)
        table.add_row("Root Path", self.master_node["path"])
        if "url" in self.master_node:
            table.add_row("Root URL", self.master_node["url"])
        table.add_row("Total Pages", str(self.website["pages"]))
        table.add_row("Total Nodes", str(self.website["nodes"]))
        table.add_row("Common Blocks", str(self.website["common_blocks"]))
        table.add_row("Top-level Sections", str(len(self.master_node.get("children", []))))
        
        self.console.print(table)
    
    def display_tree(self, max_depth=None):
        """Display the website structure as a tree"""
        master = self.master_node
        
        # Create the root of the tree
        root_label = f"[bold cyan]{master['title']}[/bold cyan] (path: {master['path']})"
        if "url" in master:
            root_label += f" ([link={master['url']}]{master['url']}[/link])"
        
        tree = Tree(root_label)
        
        # Recursively add child nodes
        self._add_node_to_tree(master, tree, 1, max_depth)
        
        self.console.print("\n[bold green]Website Structure Tree[/bold green]")
        self.console.print(tree)
    
    def _add_node_to_tree(self, node, tree, current_depth, max_depth):
        """Recursively add nodes to the tree"""
        if max_depth is not None and current_depth >= max_depth:
            if node.get("children", []):
                tree.add(f"... ({len(node['children'])} more nodes)")
            return
        
        # Add child nodes
        for child in node.get("children", []):
            # Determine icon based on page type
            if child.get("is_product", False):
                icon = "🛒"  # Product page
            elif "case_study" in child.get("category", "").lower():
                icon = "📊"  # Case study
            elif "blog" in child.get("path", "").lower():
                icon = "📝"  # Blog
            else:
                icon = "🔗"  # Regular page
            
            # Create node label
            label = f"{icon} [bold]{child.get('title', 'Untitled')}[/bold] (path: {child.get('path', '')})"
            
            # Add common blocks indicators if any
            if "common_blocks" in child and child["common_blocks"]:
                label += f" [dim]({len(child['common_blocks'])} blocks)[/dim]"
            
            # Add child node
            branch = tree.add(label)
            
            # Recursively add children
            self._add_node_to_tree(child, branch, current_depth + 1, max_depth)
    
    def display_common_blocks(self):
        """Display all common content blocks"""
        if not self.common_blocks:
            self.console.print("\n[yellow]No common blocks identified[/yellow]")
            return
        
        self.console.print("\n[bold green]Common Content Blocks[/bold green]")
        
        table = Table(show_header=True)
        table.add_column("ID", style="cyan")
        table.add_column("Name", style="green")
        table.add_column("Type", style="magenta")
        table.add_column("Occurrences", style="blue")
        table.add_column("Preview", style="yellow")
        
        for block_id, block in self.common_blocks.items():
            # Create a preview of the content
            content = block.get("content", "")
            preview = content[:50] + "..." if len(content) > 50 else content
            
            table.add_row(
                block_id,
                block.get("name", ""),
                block.get("type", ""),
                str(len(block.get("occurrences", []))),
                preview
            )
        
        self.console.print(table)
    
    def display_block_details(self, block_id):
        """Display details for a specific block"""
        if block_id not in self.common_blocks:
            self.console.print(f"[bold red]Block ID '{block_id}' not found![/bold red]")
            return
        
        block = self.common_blocks[block_id]
        
        self.console.print(f"\n[bold green]Block: {block.get('name', block_id)}[/bold green]")
        self.console.print(f"Type: {block.get('type', 'Unknown')}")
        self.console.print(f"Used on {len(block.get('occurrences', []))} pages")
        
        # Show occurrences
        self.console.print("\n[bold]Pages using this block:[/bold]")
        for url in block.get("occurrences", []):
            self.console.print(f"  • [link={url}]{url}[/link]")
        
        # Show content
        panel = Panel(block.get("content", ""), title="Content", border_style="green")
        self.console.print(panel)
    
    def _get_current_path(self):
        """Get the current path"""
        return self.current_path
    
    def _add_to_history(self, path):
        """Add a path to navigation history"""
        # If we're not at the end of history, truncate it
        if self.history_position < len(self.navigation_history) - 1:
            self.navigation_history = self.navigation_history[:self.history_position + 1]
        
        # Add the new path if it's different from the current one
        if self.navigation_history[-1] != path:
            self.navigation_history.append(path)
            self.history_position = len(self.navigation_history) - 1
    
    def go_back(self):
        """Navigate back in history"""
        if self.history_position > 0:
            self.history_position -= 1
            path = self.navigation_history[self.history_position]
            self.current_path = path
            node = self.nodes_by_path[path]
            self._display_node_details(node)
            return True
        else:
            self.console.print("[yellow]You're at the beginning of history[/yellow]")
            return False
    
    def go_forward(self):
        """Navigate forward in history"""
        if self.history_position < len(self.navigation_history) - 1:
            self.history_position += 1
            path = self.navigation_history[self.history_position]
            self.current_path = path
            node = self.nodes_by_path[path]
            self._display_node_details(node)
            return True
        else:
            self.console.print("[yellow]You're at the end of history[/yellow]")
            return False
    
    def show_history(self):
        """Show navigation history"""
        self.console.print("\n[bold green]Navigation History:[/bold green]")
        
        for i, path in enumerate(self.navigation_history):
            if i == self.history_position:
                self.console.print(f"  [bold cyan]▶ {i+1}. {path}[/bold cyan] (current)")
            else:
                self.console.print(f"    {i+1}. {path}")
    
    def navigate_to_path(self, path=None):
        """Navigate to and display details for a specific path"""
        if path is None:
            # Show master node by default
            path = self.master_node["path"]
        
        # Ensure path starts with /
        if not path.startswith("/"):
            path = "/" + path
        
        # Try exact match first
        if path in self.nodes_by_path:
            node = self.nodes_by_path[path]
            self._display_node_details(node)
            self.current_path = path
            self._add_to_history(path)
            return True
            
        # If exact match fails, try partial match
        # First by checking if any path starts with the given path
        matching_paths = [p for p in self.nodes_by_path.keys() 
                         if p.startswith(path) and p != path]
        
        if matching_paths:
            # If there's only one match, navigate to it
            if len(matching_paths) == 1:
                node = self.nodes_by_path[matching_paths[0]]
                self.console.print(f"[yellow]Exact path not found. Navigating to closest match: {matching_paths[0]}[/yellow]")
                self._display_node_details(node)
                self.current_path = matching_paths[0]
                self._add_to_history(matching_paths[0])
                return True
            
            # If multiple matches, show options
            self.console.print(f"[yellow]Multiple paths start with '{path}':[/yellow]")
            
            table = Table(show_header=True)
            table.add_column("#", style="cyan")
            table.add_column("Path", style="green")
            table.add_column("Title", style="blue")
            
            for idx, match_path in enumerate(sorted(matching_paths), 1):
                node = self.nodes_by_path[match_path]
                table.add_row(
                    str(idx),
                    match_path,
                    node.get("title", "Untitled")
                )
            
            self.console.print(table)
            self.console.print("Use 'navigate <full-path>' or 'navigate <number>' to view a specific node")
            return True
        
        # Try breaking down the path and navigating to the deepest existing ancestor
        path_parts = path.strip('/').split('/')
        for i in range(len(path_parts), 0, -1):
            ancestor_path = '/' + '/'.join(path_parts[:i])
            if ancestor_path in self.nodes_by_path:
                node = self.nodes_by_path[ancestor_path]
                self.console.print(f"[yellow]Path '{path}' not found. Navigating to closest ancestor: {ancestor_path}[/yellow]")
                self._display_node_details(node)
                self.current_path = ancestor_path
                self._add_to_history(ancestor_path)
                return True
        
        # If all fails, show an error
        self.console.print(f"[bold red]Path '{path}' not found in the website structure![/bold red]")
        return False
    
    def _display_node_details(self, node):
        """Display details for a node"""
        self.console.print(f"\n[bold green]Path: {node['path']}[/bold green]")
        self.console.print(f"Title: {node.get('title', 'Untitled')}")
        self.console.print(f"Category: {node.get('category', 'N/A')}")
        self.console.print(f"Is Product: {'Yes' if node.get('is_product', False) else 'No'}")
        
        # Show full URL for master node
        if "url" in node:
            self.console.print(f"Full URL: {node['url']}")
        else:
            # For other nodes, construct the URL from domain and path
            full_url = f"https://{self.domain}{node['path']}"
            self.console.print(f"Constructed URL: [link={full_url}]{full_url}[/link]")
        
        # Show content preview
        if "content" in node:
            content_preview = node["content"][:200] + "..." if len(node["content"]) > 200 else node["content"]
            panel = Panel(content_preview, title="Content Preview", border_style="blue")
            self.console.print(panel)
        
        # Show common blocks used
        if "common_blocks" in node and node["common_blocks"]:
            self.console.print("\n[bold]Common Blocks Used:[/bold]")
            for block_id, block_name in node["common_blocks"].items():
                self.console.print(f"  • {block_name} ([cyan]{block_id}[/cyan])")
        
        # Show children
        if "children" in node and node["children"]:
            self.console.print("\n[bold]Subpaths:[/bold]")
            for idx, child in enumerate(node["children"], 1):
                self.console.print(f"  {idx}. {child.get('title', 'Untitled')} (path: {child['path']})")
    
    def search_nodes(self, query):
        """Search for nodes containing the query with enhanced matching"""
        # Convert query to lowercase for case-insensitive search
        query_terms = query.lower().split()
        results = []
        
        # Search in all nodes
        for path, node in self.nodes_by_path.items():
            if node is None:
                continue
                
            # Get searchable fields
            title = node.get("title", "").lower() if node.get("title") else ""
            content = node.get("content", "").lower() if node.get("content") else ""
            path_text = path.lower()
            searchable_content = node.get("_searchable_content", "").lower()
            
            # Score the node based on matches
            score = 0
            matches = False
            
            # Check for exact matches first (highest priority)
            if query.lower() in title:
                score += 10
                matches = True
            if query.lower() in content:
                score += 5
                matches = True
            if query.lower() in path_text:
                score += 3
                matches = True
            if query.lower() in searchable_content:
                score += 8
                matches = True
                
            # If no exact matches, try matching individual terms
            if not matches:
                for term in query_terms:
                    # Check for term in various fields
                    if term in title:
                        score += 5
                        matches = True
                    if term in content:
                        score += 3
                        matches = True
                    if term in path_text:
                        score += 2
                        matches = True
                    if term in searchable_content:
                        score += 4
                        matches = True
            
            # Add to results if any match was found
            if matches:
                results.append((node, score))
        
        # Sort results by score (highest first)
        results.sort(key=lambda x: x[1], reverse=True)
        
        # Display results
        self.console.print(f"\n[bold green]Search Results for '{query}':[/bold green]")
        
        if not results:
            self.console.print("[yellow]No results found[/yellow]")
            return
        
        table = Table(show_header=True)
        table.add_column("Title", style="green")
        table.add_column("Path", style="blue")
        table.add_column("Category", style="magenta")
        table.add_column("Relevance", style="cyan")
        
        for node, score in results:
            table.add_row(
                node.get("title", "Untitled"),
                node.get("path", ""),
                node.get("category", ""),
                str(score)
            )
        
        self.console.print(table)
        self.console.print(f"Found {len(results)} results")
        self.console.print("\nUse 'navigate <path>' to view details for a specific result")
    
    def display_file_structure(self, max_depth=None, output_file=None):
        """Display the website structure exactly like a file structure tree"""
        self.console.print("\n[bold green]Website File Structure[/bold green]")
        
        # Start with the root node
        root_node = self.master_node
        
        # Print the root node
        root_label = f"[bold cyan]{root_node.get('title', 'Root')}[/bold cyan] (path: {root_node['path']})"
        if "url" in root_node:
            root_label += f" ({root_node['url']})"
        self.console.print(root_label)
        
        # If output file is specified, open it for writing
        output_fh = None
        if output_file:
            try:
                output_fh = open(output_file, 'w', encoding='utf-8')
                # Write the root node to file
                output_fh.write(f"Website File Structure\n\n")
                output_fh.write(f"{root_node.get('title', 'Root')} (path: {root_node['path']})")
                if "url" in root_node:
                    output_fh.write(f" ({root_node['url']})")
                output_fh.write("\n")
            except IOError as e:
                self.console.print(f"[red]Error opening output file: {e}[/red]")
                output_fh = None
        
        # Get all children of the root, recursively
        self._print_children(root_node, "", max_depth, 1, output_fh)
        
        # Close the output file if it was opened
        if output_fh:
            output_fh.close()
            self.console.print(f"\n[green]File structure saved to: {output_file}[/green]")

    def _print_children(self, node, prefix="", max_depth=None, current_depth=1, output_fh=None):
        """Recursively print all children with proper file-structure indentation"""
        if not node.get("children"):
            return
            
        # Get a sorted list of children for consistent display
        children = sorted(node["children"], key=lambda x: x["path"])
        
        # Check if we've reached max depth
        if max_depth is not None and current_depth > max_depth:
            remaining = len(self._count_all_descendants(node))
            if remaining > 0:
                line = f"{prefix}└── ... ({remaining} more items not shown)"
                self.console.print(line)
                if output_fh:
                    output_fh.write(line + "\n")
            return
        
        # Process each child
        for i, child in enumerate(children):
            is_last = (i == len(children) - 1)
            
            # Determine the connector based on whether this is the last child
            connector = "└── " if is_last else "├── "
            
            # Determine icon based on node type
            if child.get("is_product", False):
                icon = "🛒"  # Product page
            elif "case_study" in child.get("category", "").lower():
                icon = "📊"  # Case study
            elif "blog" in child.get("path", "").lower():
                icon = "📝"  # Blog
            elif "file" in child.get("path", "").lower():
                icon = "📄"  # File
            elif "firmware" in child.get("path", "").lower() or "firmware" in child.get("title", "").lower():
                icon = "⚙️"  # Firmware files
            else:
                icon = "🔗"  # Regular page
                
            # Get path parts
            path = child.get("path", "").strip("/")
            path_parts = path.split("/")
            
            # Create node label
            title = child.get("title", "Untitled")
            
            # Print each path part with proper indentation
            for j, part in enumerate(path_parts):
                is_last_part = (j == len(path_parts) - 1)
                is_last_in_group = is_last and is_last_part
                
                # Determine connector for this part
                part_connector = "└── " if is_last_in_group else "├── "
                
                # Create the line
                if is_last_part:
                    # Last part shows the full information
                    label = f"{icon} {title}"
                    if "common_blocks" in child and child["common_blocks"]:
                        label += f" ({len(child['common_blocks'])} blocks)"
                else:
                    # Intermediate parts just show the directory name
                    label = f"{part}/"
                
                # Calculate indentation
                part_prefix = prefix + ("    " * j)
                
                # Print the line
                line = f"{part_prefix}{part_connector}{label}"
                self.console.print(line)
                if output_fh:
                    output_fh.write(line + "\n")
            
            # Prepare the prefix for children of this node
            child_prefix = prefix + ("    " if is_last else "│   ")
            
            # Recursively print children
            self._print_children(child, child_prefix, max_depth, current_depth + 1, output_fh)

    def _count_all_descendants(self, node):
        """Count all descendants of a node"""
        descendants = []
        
        if not node.get("children"):
            return descendants
            
        for child in node["children"]:
            descendants.append(child)
            descendants.extend(self._count_all_descendants(child))
            
        return descendants

    def interactive_mode(self):
        """Run in interactive mode allowing user to explore the website structure"""
        self.console.print("[bold cyan]Path-Based Website Structure Visualizer[/bold cyan]")
        self.console.print("Type 'help' to see available commands")
        
        # Show initial summary
        self.display_summary()
        
        # Navigate to root to start
        self.navigate_to_path("/")
        
        while True:
            # Show the current path in the prompt
            command = input(f"\n[{self.current_path}]> ").strip()
            
            if command.lower() == "exit" or command.lower() == "quit":
                break
            elif command.lower() == "help":
                self._show_help()
            elif command.lower() == "summary":
                self.display_summary()
            elif command.lower() == "tree":
                self.display_tree()
            elif command.lower().startswith("tree "):
                try:
                    depth = int(command.split()[1])
                    self.display_tree(depth)
                except (IndexError, ValueError):
                    self.console.print("[red]Invalid depth. Usage: tree [depth][/red]")
            elif command.lower() == "filetree":
                # New command for file-structure style tree
                self.display_file_structure()
            elif command.lower().startswith("filetree "):
                # New command with depth parameter and optional output file
                parts = command.split()
                if len(parts) == 2:
                    try:
                        depth = int(parts[1])
                        self.display_file_structure(depth)
                    except ValueError:
                        self.console.print("[red]Invalid depth. Usage: filetree [depth] [output_file][/red]")
                elif len(parts) == 3:
                    try:
                        depth = int(parts[1])
                        output_file = parts[2]
                        self.display_file_structure(depth, output_file)
                    except ValueError:
                        self.console.print("[red]Invalid depth. Usage: filetree [depth] [output_file][/red]")
                else:
                    self.console.print("[red]Invalid command. Usage: filetree [depth] [output_file][/red]")
            elif command.lower() == "blocks":
                self.display_common_blocks()
            elif command.lower().startswith("block "):
                try:
                    block_id = command.split()[1]
                    self.display_block_details(block_id)
                except IndexError:
                    self.console.print("[red]Invalid command. Usage: block [id][/red]")
            elif command.lower() == "home" or command.lower() == "root":
                self.navigate_to_path("/")
            elif command.lower() == "back":
                self.go_back()
            elif command.lower() == "forward":
                self.go_forward()
            elif command.lower() == "history":
                self.show_history()
            elif command.lower().startswith("navigate "):
                try:
                    arg = command.split(" ", 1)[1]
                    
                    # Check if it's a number (to navigate to a child by index)
                    if arg.isdigit():
                        index = int(arg) - 1  # Convert to 0-based index
                        
                        # Get current path
                        current_path = self._get_current_path()
                        
                        # If we have a current path and it has children
                        if current_path and current_path in self.nodes_by_path:
                            current_node = self.nodes_by_path[current_path]
                            
                            if "children" in current_node and current_node["children"]:
                                if 0 <= index < len(current_node["children"]):
                                    child_path = current_node["children"][index]["path"]
                                    self.navigate_to_path(child_path)
                                else:
                                    self.console.print(f"[red]Invalid index. Must be between 1 and {len(current_node['children'])}[/red]")
                            else:
                                self.console.print("[yellow]Current node has no children to navigate to[/yellow]")
                        else:
                            self.console.print("[red]No current path. Please navigate to a path first.[/red]")
                    else:
                        # It's a path
                        self.navigate_to_path(arg)
                except IndexError:
                    self.console.print("[red]Invalid command. Usage: navigate [path|number][/red]")
            elif command.lower().startswith("search "):
                try:
                    query = command.split(" ", 1)[1]
                    self.search_nodes(query)
                except IndexError:
                    self.console.print("[red]Invalid command. Usage: search [query][/red]")
            elif command.isdigit():
                # Shortcut: just entering a number navigates to that child
                index = int(command) - 1
                current_node = self.nodes_by_path[self.current_path]
                
                if "children" in current_node and current_node["children"]:
                    if 0 <= index < len(current_node["children"]):
                        child_path = current_node["children"][index]["path"]
                        self.navigate_to_path(child_path)
                    else:
                        self.console.print(f"[red]Invalid index. Must be between 1 and {len(current_node['children'])}[/red]")
                else:
                    self.console.print("[yellow]Current node has no children to navigate to[/yellow]")
            elif command.lower() == "where" or command.lower() == "pwd":
                # Show current location in the site structure
                self.console.print(f"[green]Current path: {self.current_path}[/green]")
                if self.current_path in self.nodes_by_path:
                    node = self.nodes_by_path[self.current_path]
                    self.console.print(f"Title: {node.get('title', 'Untitled')}")
            elif command.lower() == "up" or command.lower() == "..":
                # Navigate to parent path
                if self.current_path == "/":
                    self.console.print("[yellow]Already at root path[/yellow]")
                else:
                    parent_path = "/" + "/".join(self.current_path.strip("/").split("/")[:-1])
                    if not parent_path.startswith("/"):
                        parent_path = "/" + parent_path
                    if parent_path == "":
                        parent_path = "/"
                    self.navigate_to_path(parent_path)
            else:
                self.console.print(f"[red]Unknown command: {command}[/red]")
    
    def _show_help(self):
        """Display help information"""
        self.console.print("\n[bold cyan]Available Commands:[/bold cyan]")
        
        table = Table(show_header=False)
        table.add_column("Command", style="green")
        table.add_column("Description")
        
        # General commands
        table.add_row("help", "Show this help message")
        table.add_row("summary", "Display a summary of the website structure")
        table.add_row("tree [depth]", "Display the website structure as a tree (optional depth)")
        table.add_row("filetree [depth]", "Display the website structure as a file-like tree (optional depth)")
        table.add_row("exit/quit", "Exit the visualizer")
        
        self.console.print(table)
        
        # Navigation commands
        self.console.print("\n[bold cyan]Navigation Commands:[/bold cyan]")
        
        nav_table = Table(show_header=False)
        nav_table.add_column("Command", style="green")
        nav_table.add_column("Description")
        
        nav_table.add_row("home/root", "Navigate to the root node")
        nav_table.add_row("navigate [path]", "Navigate to a specific path")
        nav_table.add_row("[number]", "Navigate to a child node by its number")
        nav_table.add_row("up/..", "Navigate to parent path")
        nav_table.add_row("back", "Navigate back in history")
        nav_table.add_row("forward", "Navigate forward in history")
        nav_table.add_row("history", "Show navigation history")
        nav_table.add_row("where/pwd", "Show current path")
        
        self.console.print(nav_table)
        
        # Content commands
        self.console.print("\n[bold cyan]Content Commands:[/bold cyan]")
        
        content_table = Table(show_header=False)
        content_table.add_column("Command", style="green")
        content_table.add_column("Description")
        
        content_table.add_row("blocks", "List all common content blocks")
        content_table.add_row("block [id]", "Display details for a specific content block")
        content_table.add_row("search [query]", "Search for nodes containing the query (enhanced)")
        
        self.console.print(content_table)

def main():
    if len(sys.argv) < 2:
        print("Usage: python path_based_visualizer.py <input_file>")
        return
    
    input_file = sys.argv[1]
    
    if not os.path.isfile(input_file):
        print(f"Error: File '{input_file}' not found")
        return
    
    visualizer = PathBasedVisualizer(input_file)
    visualizer.interactive_mode()

if __name__ == "__main__":
    main()