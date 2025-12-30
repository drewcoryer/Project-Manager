#!/usr/bin/env python3
"""
Pledge 1% Company Scraper - Requests-only version

Uses HTTP requests with session handling. No browser required.
"""

import json
import re
import time
from html import unescape

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://community.pledge1percent.org"
PROFILES_URL = f"{BASE_URL}/t5/Company-Profiles/tkb-p/company_profiles"
TOTAL_PAGES = 395


def create_session():
    """Create a requests session with retry logic."""
    session = requests.Session()

    # Retry strategy
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)

    # Headers to mimic a real browser
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
    })

    return session


def extract_companies_from_html(html: str) -> list[str]:
    """Extract company names from the HTML content."""
    companies = []

    # Multiple patterns to catch different HTML structures
    patterns = [
        # Khoros message subject with title attribute
        r'<a[^>]*class="[^"]*page-link[^"]*lia-link-navigation[^"]*"[^>]*title="([^"]+)"',
        # Message subject link text
        r'<h2[^>]*class="[^"]*lia-message-subject[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>',
        # Data attribute for subject
        r'data-lia-message-subject="([^"]+)"',
        # Alternative message subject patterns
        r'<span[^>]*class="[^"]*MessageSubject[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>',
        r'class="page-link[^"]*"[^>]*>([^<]+)</a>',
        # TKB article title
        r'<div[^>]*class="[^"]*lia-message-body-content[^"]*"[^>]*>.*?<h\d[^>]*>([^<]+)</h\d>',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)
        for match in matches:
            # Clean up the match
            name = unescape(match.strip())
            # Filter out navigation elements and empty strings
            if (name and
                len(name) > 2 and
                name.lower() not in ['next', 'previous', 'page', 'first', 'last', 'options', 're:'] and
                not name.startswith('Re:') and
                name not in companies):
                companies.append(name)

    return companies


def scrape_page(session: requests.Session, page_num: int) -> list[str]:
    """Scrape a single page for company names."""
    if page_num == 1:
        url = PROFILES_URL
    else:
        url = f"{PROFILES_URL}/page/{page_num}"

    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return extract_companies_from_html(response.text)
    except requests.exceptions.RequestException as e:
        print(f"  Error on page {page_num}: {e}")
        return []


def scrape_all():
    """Scrape all pages for company names."""
    print("=" * 60)
    print("Pledge 1% Company Profiles Scraper (Requests)")
    print("=" * 60)
    print(f"Target: {PROFILES_URL}")
    print(f"Pages: {TOTAL_PAGES}")
    print()

    session = create_session()
    all_companies = []

    # First, initialize session by visiting the main page
    print("Initializing session...")
    try:
        session.get(BASE_URL, timeout=30)
    except Exception as e:
        print(f"Warning: Could not initialize session: {e}")

    print("Starting scrape...\n")

    for page_num in range(1, TOTAL_PAGES + 1):
        companies = scrape_page(session, page_num)

        for company in companies:
            if company not in all_companies:
                all_companies.append(company)

        if page_num % 10 == 0 or page_num == 1:
            print(f"Page {page_num}/{TOTAL_PAGES} - Found {len(all_companies)} unique companies")

        # Rate limiting
        time.sleep(0.5)

    return all_companies


def save_results(companies: list[str]):
    """Save results to files."""
    unique = sorted(set(companies), key=str.lower)

    # JSON output
    result = {
        'total_count': len(unique),
        'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()),
        'source': PROFILES_URL,
        'companies': unique
    }

    with open('company_names.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # Text output
    with open('company_names.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(unique))

    print(f"\nSaved {len(unique)} companies to company_names.json and company_names.txt")


def main():
    companies = scrape_all()

    if companies:
        save_results(companies)
        print(f"\n{'=' * 60}")
        print(f"SUCCESS: Found {len(set(companies))} unique company names!")
        print("=" * 60)
    else:
        print("\nNo companies found. Site may be blocking requests.")
        print("Try running on your local machine instead.")


if __name__ == '__main__':
    main()
