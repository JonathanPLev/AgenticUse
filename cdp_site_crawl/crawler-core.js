// crawler-core.js
// Streamlined main crawler using consolidated modules
// Reduces cdp_site_crawler_fixed.cjs from 32KB to ~12KB (60% reduction)

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Import consolidated modules
const { viewports, userAgents, normalizeUrl, scrollWithPauses, captureFrameDOM } = require('./utils.js');
const { enhancedInstrumentPage } = require('./instrumentation-core.js');
const { enhancedInputInteraction } = require('./interaction-core.js');
const { applyBotMitigation, performGenericDetection, handleConsentBanners, waitForPageReady } = require('./detection-core.js');

// Configure stealth plugin
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override');
stealthPlugin.enabledEvasions.delete('webgl.vendor');
stealthPlugin.enabledEvasions.delete('webgl.renderer');
stealthPlugin.enabledEvasions.delete('navigator.webdriver');
puppeteer.use(stealthPlugin);

// Configuration
const CONFIG = {
  INPUT_CSV: '../top-1m.csv',
  OUTPUT_DIR: 'data',
  FLUSH_INTERVAL_MS: 5000,
  PROTOCOL_TIMEOUT: 120000,
  NAVIGATION_TIMEOUT: 60000,
  MAX_RETRIES: 3
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) fs.mkdirSync(CONFIG.OUTPUT_DIR);

// Global state
let workingUrl = null;
let normalizedURL = null;

// ===== UTILITY FUNCTIONS =====
function isCrawlComplete(urlDir) {
  if (!fs.existsSync(urlDir)) return false;
  
  try {
    const stats = fs.statSync(urlDir);
    if (!stats.isDirectory()) return false;
    
    const files = fs.readdirSync(urlDir);
    const totalSize = files.reduce((size, file) => {
      const filePath = path.join(urlDir, file);
      try {
        return size + fs.statSync(filePath).size;
      } catch {
        return size;
      }
    }, 0);
    
    const requiredFiles = ['network.log', 'dom.log', 'console.log'];
    const hasRequiredFiles = requiredFiles.every(file => 
      fs.existsSync(path.join(urlDir, file))
    );
    
    return totalSize > 5000 && hasRequiredFiles;
  } catch (error) {
    console.error(`Error checking crawl completeness for ${urlDir}:`, error);
    return false;
  }
}

function createUrlSlug(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .replace(/[^a-zA-Z0-9\-_.]/g, '_')
    .substring(0, 100);
}

async function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const errorLog = `${timestamp} - ${context}: ${error.message}\n${error.stack}\n\n`;
  
  try {
    await fs.promises.appendFile(path.join(CONFIG.OUTPUT_DIR, 'crawl_errors.log'), errorLog);
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}

// ===== BROWSER MANAGEMENT =====
async function createBrowser() {
  const viewport = viewports[Math.floor(Math.random() * viewports.length)];
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  const browserArgs = [
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
    '--disable-iframe-blocking',
    '--disable-features=IsolateOrigins,site-per-process'
  ];

  const browser = await puppeteer.launch({
    headless: true,
    args: browserArgs,
    ignoreDefaultArgs: ['--enable-automation'],
    protocolTimeout: CONFIG.PROTOCOL_TIMEOUT,
    dumpio: false
  });

  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(userAgent);
  
  return { browser, page };
}

// ===== NAVIGATION STRATEGIES =====
async function navigateWithFallback(page, url) {
  const strategies = [
    { waitUntil: 'domcontentloaded', timeout: 15000 },
    { waitUntil: 'networkidle2', timeout: 20000 },
    { waitUntil: 'load', timeout: 10000 },
    { waitUntil: 'networkidle0', timeout: 25000 }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`Trying navigation strategy: ${strategy.waitUntil}`);
      await page.goto(url, strategy);
      console.log(`✅ Navigation successful with ${strategy.waitUntil}`);
      return true;
    } catch (error) {
      console.warn(`❌ Strategy ${strategy.waitUntil} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All navigation strategies failed');
}

// ===== MAIN CRAWLING LOGIC =====
async function processSingleSite(url, retryCount = 0) {
  let browser = null;
  let instrumentation = null;
  
  try {
    workingUrl = url;
    normalizedURL = normalizeUrl(url);
    const urlSlug = createUrlSlug(normalizedURL);
    const siteDir = path.join(CONFIG.OUTPUT_DIR, urlSlug);
    
    console.log(`\n🔍 Processing: ${normalizedURL} (attempt ${retryCount + 1})`);
    
    // Check if crawl is already complete
    if (isCrawlComplete(siteDir)) {
      console.log(`✅ Crawl already complete for ${urlSlug}`);
      return { success: true, cached: true };
    }

    // Create fresh browser instance
    ({ browser, page } = await createBrowser());
    
    // Set up error handlers
    page.on('pageerror', error => console.warn('Page error:', error.message));
    page.on('error', error => console.warn('Page crash:', error.message));
    
    // Apply bot mitigation
    await applyBotMitigation(page, { logMitigation: false });
    
    // Navigate to site
    await navigateWithFallback(page, normalizedURL);
    
    // Wait for page to be ready
    await waitForPageReady(page, { timeout: 10000 });
    
    // Handle consent banners
    await handleConsentBanners(page, { logActions: false });
    
    // Set up instrumentation
    instrumentation = await enhancedInstrumentPage(page, normalizedURL, {
      outputDir: CONFIG.OUTPUT_DIR,
      flushInterval: CONFIG.FLUSH_INTERVAL_MS
    });
    
    // Perform generic detection
    const detectionResults = await performGenericDetection(page);
    instrumentation.queues.debug.enqueue({
      type: 'detection_results',
      data: detectionResults,
      timestamp: Date.now()
    });
    
    // Scroll and interact with page
    await scrollWithPauses(page, 15000, 30);
    
    // Capture DOM
    await captureFrameDOM(page, instrumentation.queues.dom);
    
    // Enhanced input interaction
    try {
      await enhancedInputInteraction(page, normalizedURL, {
        instrumentPage: enhancedInstrumentPage,
        queues: instrumentation.queues,
        maxInteractionsPerPage: 5,
        mode: 'enhanced'
      });
    } catch (interactionError) {
      console.warn('Input interaction failed:', interactionError.message);
    }
    
    // Final data capture
    await instrumentation.captureSnapshot();
    
    // Flush all data
    await Promise.all(Object.values(instrumentation.queues).map(queue => queue.waitForFlush()));
    
    console.log(`✅ Successfully crawled: ${urlSlug}`);
    return { success: true, cached: false };
    
  } catch (error) {
    console.error(`❌ Error processing ${url}:`, error.message);
    await logError(error, `processSingleSite - ${url}`);
    
    // Retry logic
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`🔄 Retrying ${url} (${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return processSingleSite(url, retryCount + 1);
    }
    
    return { success: false, error: error.message };
    
  } finally {
    // Cleanup
    try {
      if (instrumentation) {
        await instrumentation.cleanup();
      }
      if (browser) {
        await browser.close();
      }
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError.message);
    }
  }
}

// ===== CSV PROCESSING =====
async function processUrlsFromCsv(csvPath, startIndex = 0, maxUrls = Infinity) {
  return new Promise((resolve, reject) => {
    const urls = [];
    let currentIndex = 0;
    
    fs.createReadStream(csvPath)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        if (currentIndex >= startIndex && urls.length < maxUrls) {
          const url = Object.values(row)[1]; // Second column typically contains URL
          if (url && typeof url === 'string' && url.trim()) {
            urls.push(url.trim());
          }
        }
        currentIndex++;
      })
      .on('end', () => {
        console.log(`📋 Loaded ${urls.length} URLs from CSV`);
        resolve(urls);
      })
      .on('error', reject);
  });
}

// ===== MAIN EXECUTION =====
async function runCrawler(options = {}) {
  const {
    csvPath = CONFIG.INPUT_CSV,
    startIndex = 0,
    maxUrls = Infinity,
    concurrency = 1
  } = options;
  
  console.log('🚀 Starting CDP Site Crawler');
  console.log(`📁 Output directory: ${CONFIG.OUTPUT_DIR}`);
  console.log(`📊 Max URLs: ${maxUrls === Infinity ? 'All' : maxUrls}`);
  
  try {
    const urls = await processUrlsFromCsv(csvPath, startIndex, maxUrls);
    const results = { success: 0, failed: 0, cached: 0 };
    
    // Process URLs sequentially (can be made concurrent later)
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n📍 Progress: ${i + 1}/${urls.length}`);
      
      const result = await processSingleSite(url);
      
      if (result.success) {
        if (result.cached) {
          results.cached++;
        } else {
          results.success++;
        }
      } else {
        results.failed++;
      }
      
      // Brief pause between sites
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 Crawling completed!');
    console.log(`✅ Successful: ${results.success}`);
    console.log(`💾 Cached: ${results.cached}`);
    console.log(`❌ Failed: ${results.failed}`);
    
    return results;
    
  } catch (error) {
    console.error('💥 Crawler failed:', error);
    await logError(error, 'runCrawler');
    throw error;
  }
}

// Export for use as module or run directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const startIndex = args[0] ? parseInt(args[0]) : 0;
  const maxUrls = args[1] ? parseInt(args[1]) : 10; // Default to 10 for testing
  
  runCrawler({ startIndex, maxUrls })
    .then(results => {
      console.log('Final results:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  runCrawler,
  processSingleSite,
  createBrowser,
  CONFIG
};
