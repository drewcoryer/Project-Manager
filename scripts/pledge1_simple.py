#!/usr/bin/env python3
"""
Simple Pledge 1% Company Scraper using Playwright

This is a straightforward browser-based scraper that's most reliable
for scraping Khoros community sites.

Usage:
    pip install playwright
    playwright install chromium
    python pledge1_simple.py
"""

import asyncio
import json
import time
from pathlib import Path

# Try to import playwright
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Error: Playwright not installed.")
    print("Install with: pip install playwright && playwright install chromium")
    exit(1)

BASE_URL = "https://community.pledge1percent.org"
PROFILES_URL = f"{BASE_URL}/t5/Company-Profiles/tkb-p/company_profiles"
TOTAL_PAGES = 395


async def scrape_companies():
    """Scrape all company names using Playwright."""
    all_companies = []

    print(f"Starting scrape of {TOTAL_PAGES} pages...")
    print(f"URL: {PROFILES_URL}\n")

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080}
        )
        page = await context.new_page()

        for page_num in range(1, TOTAL_PAGES + 1):
            # Construct URL
            if page_num == 1:
                url = PROFILES_URL
            else:
                url = f"{PROFILES_URL}/page/{page_num}"

            try:
                # Navigate to page
                await page.goto(url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(1500)  # Wait for content to load

                # Try multiple selectors to find company names
                # Khoros uses various classes for article titles
                selectors = [
                    'h2.lia-message-subject a.page-link',
                    '.lia-message-subject a',
                    'a.page-link.lia-link-navigation',
                    '.message-subject a',
                    '[data-lia-action-token] .page-link',
                ]

                page_companies = []
                for selector in selectors:
                    elements = await page.query_selector_all(selector)
                    for element in elements:
                        try:
                            # Try to get title attribute first (usually cleaner)
                            title = await element.get_attribute('title')
                            if title:
                                page_companies.append(title.strip())
                            else:
                                # Fall back to inner text
                                text = await element.inner_text()
                                if text:
                                    page_companies.append(text.strip())
                        except Exception:
                            continue

                    if page_companies:
                        break  # Found companies with this selector

                # If no companies found with selectors, try getting all links in message list
                if not page_companies:
                    content = await page.content()
                    import re
                    # Pattern to match article titles in Khoros HTML
                    patterns = [
                        r'<a[^>]*class="[^"]*page-link[^"]*"[^>]*title="([^"]+)"',
                        r'<a[^>]*class="[^"]*page-link[^"]*"[^>]*>([^<]+)</a>',
                    ]
                    for pattern in patterns:
                        matches = re.findall(pattern, content)
                        page_companies.extend([m.strip() for m in matches if m.strip()])
                        if page_companies:
                            break

                # Add unique companies
                for company in page_companies:
                    if company and company not in all_companies and len(company) > 1:
                        # Filter out navigation elements
                        if company.lower() not in ['next', 'previous', 'page', 'first', 'last']:
                            all_companies.append(company)

                # Progress update
                if page_num % 10 == 0 or page_num == 1:
                    print(f"Page {page_num}/{TOTAL_PAGES} - Found {len(all_companies)} companies so far")

            except Exception as e:
                print(f"Error on page {page_num}: {e}")
                continue

            # Small delay to be nice to the server
            await page.wait_for_timeout(300)

        await browser.close()

    return all_companies


def save_results(companies: list[str], output_file: str = "company_names"):
    """Save results to JSON and TXT files."""
    # Sort and deduplicate
    unique_companies = sorted(set(companies), key=str.lower)

    # Save JSON
    result = {
        'total_count': len(unique_companies),
        'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()),
        'source': PROFILES_URL,
        'companies': unique_companies
    }

    json_file = f"{output_file}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {json_file}")

    # Save TXT
    txt_file = f"{output_file}.txt"
    with open(txt_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(unique_companies))
    print(f"Saved to {txt_file}")

    return unique_companies


def main():
    print("=" * 60)
    print("Pledge 1% Company Profiles Scraper")
    print("=" * 60)

    # Run the scraper
    companies = asyncio.run(scrape_companies())

    if companies:
        unique = save_results(companies)
        print(f"\n{'=' * 60}")
        print(f"SUCCESS: Scraped {len(unique)} unique company names!")
        print("=" * 60)
    else:
        print("\nNo companies found. The site structure may have changed.")
        exit(1)


if __name__ == '__main__':
    main()
