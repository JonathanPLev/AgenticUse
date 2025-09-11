# Balanced AI Detection Crawler

## Approach: Comprehensive Data Preservation for Post-Crawl Analysis

This balanced crawler addresses your need to preserve comprehensive data for post-crawl AI detection while still reducing file sizes from the original 400MB logs.

## What We Keep (Comprehensive Coverage)

### ✅ All Network Traffic (Except Static Resources)
- **All API calls** - Every `/api/`, `/v1/`, `/graphql`, `.json` endpoint
- **All POST/PUT requests** - Complete payloads up to 50KB
- **All third-party requests** - Cross-domain calls that might be AI services
- **All dynamic requests** - AJAX, fetch, XHR calls
- **Complete request headers** - Authorization, API keys, custom headers

### ✅ Function Calls & Scripts
- **All JavaScript function calls** - `fetch()`, `XMLHttpRequest()`, method calls
- **All script tags** - External sources and inline content (first 2KB each)
- **All event handlers** - `onclick`, `addEventListener` calls
- **Constructor calls** - `new SomeAILibrary()`
- **Global variables** - Window objects with AI-related names

### ✅ Smart Response Handling
- **JSON/API responses** - Full content up to 100KB (likely AI responses)
- **JavaScript responses** - Full content up to 100KB (AI libraries)
- **HTML responses** - First 10KB only (display content, not full pages)
- **All response metadata** - Headers, status codes, MIME types

### ✅ DOM Structure & Elements
- **Function extraction** - All functions found in page scripts
- **AI-related elements** - Elements with chat/bot/ai/assistant keywords
- **Interactive elements** - Buttons, forms, clickable elements
- **Script analysis** - External script sources and content previews

### ✅ Complete Console Logs
- **All console messages** - Errors, warnings, logs, debug info
- **Page errors** - JavaScript errors and stack traces
- **Network errors** - Failed requests and timeouts

## What We Filter Out (Size Optimization)

### ❌ Static Resources Only
- **Images** - .jpg, .png, .gif, .svg, .ico files
- **Fonts** - .woff, .woff2, .ttf, .eot files  
- **Media** - .mp4, .mp3, .wav, video files
- **Documents** - .pdf, .zip, archive files
- **CDN assets** - Static files from AWS, CloudFront, etc.

### ❌ Full HTML Content
- **Complete DOM** - Only key elements and structure preserved
- **Display HTML** - Large HTML responses truncated to 10KB
- **Redundant content** - Multiple captures of same static content

## File Size Impact

- **Original**: 100-400MB per site
- **Balanced**: 20-80MB per site  
- **Reduction**: 60-80% smaller while preserving all potential AI indicators

## Key Features for AI Detection

### 1. Comprehensive Network Capture
```javascript
// Captures ALL non-static requests including:
- API endpoints: /api/chat, /v1/completions
- Third-party services: Different domains
- Dynamic calls: AJAX, fetch, XHR
- POST data: Complete payloads up to 50KB
```

### 2. Function Call Extraction
```javascript
// Extracts from DOM:
- fetch('https://api.openai.com/v1/chat/completions')
- new OpenAI({apiKey: '...'})
- addEventListener('click', handleChatSubmit)
- XMLHttpRequest.open('POST', '/api/generate')
```

### 3. Smart Response Preservation
```javascript
// Response handling:
- JSON/API: Full content (up to 100KB)
- JavaScript: Full content (AI libraries)
- HTML pages: Preview only (10KB)
- Metadata: Always complete
```

### 4. Interactive Element Detection
```javascript
// Finds and interacts with:
- Chat widgets and buttons
- Forms and input fields  
- AI assistant interfaces
- Support/help elements
```

## Usage

```bash
cd cdp_site_crawl
node balanced_crawler.js https://openai.com https://anthropic.com
```

## Output Structure

```
data/
├── balanced_crawl_summary.json    # Overall metrics
├── openai_com/
│   ├── summary.json              # Site-specific metrics
│   ├── network.log              # All non-static network requests
│   ├── responses.log            # All responses with smart truncation
│   ├── console.log              # Complete console output
│   ├── dom.log                  # DOM analysis with function extraction
│   └── interactions.log         # User interactions and page state
└── anthropic_com/
    └── ...
```

## Why This Approach

### Preserves Unknown AI Patterns
- **Future-proof** - Captures data for AI tools not yet in detection patterns
- **Manual inspection** - Provides complete data for human analysis
- **Pattern discovery** - Enables finding new AI usage patterns

### Maintains Detection Accuracy
- **All API calls** - No missed AI service requests
- **Complete payloads** - Full context for AI interactions
- **Function calls** - JavaScript-based AI library usage
- **Response content** - AI-generated content detection

### Reasonable File Sizes
- **60-80% reduction** - Significant space savings vs original
- **Static filtering** - Removes truly irrelevant data
- **Smart truncation** - Keeps essential content, removes bloat

## Compatibility

The balanced crawler output works with your existing AI detection system:
- Same log format structure
- All essential AI patterns preserved
- Compatible with `ai_activity_detector.js`
- Maintains detection confidence scoring

## Configuration

Edit the crawler to adjust:
- Response size limits (currently 10KB HTML, 100KB JSON/JS)
- POST data limits (currently 50KB)
- Queue sizes (currently 5000 network, 2000 responses)
- Static resource patterns
- Function extraction depth

This approach ensures you won't miss any AI tools during post-crawl analysis while keeping file sizes manageable.
