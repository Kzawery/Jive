BOT_NAME = "roger"

SPIDER_MODULES = ["roger.spiders"]
NEWSPIDER_MODULE = "roger.spiders"


# Obey robots.txt rules
ROBOTSTXT_OBEY = True

FEED_EXPORTERS = {
    'json': 'scrapy.exporters.JsonItemExporter',
    'jsonlines': 'scrapy.exporters.JsonLinesItemExporter',
    'csv': 'scrapy.exporters.CsvItemExporter',
}

ROBOTSTXT_OBEY = True
DOWNLOAD_DELAY = 1  # 1 second between requests
# Set settings whose default value is deprecated to a future-proof value
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
FEED_EXPORT_ENCODING = "utf-8"
