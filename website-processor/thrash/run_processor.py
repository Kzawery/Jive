#!/usr/bin/env python3
"""
This script runs the Roger Website Structure Processor on the provided data.
"""

import os
import sys
from roger_site_processor import RogerWebsiteProcessor

def main():
    # Default file names
    DEFAULT_INPUT = "test.json"
    DEFAULT_OUTPUT = "roger_website_structure.json"
    
    # Get file names from command line if provided
    input_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT
    output_file = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT
    
    # Check if input file exists
    if not os.path.isfile(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        return 1
    
    # Process the website data
    print(f"Processing '{input_file}' -> '{output_file}'")
    processor = RogerWebsiteProcessor(input_file, output_file)
    
    if processor.process():
        print("Processing completed successfully.")
        
        # Print next steps
        print("\nNext steps:")
        print(f"1. Explore the website structure with: python website_visualizer.py {output_file}")
        print("2. Use the data in your application")
        return 0
    else:
        print("Processing failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())