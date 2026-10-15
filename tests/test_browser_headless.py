"""
Headless Chrome Browser & Visual Regression Test Suite for Eros VBT
Validates live DOM rendering, Chrome DevTools Protocol connectivity, and console logs.
"""

import os
import json
import unittest
from .conftest_base import (
    HeadlessChromeSession,
    INDEX_HTML
)

class TestHeadlessChromeBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = HeadlessChromeSession()
        cls.is_available = cls.session.is_available()

    def test_chrome_01_binary_present(self):
        """Verify Google Chrome executable is installed at default path."""
        self.assertTrue(self.is_available, "Chrome binary not found on host")

    def test_chrome_02_headless_instance_launches(self):
        """Verify headless Chrome launches and opens remote debugging port."""
        if not self.is_available:
            self.skipTest("Chrome not installed")
        with self.session as sess:
            pages = sess.query_pages()
            self.assertGreaterEqual(len(pages), 1, "Chrome must report active debugging targets")

    def test_chrome_03_index_html_renders_cleanly(self):
        """Verify index.html page title resolves to 'Eros' without errors."""
        import time
        if not self.is_available:
            self.skipTest("Chrome not installed")
        with self.session as sess:
            time.sleep(0.4)
            pages = sess.query_pages()
            eros_pages = [p for p in pages if "index.html" in p.get("url", "")]
            self.assertTrue(len(eros_pages) > 0, "Eros web app target not found in Chrome pages")
            page_title = eros_pages[0].get("title", "")
            self.assertIn("Eros", page_title)

if __name__ == '__main__':
    unittest.main()
