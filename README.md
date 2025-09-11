# AgenticUse - Web Crawler Project

This project contains a comprehensive web crawler system for detecting and analyzing AI tools and chatbots on websites.

## Main Components

### `cdp_site_crawl/`
The primary web crawler system with comprehensive function tracking and AI detection capabilities.

**Key files:**
- `cdp_site_crawler_fixed.cjs` - Main crawler script
- `function_tracker.js` - Advanced function hijacking and tracking
- `enhanced_instrumentation_optimized.js` - Page instrumentation
- `bot_mitigation_final_fix.js` - Anti-detection measures
- `enhanced_input_interaction.js` - Form interaction system

### `top-1m.csv`
Input file containing top websites to crawl (Tranco list format).

## Archived Projects

All previous AI tool extraction, detection, and scraping projects have been organized into subfolders within `cdp_site_crawl/`:

- `archived_projects/` - Previous implementations and experiments
- `datasets/` - CSV files, JSON data, and tool lists
- `scrapers_and_crawlers/` - Various scraper implementations
- `documentation_and_analysis/` - Analysis reports and documentation

## Usage

Run the main crawler:
```bash
cd cdp_site_crawl
node cdp_site_crawler_fixed.cjs
```

## Features

- **Comprehensive Function Tracking**: Hijacks all JavaScript functions with stack trace capture
- **AI Tool Detection**: Advanced pattern matching for chatbots and AI interfaces
- **Anti-Detection**: Sophisticated bot mitigation and stealth techniques
- **Form Interaction**: Automated interaction with forms and UI elements
- **Network Monitoring**: Complete request/response tracking with correlation
- **Error Recovery**: Robust error handling and retry mechanisms

The crawler generates detailed logs including:
- Function call traces with variable capture
- Network request/response data
- DOM interaction logs
- AI detection results
- Error logs and debugging information
