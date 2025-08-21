#!/usr/bin/env node

// balanced_crawler.js - Comprehensive crawler that preserves data for post-crawl AI detection
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { balancedAIInstrumentPage } = require('./balanced_ai_instrumentation');
const { DataQueue, normalizeUrl } = require('./helpers');
const { handleConsentBanners, waitForPageReady } = require('./consent_handler_fixed');
const { setRealisticHeaders } = require('./bot_mitigation_final_fix');

// FIXED: Enhanced stealth plugin configuration to prevent protocol issues
const stealthPlugin = StealthPlugin();
// Remove problematic evasions that can cause target closure and webdriver conflicts
stealthPlugin.enabledEvasions.delete('user-agent-override');
stealthPlugin.enabledEvasions.delete('webgl.vendor');
stealthPlugin.enabledEvasions.delete('webgl.renderer');
stealthPlugin.enabledEvasions.delete('navigator.webdriver'); // FIXED: Remove to prevent conflicts
puppeteer.use(stealthPlugin);

const INPUT_CSV = '../top-1m.csv'; // Can also use 'test_URLs.csv' for testing
const OUTPUT_DIR = 'data';
let FLUSH_INTERVAL_MS = 5000; // adjustable flush interval

const CONFIG = {
  headless: true,
  timeout: 60000,
  protocolTimeout: 120000,
  maxCrawlTime: 300000, // 5 minutes max per site
  outputDir: OUTPUT_DIR,
  
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-field-trial-config',
    '--disable-ipc-flooding-protection',
    // FIXED: Enhanced iframe and navigation handling
    '--disable-iframe-blocking',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    // FIXED: Better tab management
    '--disable-popup-blocking',
    '--disable-default-apps'
  ]
};

// Function to check if a crawl is complete based on folder size and file contents
function isCrawlComplete(urlDir) {
  if (!fs.existsSync(urlDir)) {
    return false;
  }
  
  try {
    const files = fs.readdirSync(urlDir);
    let totalSize = 0;
    let hasRequiredFiles = false;
    
    // Check for required files and calculate total size
    const requiredFiles = ['network.log', 'dom.log', 'console.log'];
    let foundRequiredFiles = 0;
    
    for (const file of files) {
      const filePath = path.join(urlDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      
      if (requiredFiles.includes(file) && stats.size > 100) { // At least 100 bytes
        foundRequiredFiles++;
      }
    }
    
    // Consider crawl complete if:
    // 1. Total folder size > 5KB (indicates some data was collected)
    // 2. At least 2 of the 3 required files exist with content
    // 3. No error.log exists, or if it exists, it's small (< 1KB)
    const errorLogPath = path.join(urlDir, 'error.log');
    const hasLargeErrorLog = fs.existsSync(errorLogPath) && fs.statSync(errorLogPath).size > 1024;
    
    hasRequiredFiles = foundRequiredFiles >= 2;
    const hasMinimumData = totalSize > 5120; // 5KB
    
    return hasRequiredFiles && hasMinimumData && !hasLargeErrorLog;
  } catch (err) {
    console.warn(`Error checking crawl completeness for ${urlDir}: ${err.message}`);
    return false;
  }
}

/**
 * Create balanced data queues with higher limits for 100MB target
 */
function createBalancedQueues() {
  return {
    networkQueue: new DataQueue('network', 10000),    // 10000 network requests (ALL requests)
    responseQueue: new DataQueue('responses', 5000),  // 5000 responses
    consoleQueue: new DataQueue('console', 2000),     // 2000 console messages
    debugQueue: new DataQueue('debug', 1000),         // 1000 debug messages
    domQueue: new DataQueue('dom', 100),              // 100 DOM snapshots
    interactionQueue: new DataQueue('interactions', 500) // 500 interactions
  };
}

/**
 * Process a single site with balanced data collection
 */
async function processBalancedSite(browser, url, outputDir) {
  const startTime = Date.now();
  console.log(`🔍 Starting balanced crawl of ${url}`);
  
  let page;
  let instrumentation;
  const queues = createBalancedQueues();
  
  try {
    // Create page with optimized settings
    page = await browser.newPage();
    
    // Set realistic headers and user agent
    await setRealisticHeaders(page);
    
    // Set viewport to common desktop size
    await page.setViewport({ width: 1366, height: 768 });
    
    // FIXED: Enhanced consent handling with proper tab management
    console.log('🍪 Handling consent banners with Consent-O-Matic...');
    page = await handleConsentBanners(page, browser);
    console.log('✅ Consent handling completed');
    
    // Set up balanced instrumentation
    console.log('🔧 Setting up balanced instrumentation...');
    instrumentation = await balancedAIInstrumentPage(page, queues);
    console.log('✅ Balanced instrumentation setup complete');
    
    // Enable CDP domains with retry logic
    console.log('🔌 Enabling CDP domains...');
    if (instrumentation && instrumentation.client) {
      try {
        await instrumentation.client.send('Network.enable');
        console.log('✅ Network.enable enabled successfully');
      } catch (e) {
        console.warn('⚠️  Network.enable failed:', e.message);
      }
      
      try {
        await instrumentation.client.send('Runtime.enable');
        console.log('✅ Runtime.enable enabled successfully');
      } catch (e) {
        console.warn('⚠️  Runtime.enable failed:', e.message);
      }
      
      try {
        await instrumentation.client.send('DOM.enable');
        console.log('✅ DOM.enable enabled successfully');
      } catch (e) {
        console.warn('⚠️  DOM.enable failed:', e.message);
      }
    }
    
    // FIXED: Enhanced URL processing and navigation
    let workingUrl = url.startsWith('http') ? url : `https://${url}`;
    let normalizedURL = normalizeUrl(workingUrl);
    
    console.log(`📡 Navigating to ${url}`);
    console.log(`🔗 Working URL: ${workingUrl}`);
    console.log(`🎯 Normalized URL: ${normalizedURL}`);
    
    // Validate URL before navigation
    if (!normalizedURL || normalizedURL === 'about:blank' || !normalizedURL.startsWith('http')) {
      throw new Error(`Invalid URL for navigation: ${normalizedURL}`);
    }
    
    console.log(`🚀 Attempting to navigate to: ${normalizedURL}`);
    
    // FIXED: Multiple navigation strategies with enhanced redirect detection
    let navigationSuccess = false;
    const navigationStrategies = [
      { waitUntil: 'networkidle0', timeout: 60000 },
      { waitUntil: 'domcontentloaded', timeout: 45000 },
      { waitUntil: 'load', timeout: 20000 },
      { waitUntil: 'networkidle2', timeout: 25000 }
    ];
    
    for (const strategy of navigationStrategies) {
      try {
        console.log(`🧭 Attempting navigation with strategy: ${strategy.waitUntil}`);
        
        const response = await page.goto(normalizedURL, strategy);
        
        // Wait for redirects and dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Enhanced content detection
        const finalUrl = page.url();
        const title = await page.title().catch(() => '');
        
        const contentCheck = await page.evaluate(() => {
          const bodyText = document.body?.textContent?.trim() || '';
          const hasVisibleElements = document.querySelectorAll('div, p, span, h1, h2, h3, h4, h5, h6').length > 0;
          const hasImages = document.querySelectorAll('img').length > 0;
          const hasLinks = document.querySelectorAll('a').length > 0;
          const totalElements = document.querySelectorAll('*').length;
          
          return {
            bodyLength: bodyText.length,
            hasVisibleElements,
            hasImages,
            hasLinks,
            totalElements
          };
        });
        
        console.log(`🧭 Navigation result: ${finalUrl}`);
        console.log(`📄 Page title: ${title}`);
        console.log(`📝 Content check:`, contentCheck);
        
        // Enhanced success criteria
        const hasContent = contentCheck.bodyLength > 50 || 
                         contentCheck.hasVisibleElements || 
                         contentCheck.hasImages || 
                         contentCheck.hasLinks || 
                         contentCheck.totalElements > 10;
        
        const isValidUrl = finalUrl && 
                         finalUrl !== 'about:blank' && 
                         !finalUrl.includes('chrome-error://') &&
                         !finalUrl.includes('data:text/html,chromewebdata');
        
        if (isValidUrl && (title || hasContent)) {
          console.log(`✅ Navigation succeeded with ${strategy.waitUntil}`);
          navigationSuccess = true;
          workingUrl = finalUrl; // Update working URL to final redirected URL
          break;
        } else {
          console.warn(`⚠️  Navigation to ${finalUrl} resulted in insufficient content`);
        }
        
      } catch (navError) {
        console.warn(`⚠️  Navigation strategy ${strategy.waitUntil} failed: ${navError.message}`);
        continue;
      }
    }
    
    if (!navigationSuccess) {
      throw new Error(`All navigation strategies failed for ${url} - site may be inaccessible or require special handling`);
    }
    
    // Wait for initial page load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Perform comprehensive interaction to trigger potential AI features
    await performComprehensiveInteraction(page, queues.interactionQueue);
    
    // Wait for triggered network activity
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Capture final page state
    await captureFinalPageState(page, queues);
    
    // Write comprehensive log files
    await writeBalancedLogs(outputDir, queues, url);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed balanced crawl of ${url} in ${duration}ms`);
    
    return {
      success: true,
      duration,
      networkRequests: queues.networkQueue.size(),
      responses: queues.responseQueue.size(),
      consoleMessages: queues.consoleQueue.size(),
      domSnapshots: queues.domQueue.size(),
      interactions: queues.interactionQueue.size()
    };
    
  } catch (error) {
    console.error(`❌ Error crawling ${url}: ${error.message}`);
    
    // Write error log
    const errorLog = {
      url,
      error: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
    
    await fsPromises.writeFile(
      path.join(outputDir, 'error.log'),
      JSON.stringify(errorLog, null, 2)
    );
    
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
    
  } finally {
    // Cleanup
    if (instrumentation?.cleanup) {
      instrumentation.cleanup();
    }
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Perform comprehensive interaction to trigger AI features
 */
async function performComprehensiveInteraction(page, interactionQueue) {
  try {
    console.log(`🖱️  Performing comprehensive interaction`);
    
    // Scroll to load dynamic content
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Look for interactive elements
    const interactiveElements = await page.evaluate(() => {
      const elements = [];
      
      // Find buttons, inputs, and clickable elements
      const selectors = [
        'button', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '.btn', '.button',
        '[onclick]', '[data-action]', '[data-click]',
        // AI/Chat specific selectors
        '[class*="chat"]', '[id*="chat"]', '[class*="bot"]', '[id*="bot"]',
        '[class*="assistant"]', '[id*="assistant"]', '[class*="help"]', '[id*="help"]',
        '[class*="support"]', '[id*="support"]', '[class*="widget"]', '[id*="widget"]'
      ];
      
      selectors.forEach(selector => {
        try {
          const found = document.querySelectorAll(selector);
          found.forEach((el, index) => {
            if (index < 10) { // Limit to first 10 of each type
              elements.push({
                selector,
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                textContent: el.textContent?.substring(0, 100),
                visible: el.offsetParent !== null,
                rect: el.getBoundingClientRect()
              });
            }
          });
        } catch (e) {}
      });
      
      return elements.slice(0, 50); // Limit total elements
    });
    
    interactionQueue?.enqueue?.({
      event: 'interactiveElementsFound',
      elements: interactiveElements,
      timestamp: Date.now()
    });
    
    // Try to interact with promising elements
    for (const element of interactiveElements.slice(0, 5)) {
      try {
        if (element.visible && element.rect.width > 0 && element.rect.height > 0) {
          let selector = element.id ? `#${element.id}` : 
                        element.className ? `.${element.className.split(' ')[0]}` :
                        element.tagName.toLowerCase();
          
          await page.click(selector);
          console.log(`🖱️  Clicked: ${selector}`);
          
          interactionQueue?.enqueue?.({
            event: 'elementClicked',
            selector,
            element,
            timestamp: Date.now()
          });
          
          // Wait for potential response
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (clickError) {
        console.log(`⚠️  Could not click element: ${clickError.message}`);
      }
    }
    
    // Look for and interact with forms
    const forms = await page.$$('form');
    for (let i = 0; i < Math.min(forms.length, 3); i++) {
      try {
        const form = forms[i];
        const inputs = await form.$$('input[type="text"], input[type="email"], textarea');
        
        if (inputs.length > 0) {
          // Fill first input with test data
          await inputs[0].type('test query for AI detection');
          
          interactionQueue?.enqueue?.({
            event: 'formInteraction',
            formIndex: i,
            inputCount: inputs.length,
            timestamp: Date.now()
          });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (formError) {
        console.log(`⚠️  Could not interact with form: ${formError.message}`);
      }
    }
    
  } catch (error) {
    console.warn(`⚠️  Error during comprehensive interaction: ${error.message}`);
  }
}

/**
 * Capture final page state including all scripts and functions
 */
async function captureFinalPageState(page, queues) {
  try {
    console.log(`📸 Capturing final page state`);
    
    // Get all JavaScript execution context info
    const jsContext = await page.evaluate(() => {
      const context = {
        globalVariables: [],
        functions: [],
        eventListeners: [],
        timers: [],
        networkCalls: []
      };
      
      // Capture global variables that might be AI-related
      const aiKeywords = ['ai', 'chat', 'bot', 'assistant', 'openai', 'anthropic', 'claude', 'gpt'];
      
      Object.keys(window).forEach(key => {
        if (aiKeywords.some(keyword => key.toLowerCase().includes(keyword))) {
          context.globalVariables.push({
            name: key,
            type: typeof window[key],
            value: typeof window[key] === 'function' ? '[Function]' : 
                   typeof window[key] === 'object' ? '[Object]' : 
                   String(window[key]).substring(0, 100)
          });
        }
      });
      
      // Capture function calls made during page load
      if (window._jsCalls) {
        context.networkCalls = window._jsCalls.slice(0, 100);
      }
      
      return context;
    });
    
    queues.interactionQueue?.enqueue?.({
      event: 'finalPageState',
      jsContext,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.warn(`⚠️  Error capturing final page state: ${error.message}`);
  }
}

/**
 * Write balanced log files with comprehensive data
 */
async function writeBalancedLogs(outputDir, queues, url) {
  try {
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Write summary with comprehensive metrics
    const summary = {
      url,
      timestamp: Date.now(),
      crawlType: 'balanced',
      metrics: {
        networkRequests: queues.networkQueue.size(),
        responses: queues.responseQueue.size(),
        consoleMessages: queues.consoleQueue.size(),
        domSnapshots: queues.domQueue.size(),
        interactions: queues.interactionQueue.size()
      },
      dataPreservation: {
        allNonStaticRequests: true,
        functionCallsExtracted: true,
        scriptContentPreserved: true,
        responseMetadataComplete: true,
        domStructureAnalyzed: true
      }
    };
    
    await fsPromises.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Write all queue data
    const writePromises = [];
    
    if (queues.networkQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'network.log'),
          queues.networkQueue.getAllAsString()
        )
      );
    }
    
    if (queues.responseQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'responses.log'),
          queues.responseQueue.getAllAsString()
        )
      );
    }
    
    if (queues.consoleQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'console.log'),
          queues.consoleQueue.getAllAsString()
        )
      );
    }
    
    if (queues.domQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'dom.log'),
          queues.domQueue.getAllAsString()
        )
      );
    }
    
    if (queues.interactionQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'interactions.log'),
          queues.interactionQueue.getAllAsString()
        )
      );
    }
    
    if (queues.debugQueue && queues.debugQueue.size() > 0) {
      writePromises.push(
        fsPromises.writeFile(
          path.join(outputDir, 'debug.log'),
          queues.debugQueue.getAllAsString()
        )
      );
    }
    
    await Promise.all(writePromises);
    
    console.log(`📝 Wrote balanced logs to ${outputDir}`);
    
  } catch (error) {
    console.error(`❌ Error writing logs: ${error.message}`);
  }
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Main execution with CSV batch processing
(async () => {
  const urls = [];
  fs.createReadStream(INPUT_CSV)
    .pipe(csv({ headers: false })) // Tranco has no headers
    .on('data', row => { 
      // Tranco format: [id, domain] - we want the domain (index 1)
      const domain = row[1];
      if (domain && domain.trim()) {
        urls.push(domain.trim());
      }
    })
    .on('end', async () => {
      console.log(`🚀 Loaded ${urls.length} URLs for balanced crawling.`);

      // Process each URL with a fresh browser instance
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        
        // Create a filesystem-safe slug from the URL
        const slug = url
          .replace(/(^\w+:|^)\//, '')      // strip protocol
          .replace(/[^a-zA-Z0-9_-]/g, '_');  // replace unsafe chars
        const urlDir = path.join(OUTPUT_DIR, slug);
        
        // Skip if this URL has already been processed and crawl is complete
        if (fs.existsSync(urlDir) && isCrawlComplete(urlDir)) {
          console.log(`\n⏩ Skipping already processed site ${i + 1}/${urls.length}: ${url}`);
          continue;
        }
        
        // Check if this is a re-crawl of an incomplete site
        const isReCrawl = fs.existsSync(urlDir);
        if (isReCrawl) {
          console.log(`\n🔄 Re-crawling incomplete site ${i + 1}/${urls.length}: ${url}`);
          // Archive the incomplete crawl data
          const archiveDir = path.join(urlDir, `incomplete_${Date.now()}`);
          fs.mkdirSync(archiveDir, { recursive: true });
          const files = fs.readdirSync(urlDir);
          for (const file of files) {
            if (file !== `incomplete_${Date.now()}`) {
              const srcPath = path.join(urlDir, file);
              const destPath = path.join(archiveDir, file);
              try {
                fs.renameSync(srcPath, destPath);
              } catch (err) {
                console.warn(`Could not archive ${file}: ${err.message}`);
              }
            }
          }
        } else {
          console.log(`\n🆕 Processing new site ${i + 1}/${urls.length}: ${url}`);
        }
        
        // Launch browser for this URL with Consent-O-Matic extension
        const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
        const browserArgs = [...CONFIG.browserArgs];
        
        // Add extension support if Consent-O-Matic is available
        if (fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
          browserArgs.push(`--disable-extensions-except=${extensionDir}`);
          browserArgs.push(`--load-extension=${extensionDir}`);
          console.log('🍪 Consent-O-Matic extension loaded');
        }
        
        const browser = await puppeteer.launch({
          headless: false, // Extensions require headful mode
          args: browserArgs,
          protocolTimeout: CONFIG.protocolTimeout,
          ignoreDefaultArgs: [
            '--enable-blink-features=IdleDetection',
            '--enable-automation'
          ],
          userDataDir: path.join(__dirname, `profile_${i}_${Date.now()}`),
          dumpio: false
        });
        
        try {
          const result = await processBalancedSite(browser, url, urlDir);
          console.log(`✅ Completed ${url}: ${result.success ? 'Success' : 'Failed'}`);
        } catch (error) {
          console.error(`❌ Error processing ${url}: ${error.message}`);
        } finally {
          await browser.close();
        }
        
        // Brief pause between sites
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log(`\n🎯 Balanced batch crawl completed for ${urls.length} URLs`);
    });
})();

module.exports = { processBalancedSite };
