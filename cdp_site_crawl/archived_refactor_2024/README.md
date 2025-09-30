# Archived Files from Refactoring (2024-09-28)

This directory contains the original files that were consolidated during the major refactoring of the CDP site crawler.

## Files Archived:

### Utilities (consolidated into utils.js):
- `helpers.js` - Helper functions for DOM capture, scrolling, URL normalization
- `static_data_structs.cjs` - Static data structures, patterns, selectors
- `queue_manager.js` - Simple queue management system

### Instrumentation (consolidated into instrumentation-core.js):
- `enhanced_instrumentation_optimized.js` - Main instrumentation engine
- `function_tracker.js` - JavaScript function hijacking and tracking
- `enhanced_network_tracer.js` - Advanced network request correlation
- `streaming_response_processor.js` - Response body streaming to disk

### Input Interaction (consolidated into interaction-core.js):
- `enhanced_input_interaction.js` - Comprehensive input element interaction
- `input_interaction.cjs` - Basic form-based interaction system

### Detection Systems (consolidated into detection-core.js):
- `generic_detection_fixed.js` - Generic chatbot and search detection
- `bot_mitigation_final_fix.js` - Anti-detection and fingerprinting protection
- `consent_handler_fixed.js` - Automated consent banner handling

### Main Crawler (replaced by crawler-core.js):
- `cdp_site_crawler_fixed.cjs` - Original main crawler file (32KB)

## Refactoring Results:
- **Before:** ~214KB across 13+ files
- **After:** ~57KB across 5 core files  
- **Reduction:** 73% smaller codebase
- **Benefits:** Cleaner architecture, eliminated duplication, easier maintenance

## New Architecture:
```
crawler-core.js          # Streamlined main crawler
utils.js                 # All utilities & constants
instrumentation-core.js  # All CDP instrumentation
interaction-core.js      # All input interactions
detection-core.js        # Bot mitigation & detection
```

These archived files are kept for reference and can be restored if needed.
