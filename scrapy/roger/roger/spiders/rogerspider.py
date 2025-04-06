import scrapy
from urllib.parse import urlparse
from datetime import datetime

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
            # For binary files, just add them to download links
            filename = response.url.split('/')[-1]
            yield {
                'url': response.url,
                'title': filename,
                'content': '',  # No content for binary files
                'category': 'download',
                'is_product': False,
                'download_links': [{
                    'url': response.url,
                    'text': filename,
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
        
        # Yield the extracted data
        yield {
            'url': url,
            'title': title,
            'content': content,
            'category': category,
            'is_product': is_product,
            'download_links': download_links,
            'timestamp': datetime.now().isoformat()
        }
        
        # Follow internal links for crawling
        self.visited_urls.add(url)
        for link in response.css('a::attr(href)').getall():
            if self.is_valid_url(response.urljoin(link)):
                yield response.follow(link, self.parse)
    
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
        else:
            return 'general'
    
    def is_product_page(self, response):
        # Check if page has product characteristics
        has_price = bool(response.css('.price::text').get() or response.xpath('//*[contains(text(), "$")]').get())
        has_buy_button = bool(response.css('button:contains("Buy"), a:contains("Buy")').get())
        
        return has_price or has_buy_button
    
    def extract_download_links(self, response):
        # Extract links that look like downloads
        download_extensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx']
        download_links = []
        
        for link in response.css('a::attr(href)').getall():
            if any(link.endswith(ext) for ext in download_extensions):
                download_links.append({
                    'url': response.urljoin(link),
                    'text': response.css(f'a[href="{link}"]::text').get('Download')
                })
        
        return download_links