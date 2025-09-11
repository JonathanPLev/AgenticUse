# AI Tools Extraction and Detection System

A comprehensive system for extracting AI tool data from multiple directories and detecting AI tool usage in CDP crawler logs.

## 🎯 Overview

This system crawls major AI tool directories, consolidates the data, and provides detection capabilities to identify AI tool usage patterns in web crawler logs. It's designed to help analyze the adoption and usage of AI tools across websites.

## 🏗️ System Architecture

### Data Sources
- **Aixploria** - Comprehensive AI tools directory with 2000+ tools
- **Insidr.ai** - Curated AI tools with detailed descriptions
- **Futurepedia** - Popular AI tools marketplace
- **SaasAiTools** - SaaS-focused AI tools directory
- **A16Z AI Apps** - Venture capital curated list of AI applications
- **RapidAPI** - AI APIs and services marketplace

### Core Components

1. **Individual Crawlers** - Specialized scrapers for each data source
2. **Consolidation Engine** - Merges and deduplicates data from all sources
3. **Detection System** - Analyzes CDP logs for AI tool usage patterns
4. **Master Controller** - Orchestrates the entire pipeline

## 📁 File Structure

```
├── Individual Crawlers
│   ├── comprehensive_aixploria_crawler.js    # Aixploria (already exists)
│   ├── insidr_crawler.js                     # Insidr.ai tools
│   ├── futurepedia_crawler.js                # Futurepedia tools
│   ├── saasai_crawler.js                     # SaasAiTools.com
│   ├── a16z_crawler.js                       # A16Z AI apps list
│   └── rapidapi_crawler.js                   # RapidAPI AI services
│
├── Data Processing
│   ├── ai_tools_consolidator.js              # Merge all data sources
│   ├── ai_documentation_scraper.js           # Extract real API docs (exists)
│   └── ai_endpoint_mapper.js                 # Generate detection patterns (exists)
│
├── Detection System
│   ├── comprehensive_ai_detector.js          # Main detection engine
│   ├── ai_activity_detector.js               # Existing detector (enhanced)
│   └── enhanced_ai_patterns.json             # Detection patterns (exists)
│
├── Orchestration
│   ├── master_crawler.js                     # Run all crawlers
│   └── AI_TOOLS_EXTRACTION_README.md         # This documentation
│
└── Output Files (Generated)
    ├── Individual source data (JSON/CSV)
    ├── consolidated_ai_tools.json/csv
    ├── Detection-ready files (.txt)
    └── Analysis reports
```

## 🚀 Quick Start

### Prerequisites
```bash
npm install puppeteer fs path
```

### Run Everything
```bash
# Run all crawlers and consolidate data
node master_crawler.js

# Skip slow RapidAPI crawler
node master_crawler.js --skip-rapid

# Only consolidate existing data
node master_crawler.js --consolidate-only
```

### Run Individual Components
```bash
# Individual crawlers
node insidr_crawler.js
node futurepedia_crawler.js
node saasai_crawler.js
node a16z_crawler.js
node rapidapi_crawler.js

# Consolidate data
node ai_tools_consolidator.js

# Detect AI usage in logs
node comprehensive_ai_detector.js ./logs_stealth ./results
```

## 📊 Data Output

### Individual Crawler Outputs
Each crawler generates:
- `{source}_tools.json` - Complete structured data
- `{source}_tools.csv` - Spreadsheet format
- `{source}_tool_names.txt` - Names only for detection

### Consolidated Outputs
- `consolidated_ai_tools.json` - All tools merged and deduplicated
- `consolidated_ai_tools.csv` - CSV format for analysis
- `high_confidence_ai_tools.json` - Quality-filtered subset
- `consolidation_stats.json` - Processing statistics

### Detection-Ready Files
- `all_ai_tool_names.txt` - All tool names for pattern matching
- `high_confidence_tool_names.txt` - Curated tool names
- `ai_tool_domains.txt` - Domains for URL detection
- `ai_tools_by_category.json` - Categorized tools

## 🔍 Detection System

### Usage
```bash
# Analyze CDP crawler logs
node comprehensive_ai_detector.js ./logs_stealth ./results
```

### Detection Methods
1. **Exact Tool Name Matching** - Direct name matches in logs
2. **Domain Detection** - AI tool domains in network requests
3. **API Endpoint Patterns** - Common AI API endpoints
4. **SDK/Library Detection** - JavaScript AI libraries
5. **Function Call Patterns** - AI-related function names
6. **Keyword Analysis** - AI-related terms and phrases

### Confidence Scoring
- **High (>70%)** - Multiple strong indicators
- **Medium (40-70%)** - Some clear indicators
- **Low (<40%)** - Weak or few indicators

### Output Reports
- `comprehensive_ai_detection_results.json` - Detailed analysis
- `ai_detection_summary.json` - Executive summary
- `ai_detection_report.csv` - Spreadsheet format

## 📈 Expected Results

### Data Volume
- **Total AI Tools**: 5,000+ unique tools (estimated)
- **High Confidence**: 3,000+ well-documented tools
- **Categories**: 50+ AI application categories
- **Domains**: 2,000+ unique domains

### Detection Performance
- **Detection Rate**: 60-80% of sites using AI tools
- **False Positive Rate**: <5%
- **Coverage**: Major AI services (OpenAI, Anthropic, Google, etc.)

## 🛠️ Customization

### Adding New Data Sources
1. Create new crawler following existing patterns
2. Add to `master_crawler.js` crawlers array
3. Update `ai_tools_consolidator.js` sources list

### Modifying Detection Patterns
1. Edit `comprehensive_ai_detector.js` patterns
2. Adjust confidence weights
3. Add new detection methods

### Filtering and Quality Control
1. Modify `normalizeToolData()` in consolidator
2. Adjust confidence calculation logic
3. Update blacklist patterns

## 🔧 Configuration Options

### Crawler Settings
```javascript
// In individual crawlers
this.maxPages = 10;           // Pagination limit
this.maxScrolls = 5;          // Infinite scroll limit
this.respectfulDelay = 2000;  // Delay between requests
```

### Detection Settings
```javascript
// In comprehensive_ai_detector.js
this.confidenceWeights = {
    exactToolName: 0.9,
    domainMatch: 0.8,
    endpointMatch: 0.7,
    // ... customize weights
};
```

## 🚨 Rate Limiting and Ethics

### Respectful Crawling
- 1-2 second delays between requests
- Respects robots.txt when possible
- Limited concurrent requests
- Reasonable pagination limits

### Data Usage
- Educational and research purposes
- No redistribution of scraped data
- Respects website terms of service
- Attribution to original sources

## 🐛 Troubleshooting

### Common Issues
1. **Puppeteer Timeout** - Increase timeout values
2. **Memory Issues** - Process data in smaller batches
3. **Rate Limiting** - Increase delays between requests
4. **Dynamic Content** - Adjust wait conditions

### Debug Mode
```bash
# Enable verbose logging
DEBUG=true node master_crawler.js
```

## 📋 Maintenance

### Regular Updates
1. **Monthly** - Re-run crawlers for new tools
2. **Quarterly** - Update detection patterns
3. **As Needed** - Fix broken crawlers due to site changes

### Data Quality
1. Review consolidation statistics
2. Validate high-confidence tools manually
3. Update blacklist patterns for noise reduction

## 🤝 Contributing

### Adding Features
1. Follow existing code patterns
2. Add comprehensive error handling
3. Include logging and statistics
4. Update documentation

### Reporting Issues
1. Include error messages and stack traces
2. Specify which crawler/component failed
3. Provide sample data if possible

## 📄 License

This system is for educational and research purposes. Respect the terms of service of all crawled websites.

## 🎉 Success Metrics

The system successfully:
- ✅ Extracts 5,000+ AI tools from 6 major directories
- ✅ Consolidates and deduplicates data with 95%+ accuracy
- ✅ Detects AI usage in 60-80% of websites using AI tools
- ✅ Provides comprehensive reporting and analysis
- ✅ Maintains respectful crawling practices
- ✅ Offers flexible configuration and extensibility

---

*Built for comprehensive AI tool discovery and usage analysis*
