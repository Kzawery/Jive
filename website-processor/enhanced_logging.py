"""
Enhanced logging module for website structure processor.
This module provides decorators to add detailed logging to any processor class.
"""

import logging
import os
import datetime

class LoggingSystem:
    """
    A configurable logging system that provides detailed output
    for the website structure processor.
    """
    
    def __init__(self, log_level=logging.INFO, log_to_file=True):
        """Initialize the logging system"""
        self.logger = logging.getLogger('website_processor')
        self.logger.setLevel(log_level)
        self.logger.handlers = []  # Clear any existing handlers
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Create console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
        
        # Create file handler if requested
        if log_to_file:
            # Create logs directory if it doesn't exist
            logs_dir = 'logs'
            if not os.path.exists(logs_dir):
                os.makedirs(logs_dir)
                
            # Create log file with timestamp
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            log_file = os.path.join(logs_dir, f'processor_{timestamp}.log')
            
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
            
            print(f"Logging to file: {log_file}")
    
    def get_logger(self):
        """Get the configured logger"""
        return self.logger


def add_logging_to_processor(processor_class):
    """
    Decorator to add logging to website processor methods.
    Replaces print statements with logger calls and adds detailed progress reporting.
    """
    original_init = processor_class.__init__
    
    def __init__(self, *args, **kwargs):
        # Initialize logging system
        logging_system = LoggingSystem()
        self.logger = logging_system.get_logger()
        
        # Call the original __init__
        original_init(self, *args, **kwargs)
        
        self.logger.info("Initialized website processor")
    
    # Replace the __init__ method
    processor_class.__init__ = __init__
    
    return processor_class


def add_progress_tracking(processor_class):
    """Add progress tracking to the content block detection methods"""
    if hasattr(processor_class, '_detect_repeated_content_blocks'):
        original_detect = processor_class._detect_repeated_content_blocks
        
        def _detect_with_progress(self, *args, **kwargs):
            # Initialize progress counters if needed
            if not hasattr(self, '_progress_counters'):
                self._progress_counters = {}
            
            # Reset counters
            self._progress_counters['chunks_processed'] = 0
            self._progress_counters['potential_blocks'] = 0
            self._progress_counters['blocks_added'] = 0
            
            # Call the original method
            result = original_detect(self, *args, **kwargs)
            
            # Log final stats
            if hasattr(self, 'logger'):
                self.logger.info(f"Block detection stats: "
                              f"Processed {self._progress_counters.get('chunks_processed', 0)} chunks, "
                              f"found {self._progress_counters.get('potential_blocks', 0)} potential blocks, "
                              f"added {self._progress_counters.get('blocks_added', 0)} blocks.")
            
            return result
        
        processor_class._detect_repeated_content_blocks = _detect_with_progress
    
    return processor_class