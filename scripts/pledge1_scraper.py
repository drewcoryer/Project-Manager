#!/usr/bin/env python3
"""
Pledge 1% Company Profiles Scraper

Scrapes company names from the Pledge 1% community knowledge base.
Uses multiple approaches: Khoros LiQL API, then falls back to browser automation.

Usage:
    python pledge1_scraper.py [--output OUTPUT_FILE] [--method METHOD]

Options:
    --output    Output file path (default: company_names.json)
    --method    Scraping method: api, browser, or auto (default: auto)
"""

import argparse
import asyncio
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
BASE_URL = "https://community.pledge1percent.org"
PROFILES_URL = f"{BASE_URL}/t5/Company-Profiles/tkb-p/company_profiles"
API_URL = f"{BASE_URL}/api/2.0/search"
TOTAL_PAGES = 395


class KhorosAPIScraper:
    """Scraper using Khoros LiQL API (fastest if available)."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
        })

    def fetch_companies_via_api(self, limit: int = 1000, offset: int = 0) -> list[dict]:
        """
        Fetch company profiles using Khoros LiQL API.

        LiQL query to get knowledge base articles from Company-Profiles board.
        """
        # LiQL query to fetch TKB (Technical Knowledge Base) articles
        # 'tkb' is the message style for knowledge base articles in Khoros
        liql_query = f"""
        SELECT id, subject, view_href, post_time, author.login
        FROM messages
        WHERE board.id = 'company_profiles' AND depth = 0
        ORDER BY post_time DESC
        LIMIT {limit} OFFSET {offset}
        """

        params = {'q': liql_query.strip()}

        try:
            response = self.session.get(API_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            if 'data' in data and 'items' in data['data']:
                return data['data']['items']
            return []

        except requests.exceptions.RequestException as e:
            logger.warning(f"API request failed: {e}")
            return []

    def fetch_all_companies(self) -> list[str]:
        """Fetch all company names using API pagination."""
        all_companies = []
        batch_size = 1000
        offset = 0

        logger.info("Attempting to fetch companies via Khoros LiQL API...")

        while True:
            items = self.fetch_companies_via_api(limit=batch_size, offset=offset)

            if not items:
                break

            for item in items:
                subject = item.get('subject', '')
                if subject:
                    all_companies.append(subject)

            logger.info(f"Fetched {len(all_companies)} companies so far...")
            offset += batch_size

            if len(items) < batch_size:
                break

            time.sleep(0.5)  # Rate limiting

        return all_companies


class RequestsScraper:
    """Scraper using requests with session handling."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })

    def extract_company_names_from_html(self, html: str) -> list[str]:
        """Extract company names from HTML content."""
        companies = []

        # Pattern for knowledge base article titles in Khoros communities
        # Looking for article links that contain company profile titles
        patterns = [
            # Pattern for message subject links
            r'<a[^>]*class="[^"]*page-link[^"]*"[^>]*>([^<]+)</a>',
            # Pattern for knowledge base article titles
            r'<h2[^>]*class="[^"]*lia-message-subject[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>',
            # Alternative pattern for article titles
            r'data-subject="([^"]+)"',
            # Pattern for TKB article titles
            r'<span[^>]*class="[^"]*message-subject[^"]*"[^>]*>([^<]+)</span>',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)
            for match in matches:
                name = match.strip()
                if name and len(name) > 1 and name not in companies:
                    companies.append(name)

        return companies

    def fetch_page(self, page_num: int) -> list[str]:
        """Fetch a single page and extract company names."""
        if page_num == 1:
            url = PROFILES_URL
        else:
            url = f"{PROFILES_URL}/page/{page_num}"

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return self.extract_company_names_from_html(response.text)
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to fetch page {page_num}: {e}")
            return []

    def fetch_all_companies(self) -> list[str]:
        """Fetch all company names from all pages."""
        all_companies = []

        logger.info("Fetching companies via HTTP requests...")

        for page in range(1, TOTAL_PAGES + 1):
            companies = self.fetch_page(page)
            all_companies.extend(companies)

            if page % 10 == 0:
                logger.info(f"Processed page {page}/{TOTAL_PAGES}, found {len(all_companies)} companies")

            time.sleep(0.3)  # Rate limiting

        return list(set(all_companies))  # Remove duplicates


class PlaywrightScraper:
    """Scraper using Playwright for browser automation (most reliable)."""

    async def fetch_page(self, page, page_num: int) -> list[str]:
        """Fetch a single page and extract company names."""
        if page_num == 1:
            url = PROFILES_URL
        else:
            url = f"{PROFILES_URL}/page/{page_num}"

        try:
            await page.goto(url, wait_until='networkidle', timeout=60000)
            await page.wait_for_timeout(1000)  # Wait for dynamic content

            # Extract company names from article titles
            # Khoros typically uses these selectors for TKB articles
            selectors = [
                '.lia-message-subject a',
                '.page-link.lia-link-navigation',
                'h2.lia-message-subject a',
                '[data-lia-action-token] a.page-link',
                '.MessageSubject a',
                '.lia-quilt-row-message-list .lia-message-body-content',
            ]

            companies = []

            for selector in selectors:
                try:
                    elements = await page.query_selector_all(selector)
                    for element in elements:
                        text = await element.inner_text()
                        text = text.strip()
                        if text and len(text) > 1:
                            companies.append(text)
                except Exception:
                    continue

            # Also try to get from page content
            if not companies:
                content = await page.content()
                # Look for article titles in the HTML
                patterns = [
                    r'<a[^>]*class="[^"]*page-link[^"]*"[^>]*title="([^"]+)"',
                    r'data-lia-message-subject="([^"]+)"',
                ]
                for pattern in patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    companies.extend(matches)

            return companies

        except Exception as e:
            logger.warning(f"Failed to fetch page {page_num}: {e}")
            return []

    async def fetch_all_companies(self) -> list[str]:
        """Fetch all company names using Playwright browser automation."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright not installed. Install with: pip install playwright && playwright install chromium")
            return []

        all_companies = []

        logger.info("Launching browser for scraping...")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport={'width': 1920, 'height': 1080}
            )
            page = await context.new_page()

            for page_num in range(1, TOTAL_PAGES + 1):
                companies = await self.fetch_page(page, page_num)
                all_companies.extend(companies)

                if page_num % 10 == 0:
                    logger.info(f"Processed page {page_num}/{TOTAL_PAGES}, found {len(all_companies)} companies")

                await page.wait_for_timeout(500)  # Rate limiting

            await browser.close()

        return list(set(all_companies))


class Pledge1Scraper:
    """Main scraper class that coordinates different scraping methods."""

    def __init__(self, method: str = 'auto'):
        self.method = method

    def scrape(self) -> list[str]:
        """
        Scrape company names using the specified method.

        Methods:
            - api: Use Khoros LiQL API (fastest)
            - requests: Use HTTP requests with regex parsing
            - browser: Use Playwright browser automation (most reliable)
            - auto: Try API first, then browser if API fails
        """
        if self.method == 'api':
            return self._scrape_via_api()
        elif self.method == 'requests':
            return self._scrape_via_requests()
        elif self.method == 'browser':
            return self._scrape_via_browser()
        else:  # auto
            return self._scrape_auto()

    def _scrape_via_api(self) -> list[str]:
        """Scrape using Khoros API."""
        scraper = KhorosAPIScraper()
        return scraper.fetch_all_companies()

    def _scrape_via_requests(self) -> list[str]:
        """Scrape using HTTP requests."""
        scraper = RequestsScraper()
        return scraper.fetch_all_companies()

    def _scrape_via_browser(self) -> list[str]:
        """Scrape using browser automation."""
        scraper = PlaywrightScraper()
        return asyncio.run(scraper.fetch_all_companies())

    def _scrape_auto(self) -> list[str]:
        """Try API first, then fall back to browser automation."""
        logger.info("Starting auto-detection mode...")

        # Try API first
        companies = self._scrape_via_api()
        if companies:
            logger.info(f"API method successful! Found {len(companies)} companies.")
            return companies

        logger.info("API method failed or returned no results. Trying browser automation...")

        # Fall back to browser
        companies = self._scrape_via_browser()
        if companies:
            logger.info(f"Browser method successful! Found {len(companies)} companies.")
            return companies

        logger.warning("All methods failed to retrieve company names.")
        return []


def save_results(companies: list[str], output_file: str):
    """Save the scraped company names to a file."""
    output_path = Path(output_file)

    # Sort and deduplicate
    unique_companies = sorted(set(companies), key=str.lower)

    result = {
        'total_count': len(unique_companies),
        'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()),
        'source': PROFILES_URL,
        'companies': unique_companies
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    logger.info(f"Saved {len(unique_companies)} company names to {output_file}")

    # Also save as simple text file
    txt_file = output_path.with_suffix('.txt')
    with open(txt_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(unique_companies))

    logger.info(f"Also saved to {txt_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Scrape company names from Pledge 1% Company Profiles'
    )
    parser.add_argument(
        '--output', '-o',
        default='company_names.json',
        help='Output file path (default: company_names.json)'
    )
    parser.add_argument(
        '--method', '-m',
        choices=['api', 'requests', 'browser', 'auto'],
        default='auto',
        help='Scraping method (default: auto)'
    )

    args = parser.parse_args()

    logger.info(f"Starting Pledge 1% Company Scraper")
    logger.info(f"Target: {PROFILES_URL}")
    logger.info(f"Total pages to scrape: {TOTAL_PAGES}")
    logger.info(f"Method: {args.method}")

    scraper = Pledge1Scraper(method=args.method)
    companies = scraper.scrape()

    if companies:
        save_results(companies, args.output)
        print(f"\n✓ Successfully scraped {len(companies)} unique company names!")
        print(f"  Results saved to: {args.output}")
    else:
        print("\n✗ Failed to scrape any company names.")
        print("  Try running with --method browser for more reliable scraping.")
        sys.exit(1)


if __name__ == '__main__':
    main()
