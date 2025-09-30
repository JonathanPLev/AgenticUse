// cdp_site_crawler_fixed.cjs
// Production-ready web crawler with enhanced fixes for all identified issues:
// 1. Fixed webdriver property redefinition errors
// 2. Proper tab management and Consent-O-Matic handling
// 3. Enhanced site detection for redirecting sites like x.com
// 4. Better frame navigation handling
// 5. Improved function name recording in debug logs
// 6. Comprehensive error handling and recovery
// TODO: fix consent o matic handling
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { clearInterval } = require('timers');
const { chatbotProviders, viewports, userAgents } = require("./static_data_structs.cjs");
const interactWithAllForms = require("./input_interaction.cjs")
const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { performGenericDetection } = require('./generic_detection_fixed');

const { applyBotMitigation, setRealisticHeaders } = require('./bot_mitigation_final_fix');
const { handleConsentBanners, waitForPageReady } = require('./consent_handler_fixed');
const { instrumentPage } = require('./instrumentation');
const { enhancedInstrumentPage } = require('./enhanced_instrumentation_optimized');

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override');
stealthPlugin.enabledEvasions.delete('webgl.vendor');
stealthPlugin.enabledEvasions.delete('webgl.renderer');
stealthPlugin.enabledEvasions.delete('navigator.webdriver'); // Remove to prevent conflicts
puppeteer.use(stealthPlugin);

const INPUT_CSV = '../top-1m.csv'; // Can also use 'test_URLs.csv' for testing
const OUTPUT_DIR = 'data';
let FLUSH_INTERVAL_MS = 5000;           // adjustable flush interval
let workingUrl = null;
let normalizedURL = null;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const { normalizeUrl, DataQueue, scrollWithPauses, captureFrameDOM, captureAllFrames} = require('./helpers.js')

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
    // 1. Total folder size > 50KB (increased due to streamed files in subdirectories)
    // 2. At least 2 of the 3 required files exist with content
    // 3. No error.log exists, or if it exists, it's small (< 1KB)
    const hasErrorLog = files.includes('error.log');
    const errorLogSize = hasErrorLog ? fs.statSync(path.join(urlDir, 'error.log')).size : 0;
    
    // Calculate size including subdirectories (responses/, html_content/, scripts/)
    // Also check for streaming processor directories that use different slug format
    let totalSizeWithSubdirs = totalSize;
    const subdirs = ['responses', 'html_content', 'scripts'];
    
    // Check subdirectories in current urlDir
    for (const subdir of subdirs) {
      const subdirPath = path.join(urlDir, subdir);
      if (fs.existsSync(subdirPath)) {
        const subdirFiles = fs.readdirSync(subdirPath);
        for (const file of subdirFiles) {
          const filePath = path.join(subdirPath, file);
          const stats = fs.statSync(filePath);
          totalSizeWithSubdirs += stats.size;
        }
      }
    }
    
    // Also check for streaming processor directory with different slug format
    // (e.g., mail.ru vs www___mail__ru)
    const dataDir = path.dirname(urlDir);
    const currentSlug = path.basename(urlDir);
    
    // Look for directories that might contain streamed files for this URL
    try {
      const allDirs = fs.readdirSync(dataDir);
      for (const dir of allDirs) {
        // Skip if it's the current directory or doesn't look like a URL slug
        if (dir === currentSlug || !dir.includes('_')) continue;
        
        // Check if this directory might be for the same URL (contains similar patterns)
        const dirPath = path.join(dataDir, dir);
        const dirStats = fs.statSync(dirPath);
        if (dirStats.isDirectory()) {
          // Check if this directory has streaming subdirectories
          let hasStreamingContent = false;
          for (const subdir of subdirs) {
            const streamingSubdirPath = path.join(dirPath, subdir);
            if (fs.existsSync(streamingSubdirPath)) {
              hasStreamingContent = true;
              const subdirFiles = fs.readdirSync(streamingSubdirPath);
              for (const file of subdirFiles) {
                const filePath = path.join(streamingSubdirPath, file);
                const stats = fs.statSync(filePath);
                totalSizeWithSubdirs += stats.size;
              }
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors when scanning for additional directories
    }
    
    const isComplete = totalSizeWithSubdirs > 51200 && // > 50KB (including streamed files)
                      foundRequiredFiles >= 2 && // At least 2 required files
                      errorLogSize < 1024; // Error log < 1KB or doesn't exist
    
    return isComplete;
  } catch (error) {
    console.warn(`Error checking crawl completeness for ${urlDir}:`, error.message);
    return false;
  }
}

const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
  console.warn(`Consent-O-Matic extension not found at ${extensionDir}, continuing without extension`);
}

const allQueues = [];

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
      console.log(`Loaded ${urls.length} URLs.`);

      // Process each URL with a fresh browser instance
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        // Create a clean domain-based slug from the URL
        const slug = createCleanUrlSlug(url);

        const urlDir = path.join(OUTPUT_DIR, slug);

        // Check if crawl is already complete
        if (isCrawlComplete(urlDir)) {
          console.log(`Skipping already completed site ${i + 1}/${urls.length}: ${url}`);
          continue;
        } else if (fs.existsSync(urlDir)) {
          console.log(`Re-crawling incomplete site ${i + 1}/${urls.length}: ${url}`);

          // Archive incomplete data before re-crawling
          const archiveDir = path.join(urlDir, `incomplete_${Date.now()}`);
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }

          // Move existing files to archive
          const existingFiles = fs.readdirSync(urlDir).filter(f => f !== path.basename(archiveDir));
          for (const file of existingFiles) {
            try {
              if (fs.statSync(path.join(urlDir, file)).isFile()) {
                fs.renameSync(path.join(urlDir, file), path.join(archiveDir, file));
              }
            } catch (err) {
              console.warn(`Could not archive ${file}: ${err.message}`);
            }
          }
        } else {
          console.log(`\nProcessing new site ${i + 1}/${urls.length}: ${url}`);
      console.log(`Starting balanced crawl of ${url}`);
        }

        // Create fresh browser for each site
        let browser = null;
        try {
          // Create profile directory path
          const profilePath = path.join(__dirname, `profile_${i}_${Date.now()}`);
          
          browser = await puppeteer.launch({
            headless: false,   // extensions only work in headful mode
            protocolTimeout: 300000, // Increased to 5 minutes for complex sites
            ignoreDefaultArgs: [
              '--disable-extensions',
              '--disable-extensions-file-access-check',
              '--disable-component-extensions-with-background-pages'
            ],
            args: [
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
              `--disable-extensions-except=${extensionDir}`,
              `--load-extension=${extensionDir}`,
              '--disable-popup-blocking',
              '--disable-default-apps',
              '--disable-extensions-ui-warnings',
              '--disable-extension-welcome-pages'
            ],
            userDataDir: profilePath,
            dumpio: false  // Disable verbose logging to reduce noise
          });

          // Wait for browser to fully initialize
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Close only extension tabs, keep about:blank
          const initialPages = await browser.pages();
          for (const p of initialPages) {
            try {
              const pageUrl = p.url();
              // Only close extension pages, NOT about:blank or empty pages
              if (pageUrl.includes('chrome-extension://') || 
                  pageUrl.includes('consent-o-matic') ||
                  pageUrl.includes('options.html')) {
                console.log(`Closing extension tab at launch: ${pageUrl}`);
                await p.close();
              }
            } catch (e) {
              console.warn(`Could not close initial tab: ${e.message}`);
            }
          }

          // Create site-specific queues array for this iteration
          const siteQueues = [];

          try {
            await processSingleSite(browser, url, siteQueues);
          } catch (err) {
            console.error(`Error processing ${url}:`, err.message);

            // Log error to both central and site-specific logs
            if (!fs.existsSync(urlDir)) {
              fs.mkdirSync(urlDir, { recursive: true });
            }

            // Central error log
            try {
              fs.appendFileSync(
                path.join(OUTPUT_DIR, 'crawl_errors.log'),
                `[${new Date().toISOString()}] ${url}: ${err.stack || err.message}\n\n`
              );
            } catch (logErr) {
              console.warn(`Could not write to central error log: ${logErr.message}`);
            }
            fs.appendFileSync(
              path.join(urlDir, 'error.log'),
              `[${new Date().toISOString()}] ${err.stack || err.message}\n\n`
            );
          } finally {
            // Always close browser after each site
            if (browser) {
              try {
                const pages = await browser.pages();
                for (const page of pages) {
                  if (!page.isClosed()) await page.close();
                }
                await browser.close();
                console.log(`Browser closed for ${url}`);
              } catch (e) {
                console.warn(`Could not close browser cleanly: ${e.message}`);
              }
            }
            
            // Profile cleanup logic: only keep profiles for sites 1, 1001, 2001, etc.
            // Delete profile directory unless it's a milestone (every 1000th site starting from 1)
            const shouldKeepProfile = (i + 1) === 1 || (i + 1) % 1000 === 1;
            
            if (!shouldKeepProfile && profilePath && fs.existsSync(profilePath)) {
              try {
                // Recursively delete the profile directory
                fs.rmSync(profilePath, { recursive: true, force: true });
                console.log(`Deleted temporary profile: profile_${i}_*`);
              } catch (cleanupErr) {
                console.warn(`Could not delete profile ${profilePath}: ${cleanupErr.message}`);
              }
            } else if (shouldKeepProfile) {
              console.log(`Keeping milestone profile for site ${i + 1}: ${profilePath}`);
            }
          }
        } catch (err) {
          console.error(`Failed to process site ${url}:`, err.message);
        }
      }

      console.log('All sites processed successfully!');
    });
})();


// Function to create clean domain-based slugs
function createCleanUrlSlug(url) {
  try {
    // Remove protocol and www prefix, extract clean domain
    let cleanUrl = url
      .replace(/^https?:\/\//, '')  // Remove protocol
      .replace(/^www\./, '')        // Remove www prefix
      .split('/')[0]                // Get just the domain part
      .split('?')[0]                // Remove query parameters
      .split('#')[0];               // Remove fragments
    
    // Keep dots for domains, only replace truly unsafe characters
    cleanUrl = cleanUrl
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')  // Replace unsafe chars but keep dots
      .substring(0, 100);                  // Limit length
    
    return cleanUrl;
  } catch (error) {
    // Fallback to old method if parsing fails
    return url
      .replace(/(^\w+:|^)\//, '')
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .substring(0, 100);
  }
}

async function processSingleSite(browser, url, siteQueues) {
  const slug = createCleanUrlSlug(url);
  const urlDir = path.join(OUTPUT_DIR, slug);
  if (!fs.existsSync(urlDir)) fs.mkdirSync(urlDir, { recursive: true });

  // Redirect terminal output to file for this site
  const termStream = fs.createWriteStream(path.join(urlDir, 'terminal_output.log'));
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;

  process.stdout.write = function(chunk, encoding, callback) {
    termStream.write(chunk, encoding, callback);
    return origStdout.call(process.stdout, chunk, encoding, callback);
  };

  process.stderr.write = function(chunk, encoding, callback) {
    termStream.write(chunk, encoding, callback);
    return origStderr.call(process.stderr, chunk, encoding, callback);
  };

  let page = null;
  let client = null;
  let instrumentationResult = null;

  try {
    console.log('Creating new page...');
    
    // Get existing pages but don't close about:blank - we might reuse it
    const existingPages = await browser.pages();
    let blankPage = null;
    
    for (const p of existingPages) {
      if (!p.isClosed()) {
        const pageUrl = p.url();
        
        // Keep about:blank page for reuse, close others
        if (pageUrl === 'about:blank') {
          blankPage = p;
          console.log(`Keeping blank page for reuse: ${pageUrl}`);
        } else {
          try {
            console.log(`Closing existing tab: ${pageUrl}`);
            await p.close();
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.warn(`Could not close existing tab: ${e.message}`);
          }
        }
      }
    }
    
    // Always create a fresh page to avoid detached frame issues
    page = await browser.newPage();
    console.log('Created fresh page');
    
    // Close any existing blank pages to prevent conflicts
    if (blankPage && !blankPage.isClosed()) {
      try {
        await blankPage.close();
        console.log('Closed existing blank page');
      } catch (e) {
        console.warn(`Could not close blank page: ${e.message}`);
      }
    }
    
    // Verify we're on a clean page
    const currentUrl = page.url();
    console.log(`Starting with clean page: ${currentUrl}`);
    
    // Add page error handlers before navigation
    page.on('error', (error) => {
      console.warn(`Page error: ${error.message}`);
    });
    
    page.on('pageerror', (error) => {
      console.warn(`Page script error: ${error.message}`);
    });
    
    // If somehow we're still on an extension page, force navigate to about:blank first
    if (currentUrl.includes('chrome-extension://') || currentUrl.includes('consent-o-matic')) {
      console.log('Still on extension page, navigating to about:blank first');
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Set realistic headers and user agent
    await setRealisticHeaders(page);

    // Set viewport to common desktop size
    await page.setViewport({ width: 1366, height: 768 });

    // Initialize data queues for this site
    const networkQueue = new DataQueue(path.join(urlDir, 'network.log'), FLUSH_INTERVAL_MS);
    const responseQueue = new DataQueue(path.join(urlDir, 'responses.log'), FLUSH_INTERVAL_MS);
    const consoleQueue = new DataQueue(path.join(urlDir, 'console.log'), FLUSH_INTERVAL_MS);
    const domQueue = new DataQueue(path.join(urlDir, 'dom.log'), FLUSH_INTERVAL_MS);
    const interactionQueue = new DataQueue(path.join(urlDir, 'interactions.log'), FLUSH_INTERVAL_MS);
    const functionTrackingQueue = new DataQueue(path.join(urlDir, 'function_tracking.log'), FLUSH_INTERVAL_MS);

    // Add queues to site-specific array for cleanup
    siteQueues.push(networkQueue, responseQueue, consoleQueue, domQueue, interactionQueue, functionTrackingQueue);

    // Set realistic headers and user agent
    await setRealisticHeaders(page);

    // Navigation with multiple strategies
    console.log(`Navigating to ${url}`);
    let workingUrl = url;
    let navigationSuccess = false;
    
    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      workingUrl = 'https://' + url;
    }
    console.log(`Working URL: ${workingUrl}`);
    console.log(`Normalized URL: ${workingUrl}`);
    console.log(workingUrl);

    try {
      // Multiple navigation strategies with redirect detection
      let navigationSuccess = false;
      const navigationStrategies = [
        { waitUntil: 'domcontentloaded', timeout: 15000 },
        { waitUntil: 'networkidle2', timeout: 20000 },
        { waitUntil: 'load', timeout: 10000 },
        { waitUntil: 'networkidle0', timeout: 25000 }
      ];

      for (const strategy of navigationStrategies) {
        try {
          console.log(`Attempting navigation with strategy: ${strategy.waitUntil}`);
          
          // Validate URL before navigation
          if (!workingUrl || workingUrl === 'about:blank' || !workingUrl.startsWith('http')) {
            throw new Error(`Invalid URL for navigation: ${workingUrl}`);
          }
          
          // Check if page is still valid before navigation
          if (page.isClosed()) {
            throw new Error('Page was closed before navigation');
          }
          
          console.log(`Attempting to navigate to: ${workingUrl}`);
          
          // Navigate with response monitoring and detached frame protection
          const response = await Promise.race([
            page.goto(workingUrl, strategy),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Navigation timeout - frame may be detached')), strategy.timeout + 5000)
            )
          ]);
          
          // Wait for redirects and dynamic content to load
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const finalUrl = page.url();
          const title = await page.title().catch(() => '');
          
          // More comprehensive content check
          const contentCheck = await page.evaluate(() => {
            const bodyText = document.body?.textContent?.trim() || '';
            const hasVisibleElements = document.querySelectorAll('div, p, span, h1, h2, h3, h4, h5, h6').length > 0;
            const hasImages = document.querySelectorAll('img').length > 0;
            const hasLinks = document.querySelectorAll('a').length > 0;
            const hasInputs = document.querySelectorAll('input, textarea, select').length > 0;
            
            return {
              bodyLength: bodyText.length,
              hasVisibleElements,
              hasImages,
              hasLinks,
              hasInputs,
              totalElements: document.querySelectorAll('*').length
            };
          });
          
          console.log(`Navigation result: ${finalUrl}`);
          console.log(`Page title: ${title}`);
          console.log(`Content check:`, contentCheck);
          
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
            console.log(`Navigation succeeded with ${strategy.waitUntil}`);
            navigationSuccess = true;
            workingUrl = finalUrl; // Update working URL to final redirected URL
            
            // Log successful navigation details
            console.log(`   → Final URL: ${finalUrl}`);
            console.log(`   → Title: ${title || 'No title'}`);
            console.log(`   → Body length: ${contentCheck.bodyLength}`);
            console.log(`   → Elements: ${contentCheck.totalElements}`);
            break; // Exit strategy loop on success
          }
          
        } catch (strategyError) {
          console.log(`Navigation strategy ${strategy.waitUntil} failed: ${strategyError.message}`);
          
          // If frame is detached, create a new page and retry
          if (strategyError.message.includes('detached Frame') || strategyError.message.includes('Target closed')) {
            console.log('Frame detached, creating new page...');
            try {
              if (!page.isClosed()) {
                await page.close();
              }
              page = await browser.newPage();
              await setRealisticHeaders(page);
              await page.setViewport({ width: 1366, height: 768 });
              
              // Add error handlers to new page
              page.on('error', (error) => {
                console.warn(`Page error: ${error.message}`);
              });
              
              page.on('pageerror', (error) => {
                console.warn(`Page script error: ${error.message}`);
              });
              
              console.log('Created new page after frame detachment');
            } catch (pageError) {
              console.warn(`Failed to create new page: ${pageError.message}`);
            }
          }
          
          // If this was the last strategy, we'll handle it outside the loop
          if (strategy === navigationStrategies[navigationStrategies.length - 1]) {
            throw new Error(`All navigation strategies failed for ${url} - site may be inaccessible or require special handling`);
          }
          
          // Brief pause before trying next strategy
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Apply bot mitigation after successful navigation
      if (navigationSuccess) {
        console.log('Applying bot mitigation...');
        await applyBotMitigation(page);
        console.log('Bot mitigation applied successfully');
      }
      
    } catch (error) {
      console.error(`Navigation failed for ${url}: ${error.message}`);
      throw error;
    }

    console.log('Handling consent banners with Consent-O-Matic...');
    page = await handleConsentBanners(page, browser);
    console.log('Consent handling completed');
    
    // Ensure we're still on the right page after consent handling
    if (page.isClosed()) {
      const pages = await browser.pages();
      page = pages.find(p => !p.isClosed() && p.url() !== 'about:blank') || pages[0];
      if (!page || page.isClosed()) {
        throw new Error('Lost main page after consent handling');
      }
      await page.bringToFront();
    }


    console.log('Setting up enhanced instrumentation...');
    instrumentationResult = await enhancedInstrumentPage(page, {
      networkQueue,
      responseQueue,
      consoleQueue,
      domQueue,
      interactionQueue,
      functionTrackingQueue,
    });
    console.log('Enhanced instrumentation setup complete');

    client = instrumentationResult.client;
    
    // Enable CDP domains with retry logic
    console.log('Enabling CDP domains...');
    try {
      await client.send('Network.enable');
      console.log('Network.enable enabled successfully');
    } catch (e) {
      console.warn('Network.enable failed:', e.message);
    }
    
    try {
      await client.send('Runtime.enable');
      console.log('Runtime.enable enabled successfully');
    } catch (e) {
      console.warn('Runtime.enable failed:', e.message);
    }
    
    try {
      await client.send('DOM.enable');
      console.log('DOM.enable enabled successfully');
    } catch (e) {
      console.warn('DOM.enable failed:', e.message);
    }

    console.log('Running generic detection (regex-based patterns + iframe support)...');
    const genericDetectionResults = await performGenericDetection(page, {
      enableIframeDetection: true,
      enableAdvancedPatterns: true,
      enableDynamicDetection: true,
      logResults: true
    });
    
    // Log instrumentation status
    if (instrumentationResult) {
      const networkCount = instrumentationResult.getNetworkRequestCount ? instrumentationResult.getNetworkRequestCount() : 0;
      const dynamicStatus = instrumentationResult.getDynamicContentStatus ? instrumentationResult.getDynamicContentStatus() : false;
      const domains = instrumentationResult.getMeaningfulDomains ? instrumentationResult.getMeaningfulDomains() : [];
      
      console.log(`Instrumentation Status:`);
      console.log(`   Network requests: ${networkCount}`);
      console.log(`   Dynamic content: ${dynamicStatus ? 'Detected' : 'None'}`);
      console.log(`   Meaningful domains: ${domains.length}`);
      if (domains.length > 0) {
        console.log(`   Domains: ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? '...' : ''}`);
      }
    }

    // Capture DOM for main frame + iframes
    const { frameTree } = await client.send('Page.getFrameTree');
    await captureFrameDOM(page, domQueue);

    const interactionSummary = await enhancedInputInteraction(page, workingUrl, {
      instrumentPage,
      queues: { networkQueue, responseQueue, consoleQueue, domQueue, interactionQueue, functionTrackingQueue },
      logFile: path.join(urlDir, 'interaction_log.json'),
      maxInteractionsPerPage: 20,
      interactionTimeout: 45000,
      enableBotMitigation: true,
      // Pass generic detection results to enhance interaction targeting
      genericDetectionResults: genericDetectionResults || {}
    });  
    
    // Log the interaction summary
    interactionQueue.enqueue({
      event: 'interactionSummary',
      url: workingUrl,
      summary: interactionSummary,
      timestamp: Date.now()
    });
    
    console.log(`Completed ${interactionSummary.totalInteractions} interactions with ${interactionSummary.totalNetworkRequests} network requests`);
    // Generate comprehensive function tracking report
    console.log('Generating function tracking report...');
    const functionTrackingReport = await instrumentationResult.getFunctionTrackingReport();
    
    if (functionTrackingReport) {
      // Save detailed function tracking report
      try {
        const reportPath = path.join(urlDir, 'function_tracking_report.json');
        await fs.promises.writeFile(reportPath, JSON.stringify(functionTrackingReport, null, 2));
        console.log(`Function tracking report saved to: ${reportPath}`);
      } catch (reportError) {
        console.warn(`Could not save function tracking report: ${reportError.message}`);
      }
    }
    
    console.log(`Crawled ${url} successfully`);
    console.log(`   - Network requests: ${interactionSummary.totalNetworkRequests}`);
    console.log(`   - Input interactions: ${interactionSummary.totalInteractions}`);
    console.log(`   - Elements found: ${interactionSummary.totalElementsFound}`);
    console.log(`   - Generic search elements: ${interactionSummary.genericSearchElements}`);
    console.log(`   - Generic chatbots: ${interactionSummary.genericChatbots}`);
    console.log(`   - Iframe chatbots: ${interactionSummary.iframeChatbots}`);
    if (functionTrackingReport && functionTrackingReport.summary) {
      console.log(`   - Function calls tracked: ${functionTrackingReport.summary.totalFunctionCalls}`);
      console.log(`   - Event listeners tracked: ${functionTrackingReport.summary.totalEventListeners}`);
      console.log(`   - Functions monitored: ${functionTrackingReport.summary.trackedFunctionCount}`);
    }
    
    // Keep original form interaction as fallback/additional coverage
    const finalPage = await interactWithAllForms(page, workingUrl, {
      instrumentPage,
      queues: { networkQueue, responseQueue, consoleQueue, domQueue, interactionQueue, functionTrackingQueue },
      openUrlMode: 'original',
      finalFreshOriginal: true,
      closeSubmissionTabs: true,
      bodyPreviewLimit: null, // Removed size restrictions
    });

  } catch (err) {
    console.error(`Error crawling ${url}:`, err.message);
    
    // Always ensure data is saved even on error
    console.log(`Ensuring data is saved for ${url} despite error...`);
    try {
      // Force flush all queues to save any collected data
      if (siteQueues && siteQueues.length > 0) {
        await Promise.all(siteQueues.map(q => q.flush()));
        console.log(`Successfully saved partial data for ${url}`);
      }
    } catch (flushError) {
      console.warn(`Could not save data for ${url}:`, flushError.message);
    }
    
    throw err; // Re-throw to be handled by caller
  } finally {
    // Restore terminal output
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    termStream.end();
    
    if (client) {
      try {
        if (client._connection && !client._connection._closed) {
          await client.detach();
        }
      } catch (e) {
        // Ignore common cleanup errors that don't affect functionality
        if (!e.message.includes('Session already detached') && !e.message.includes('Connection closed')) {
          console.warn(`Could not detach CDP session: ${e.message}`);
        }
      }
    }
    
    // Cleanup enhanced instrumentation
    if (instrumentationResult && instrumentationResult.cleanup) {
      try {
        instrumentationResult.cleanup();
      } catch (e) {
        console.warn(`Could not cleanup instrumentation: ${e.message}`);
      }
    }
    
    // Close all tabs except main page, then close main page
    try {
      const allPages = await browser.pages();
      for (const p of allPages) {
        if (!p.isClosed()) {
          try {
            await p.close();
          } catch (e) {
            console.warn(`Could not close page ${p.url()}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Error during page cleanup: ${e.message}`);
    }
    
    // Flush site-specific queues and wait for all writes to complete
    try {
      await Promise.all(siteQueues.map(q => q.flush()));
      // Wait for all pending writes to complete
      await Promise.all(siteQueues.map(q => q.waitForFlush ? q.waitForFlush() : Promise.resolve()));
    } catch (e) {
      console.warn(`Could not flush queues: ${e.message}`);
    }
  }
}
