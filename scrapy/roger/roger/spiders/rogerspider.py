import scrapy
from urllib.parse import urlparse
from datetime import datetime
import os
import tempfile
import re
import PyPDF2
import requests
from io import BytesIO

class RogerSpider(scrapy.Spider):
    name = "RogerSpider"
    allowed_domains = ["roger.pl"]
    start_urls = ["https://roger.pl"] 
    
    # Keep track of visited URLs to avoid duplicates
    visited_urls = set()
    
    def parse(self, response):
        # Check if the response is a binary file
        content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()
        if not content_type.startswith('text/html') and not content_type.startswith('text/plain'):
            # For binary files, extract content based on type
            filename = response.url.split('/')[-1]
            
            # For PDFs, extract the text content
            content = ""
            if content_type.startswith('application/pdf') or response.url.lower().endswith('.pdf'):
                try:
                    content = self.extract_pdf_content(response.body, response.url)
                    self.logger.info(f"Extracted {len(content)} characters from PDF: {response.url}")
                except Exception as e:
                    self.logger.error(f"Error extracting PDF content from {response.url}: {e}")
            
            # Generate a better title from the URL path
            better_title = self.generate_title_from_url(response.url)
            
            yield {
                'url': response.url,
                'title': better_title or filename,
                'content': content,  # Now contains extracted PDF text if available
                'category': 'download',
                'is_product': False,
                'download_links': [{
                    'url': response.url,
                    'text': better_title or filename,
                    'type': content_type.split(';')[0]  # Add content type information
                }],
                'timestamp': datetime.now().isoformat()
            }
            return

        # For HTML pages, proceed with normal parsing
        url = response.url
        title = response.css('title::text').get()
        content = ' '.join(response.css('p::text, h1::text, h2::text, h3::text, h4::text, h5::text').getall())
        
        # Determine page category (you may need to customize this)
        category = self.categorize_page(response)
        
        # Check if this is a product page
        is_product = self.is_product_page(response)
        
        # Extract download links if any
        download_links = self.extract_download_links(response)
        
        # Process download links to fetch their content
        processed_download_links = []
        for link in download_links:
            link_url = link['url']
            link_text = link['text']
            
            # For PDF downloads, try to fetch and extract content
            if link_url.lower().endswith('.pdf'):
                try:
                    # Generate better link text if it's just "file" or similar
                    if not link_text or link_text.lower() in ['file', 'download', 'document']:
                        better_text = self.generate_title_from_url(link_url)
                        if better_text:
                            link['text'] = better_text
                    
                    # Try to download and extract PDF content asynchronously
                    # We'll do this in a separate request to avoid blocking
                    yield scrapy.Request(
                        link_url,
                        callback=self.process_pdf_download,
                        meta={'link_info': link, 'parent_url': url},
                        dont_filter=True  # Allow duplicate requests for PDF content
                    )
                except Exception as e:
                    self.logger.error(f"Error processing PDF link {link_url}: {e}")
                    processed_download_links.append(link)
            else:
                processed_download_links.append(link)
        
        # Yield the extracted data for the HTML page
        yield {
            'url': url,
            'title': title,
            'content': content,
            'category': category,
            'is_product': is_product,
            'download_links': processed_download_links,
            'timestamp': datetime.now().isoformat()
        }
        
        # Follow internal links for crawling
        self.visited_urls.add(url)
        for link in response.css('a::attr(href)').getall():
            if self.is_valid_url(response.urljoin(link)):
                yield response.follow(link, self.parse)
    
    def process_pdf_download(self, response):
        """Process downloaded PDF and extract its content"""
        link_info = response.meta.get('link_info', {})
        parent_url = response.meta.get('parent_url', '')
        
        content = ""
        try:
            content = self.extract_pdf_content(response.body, response.url)
            self.logger.info(f"Extracted {len(content)} characters from PDF link: {response.url}")
        except Exception as e:
            self.logger.error(f"Error extracting content from PDF link {response.url}: {e}")
        
        # Generate a better title from the URL path if needed
        title = link_info.get('text', '')
        if not title or title.lower() in ['file', 'download', 'document']:
            title = self.generate_title_from_url(response.url) or title
        
        # Yield the PDF file as a separate item with its content
        yield {
            'url': response.url,
            'title': title,
            'content': content,
            'category': 'download',
            'is_product': False,
            'download_links': [{
                'url': response.url,
                'text': title,
                'type': 'application/pdf'
            }],
            'parent_url': parent_url,
            'timestamp': datetime.now().isoformat()
        }
    
    def extract_pdf_content(self, pdf_data, url):
        """Extract text content from PDF binary data"""
        try:
            # Create a PDF reader object
            pdf_file = BytesIO(pdf_data)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            # Extract text from all pages
            text_content = []
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text_content.append(page.extract_text())
            
            # Join all pages with spacing
            full_text = "\n\n".join(text_content)
            
            # Clean up the text - remove excessive whitespace
            cleaned_text = re.sub(r'\s+', ' ', full_text).strip()
            
            # Return a reasonable amount of text - first 10000 chars to prevent massive items
            return cleaned_text[:10000]
        
        except Exception as e:
            self.logger.error(f"PDF extraction error for {url}: {e}")
            # Try alternative extraction if PyPDF2 fails
            return f"PDF document - extraction failed: {str(e)}"
    
    def generate_title_from_url(self, url):
        """Generate a better title from URL path segments"""
        try:
            # Extract the last meaningful segment from the URL path
            path = urlparse(url).path
            segments = [s for s in path.split('/') if s and s != 'file']
            
            if not segments:
                return None
                
            # Get the last segment before 'file' if it exists
            last_segment = segments[-1]
            
            # Clean up the segment
            clean_segment = last_segment.replace('-', ' ').replace('_', ' ')
            
            # Handle numeric IDs at the beginning
            clean_segment = re.sub(r'^\d+\s+', '', clean_segment)
            
            # Extract manual type if possible
            manual_type = None
            manual_match = re.search(r'(installation|operating|user|product|technical|reference)\s*(manual|guide)', clean_segment, re.I)
            if manual_match:
                manual_type = manual_match.group(0)
            
            # Extract product model
            model_match = re.search(r'([A-Z0-9]+-[0-9]+|[A-Z]+-[0-9]+|[A-Z0-9]{2,6})', clean_segment, re.I)
            model = model_match.group(0) if model_match else None
            
            # Construct a title
            if model and manual_type:
                title = f"{model.upper()} {manual_type.title()}"
            elif model:
                title = f"{model.upper()} Document"
            else:
                # Capitalize words appropriately
                title = ' '.join(word.capitalize() for word in clean_segment.split())
            
            return title
        except:
            return None
    
    def is_valid_url(self, url):
        # Only follow internal links that haven't been visited
        if url in self.visited_urls:
            return False
        
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.replace('www.', '')
        
        # Don't follow images, etc. but allow PDFs
        ignored_extensions = ['.jpg', '.png', '.gif', '.zip']
        if any(url.endswith(ext) for ext in ignored_extensions):
            return False
            
        return domain in self.allowed_domains
    
    def categorize_page(self, response):
        # Simple categorization based on URL and content
        url = response.url.lower()
        
        if '/product' in url or '/shop' in url:
            return 'product'
        elif '/download' in url:
            return 'download'
        elif '/about' in url:
            return 'about'
        elif '/contact' in url:
            return 'contact'
        elif '/blog' in url or '/news' in url:
            return 'article'
        elif '/manual' in url or '/guide' in url:
            return 'documentation'
        else:
            return 'general'
    
    def is_product_page(self, response):
        # Check if page has product characteristics
        has_price = bool(response.css('.price::text').get() or response.xpath('//*[contains(text(), "$")]').get())
        has_buy_button = bool(response.css('button:contains("Buy"), a:contains("Buy")').get())
        product_indicators = ['technical specification', 'product code', 'model', 'sku']
        has_product_indicators = any(response.xpath(f'//*[contains(text(), "{indicator}")]').get() 
                                    for indicator in product_indicators)
        
        return has_price or has_buy_button or has_product_indicators
    
    def extract_download_links(self, response):
        # Extract links that look like downloads
        download_extensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx']
        download_links = []
        
        for link in response.css('a[href]'):
            href = link.css('::attr(href)').get()
            if not href:
                continue
                
            full_url = response.urljoin(href)
            if any(full_url.lower().endswith(ext) for ext in download_extensions):
                # Get link text or use fallback
                link_text = link.css('::text').get()
                if not link_text or link_text.strip() == '':
                    link_text = 'Download'
                    
                # Try to determine file type from extension
                file_type = 'application/octet-stream'  # default fallback
                for ext in download_extensions:
                    if full_url.lower().endswith(ext):
                        if ext == '.pdf':
                            file_type = 'application/pdf'
                        elif ext in ['.doc', '.docx']:
                            file_type = 'application/msword'
                        elif ext in ['.xls', '.xlsx']:
                            file_type = 'application/excel'
                        elif ext == '.zip':
                            file_type = 'application/zip'
                
                download_links.append({
                    'url': full_url,
                    'text': link_text.strip(),
                    'type': file_type
                })
        
        return download_links