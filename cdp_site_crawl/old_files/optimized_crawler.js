#!/usr/bin/env node

// optimized_crawler.js - Lightweight crawler focused on AI detection
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
const { optimizedAIInstrumentPage, detectAILibraries } = require('./optimized_ai_instrumentation');
const { DataQueue } = require('./helpers');

// Configure stealth plugin without problematic user-agent override
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override');
puppeteer.use(stealthPlugin);

const CONFIG = {
  headless: true,
  timeout: 60000,
  protocolTimeout: 120000,
  maxCrawlTime: 180000, // 3 minutes max per site
  outputDir: './data',
  
  // Optimized browser args for stability and performance
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=TranslateUI',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-default-browser-check',
    '--safebrowsing-disable-auto-update',
    '--enable-automation',
    '--password-store=basic',
    '--use-mock-keychain'
  ]
};

/**
 * Create optimized data queues with size limits
 */
function createOptimizedQueues() {
  return {
    networkQueue: new DataQueue('network', 1000), // Limit to 1000 entries
    responseQueue: new DataQueue('responses', 500), // Limit to 500 entries
    consoleQueue: new DataQueue('console', 200),   // Limit to 200 entries
    debugQueue: new DataQueue('debug', 100),       // Limit to 100 entries
    interactionQueue: new DataQueue('interactions', 100) // Limit to 100 entries
  };
}

/**
 * Process a single site with optimized AI-focused crawling
 */
async function processSingleSite(browser, url, outputDir) {
  const startTime = Date.now();
  console.log(`🔍 Starting optimized crawl of ${url}`);
  
  let page;
  let instrumentation;
  const queues = createOptimizedQueues();
  
  try {
    // Create page with optimized settings
    page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set up optimized instrumentation
    instrumentation = await optimizedAIInstrumentPage(page, queues);
    
    // Navigate with timeout
    console.log(`📡 Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: CONFIG.timeout 
    });
    
    // Wait for initial page load and dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Detect AI libraries in page context
    const aiLibraries = await detectAILibraries(page);
    if (aiLibraries.length > 0) {
      console.log(`🤖 Detected AI libraries: ${aiLibraries.join(', ')}`);
      queues.interactionQueue.enqueue({
        event: 'aiLibrariesDetected',
        libraries: aiLibraries,
        timestamp: Date.now()
      });
    }
    
    // Perform minimal interaction to trigger potential AI features
    try {
      // Look for chat widgets or AI interfaces
      const chatElements = await page.$$eval('*', elements => {
        const chatKeywords = ['chat', 'assistant', 'help', 'support', 'bot'];
        return elements
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const className = el.className?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            return chatKeywords.some(keyword => 
              text.includes(keyword) || className.includes(keyword) || id.includes(keyword)
            );
          })
          .slice(0, 5) // Limit to first 5 matches
          .map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            textContent: el.textContent?.substring(0, 100)
          }));
      });
      
      if (chatElements.length > 0) {
        console.log(`💬 Found ${chatElements.length} potential chat elements`);
        queues.interactionQueue.enqueue({
          event: 'chatElementsDetected',
          elements: chatElements,
          timestamp: Date.now()
        });
      }
      
      // Try to interact with first chat element
      if (chatElements.length > 0) {
        try {
          const firstElement = chatElements[0];
          const selector = firstElement.id ? `#${firstElement.id}` : 
                          firstElement.className ? `.${firstElement.className.split(' ')[0]}` :
                          firstElement.tagName.toLowerCase();
          
          await page.click(selector);
          console.log(`🖱️  Clicked on potential chat element: ${selector}`);
          
          // Wait for potential AI response
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (clickError) {
          console.log(`⚠️  Could not click chat element: ${clickError.message}`);
        }
      }
      
    } catch (interactionError) {
      console.log(`⚠️  Error during interaction: ${interactionError.message}`);
    }
    
    // Wait for any triggered network activity
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Write optimized log files
    await writeOptimizedLogs(outputDir, queues, url, aiLibraries);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed optimized crawl of ${url} in ${duration}ms`);
    
    return {
      success: true,
      duration,
      aiLibraries,
      networkRequests: queues.networkQueue.size(),
      responses: queues.responseQueue.size(),
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
    
    await fs.writeFile(
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
 * Write optimized log files with only essential AI detection data
 */
async function writeOptimizedLogs(outputDir, queues, url, aiLibraries) {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write summary file with key metrics
    const summary = {
      url,
      timestamp: Date.now(),
      aiLibrariesDetected: aiLibraries,
      networkRequests: queues.networkQueue.size(),
      aiRelevantResponses: queues.responseQueue.size(),
      interactions: queues.interactionQueue.size(),
      consoleMessages: queues.consoleQueue.size()
    };
    
    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Write only non-empty queues
    const writePromises = [];
    
    if (queues.networkQueue.size() > 0) {
      writePromises.push(
        fs.writeFile(
          path.join(outputDir, 'network.log'),
          queues.networkQueue.getAllAsString()
        )
      );
    }
    
    if (queues.responseQueue.size() > 0) {
      writePromises.push(
        fs.writeFile(
          path.join(outputDir, 'responses.log'),
          queues.responseQueue.getAllAsString()
        )
      );
    }
    
    if (queues.interactionQueue.size() > 0) {
      writePromises.push(
        fs.writeFile(
          path.join(outputDir, 'interactions.log'),
          queues.interactionQueue.getAllAsString()
        )
      );
    }
    
    if (queues.consoleQueue.size() > 0) {
      writePromises.push(
        fs.writeFile(
          path.join(outputDir, 'console.log'),
          queues.consoleQueue.getAllAsString()
        )
      );
    }
    
    await Promise.all(writePromises);
    
    console.log(`📝 Wrote optimized logs to ${outputDir}`);
    
  } catch (error) {
    console.error(`❌ Error writing logs: ${error.message}`);
  }
}

/**
 * Main crawler function
 */
async function runOptimizedCrawler(urls) {
  console.log(`🚀 Starting optimized AI-focused crawler for ${urls.length} URLs`);
  
  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    args: CONFIG.browserArgs,
    protocolTimeout: CONFIG.protocolTimeout,
    dumpio: false
  });
  
  const results = [];
  
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const urlSlug = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const outputDir = path.join(CONFIG.outputDir, urlSlug);
      
      console.log(`\n[${i + 1}/${urls.length}] Processing: ${url}`);
      
      const result = await processSingleSite(browser, url, outputDir);
      results.push({ url, ...result });
      
      // Brief pause between sites
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } finally {
    await browser.close();
  }
  
  // Write overall summary
  const overallSummary = {
    timestamp: Date.now(),
    totalUrls: urls.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    totalAILibraries: results.reduce((sum, r) => sum + (r.aiLibraries?.length || 0), 0),
    results
  };
  
  await fs.writeFile(
    path.join(CONFIG.outputDir, 'crawl_summary.json'),
    JSON.stringify(overallSummary, null, 2)
  );
  
  console.log(`\n🎯 Optimized crawl completed:`);
  console.log(`   ✅ Successful: ${overallSummary.successful}`);
  console.log(`   ❌ Failed: ${overallSummary.failed}`);
  console.log(`   🤖 AI libraries detected: ${overallSummary.totalAILibraries}`);
  
  return results;
}

// CLI interface
if (require.main === module) {
  const urls = process.argv.slice(2);
  
  if (urls.length === 0) {
    console.log('Usage: node optimized_crawler.js <url1> [url2] [url3] ...');
    console.log('Example: node optimized_crawler.js https://openai.com https://anthropic.com');
    process.exit(1);
  }
  
  runOptimizedCrawler(urls)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Crawler failed:', error);
      process.exit(1);
    });
}

module.exports = { runOptimizedCrawler, processSingleSite };
