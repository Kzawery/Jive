import json
import os
import sys
from rich.console import Console
from rich.tree import Tree
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

class WebsiteVisualizer:
    def __init__(self, input_file):
        """Initialize with a processed website structure file"""
        self.console = Console()
        
        # Load the website structure
        with open(input_file, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        
        self.website = self.data["website"]
        self.common_blocks = self.data["common_blocks"]
    
    def display_summary(self):
        """Display a summary of the website structure"""
        self.console.print("\n[bold green]Website Structure Summary[/bold green]")
        
        table = Table(show_header=False)
        table.add_column("Property", style="cyan")
        table.add_column("Value")
        
        table.add_row("Root URL", self.website["root"]["url"])
        table.add_row("Root Title", self.website["root"]["title"])
        table.add_row("Total Pages", str(self.website["pages"]))
        table.add_row("Common Blocks", str(self.website["common_blocks"]))
        
        self.console.print(table)
    
    def display_tree(self, max_depth=None):
        """Display the website structure as a tree"""
        root = self.website["root"]
        
        # Create the root of the tree
        tree = Tree(f"[bold cyan]{root['title']}[/bold cyan] ([link={root['url']}]{root['url']}[/link])")
        
        # Recursively add child nodes
        self._add_node_to_tree(root, tree, 1, max_depth)
        
        self.console.print("\n[bold green]Website Structure Tree[/bold green]")
        self.console.print(tree)
    
    def _add_node_to_tree(self, node, tree, current_depth, max_depth):
        """Recursively add nodes to the tree"""
        if max_depth is not None and current_depth >= max_depth:
            if node.get("children", []):
                tree.add(f"... ({len(node['children'])} more pages)")
            return
        
        # Add child nodes
        for child in node.get("children", []):
            # Determine icon based on page type
            if child.get("is_product", False):
                icon = "🛒"  # Product page
            elif "case_study" in child.get("category", "").lower():
                icon = "📊"  # Case study
            elif "blog" in child.get("url", "").lower():
                icon = "📝"  # Blog
            else:
                icon = "🔗"  # Regular page
            
            # Create node label
            label = f"{icon} [bold]{child.get('title', 'Untitled')}[/bold] ([link={child.get('url', '')}]{child.get('url', '')}[/link])"
            
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
    
    def search_pages(self, query):
        """Search for pages containing the query in title or content"""
        query = query.lower()
        results = []
        
        # Recursive helper function to search through the hierarchy
        def search_node(node):
            matched = False
            
            # Check title
            if query in node.get("title", "").lower():
                matched = True
            
            # Check content
            if "content" in node and query in node.get("content", "").lower():
                matched = True
            
            if matched:
                results.append(node)
            
            # Search children
            for child in node.get("children", []):
                search_node(child)
        
        # Start search from root
        search_node(self.website["root"])
        
        # Display results
        self.console.print(f"\n[bold green]Search Results for '{query}':[/bold green]")
        
        if not results:
            self.console.print("[yellow]No results found[/yellow]")
            return
        
        table = Table(show_header=True)
        table.add_column("Title", style="green")
        table.add_column("URL", style="blue")
        table.add_column("Category", style="magenta")
        
        for page in results:
            table.add_row(
                page.get("title", "Untitled"),
                page.get("url", ""),
                page.get("category", "")
            )
        
        self.console.print(table)
        self.console.print(f"Found {len(results)} results")
    
    def interactive_mode(self):
        """Run in interactive mode allowing user to explore the website structure"""
        self.console.print("[bold cyan]Website Structure Visualizer[/bold cyan]")
        self.console.print("Type 'help' to see available commands")
        
        # Show initial summary
        self.display_summary()
        
        while True:
            command = input("\n> ").strip()
            
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
            elif command.lower() == "blocks":
                self.display_common_blocks()
            elif command.lower().startswith("block "):
                try:
                    block_id = command.split()[1]
                    self.display_block_details(block_id)
                except IndexError:
                    self.console.print("[red]Invalid command. Usage: block [id][/red]")
            elif command.lower().startswith("search "):
                try:
                    query = command.split(" ", 1)[1]
                    self.search_pages(query)
                except IndexError:
                    self.console.print("[red]Invalid command. Usage: search [query][/red]")
            else:
                self.console.print(f"[red]Unknown command: {command}[/red]")
    
    def _show_help(self):
        """Display help information"""
        self.console.print("\n[bold cyan]Available Commands:[/bold cyan]")
        
        table = Table(show_header=False)
        table.add_column("Command", style="green")
        table.add_column("Description")
        
        table.add_row("help", "Show this help message")
        table.add_row("summary", "Display a summary of the website structure")
        table.add_row("tree [depth]", "Display the website structure as a tree (optional depth)")
        table.add_row("blocks", "List all common content blocks")
        table.add_row("block [id]", "Display details for a specific content block")
        table.add_row("search [query]", "Search for pages containing the query")
        table.add_row("exit/quit", "Exit the visualizer")
        
        self.console.print(table)

def main():
    if len(sys.argv) < 2:
        print("Usage: python website_visualizer.py <input_file>")
        return
    
    input_file = sys.argv[1]
    
    if not os.path.isfile(input_file):
        print(f"Error: File '{input_file}' not found")
        return
    
    visualizer = WebsiteVisualizer(input_file)
    visualizer.interactive_mode()

if __name__ == "__main__":
    main()