# Pledge 1% Company Profiles Scraper

Scrapes all company names from the [Pledge 1% Company Profiles](https://community.pledge1percent.org/t5/Company-Profiles/tkb-p/company_profiles) community page (395 pages).

## Quick Start

```bash
# Install dependencies
pip install requests playwright

# Install browser for Playwright (one-time setup)
playwright install chromium

# Run the scraper
python pledge1_scraper.py
```

## Usage

```bash
# Auto mode (tries API first, falls back to browser)
python pledge1_scraper.py

# Browser-only mode (most reliable)
python pledge1_scraper.py --method browser

# API-only mode (fastest if it works)
python pledge1_scraper.py --method api

# Custom output file
python pledge1_scraper.py --output my_companies.json
```

## Output

The scraper generates two files:
- `company_names.json` - JSON with metadata and company list
- `company_names.txt` - Simple text file with one company per line

### JSON Format

```json
{
  "total_count": 3950,
  "scraped_at": "2024-12-30 12:00:00 UTC",
  "source": "https://community.pledge1percent.org/t5/Company-Profiles/tkb-p/company_profiles",
  "companies": [
    "Company A",
    "Company B",
    ...
  ]
}
```

## How It Works

The scraper uses multiple approaches:

1. **Khoros LiQL API** (fastest) - The site runs on Khoros Community platform which has a REST API. The scraper attempts to query this first.

2. **Browser Automation** (fallback) - Uses Playwright to render pages like a real browser, extracting company names from the DOM.

## Troubleshooting

### "Playwright not installed"
```bash
pip install playwright
playwright install chromium
```

### Site blocking requests
Try the browser method which is harder to block:
```bash
python pledge1_scraper.py --method browser
```

### Rate limiting
The scraper includes built-in delays. If you still get blocked, increase the delays in the code.

## Technical Details

- **Platform**: Khoros Community (formerly Lithium)
- **Board ID**: `company_profiles`
- **Message Style**: `tkb` (Technical Knowledge Base)
- **Total Pages**: 395
