// cdp_site_crawler.cjs
// Production-ready web crawler with advanced bot mitigation, automatic cookie consent handling,
// comprehensive input interaction, and detailed network/DOM instrumentation.
// crawl_with_puppeteer.js
// A Puppeteer + CDP crawler with batching, network tracking (including request body), DOM snapshots (including iframes),
// runtime/console capture, Debugger instrumentation breakpoints, and basic bot-mitigation.
// find a paper that talks about using some method/algorithm to find search bars
// see if there's more papers about finding chatbots
// https://link.springer.com/chapter/10.1007/978-3-031-20891-1_23
// searchbot: https://www.mdpi.com/2078-2489/5/4/634#:~:text=An%20important%20step%20in%20classifying,a%20human%20to%20determine%20the
// implement cookie banner acceptance, yash's github
// https://github.com/Yash-Vekaria/ad-crawler?tab=readme-ov-file#steps-to-setup-crawler
// 2-3 days chatbot finder and [COMPLETE] searchbar detection
// try to enter text into every possible entry, see if we can trigger an AI service.
// 2-3 finalize crawler, check if it detects AI use on websites that i know have AI use ~5 websites
// sqlite
// 1 day: pipeline of regexs, see if detection works
// 1 day: start crawl on 1000 pages
// 3-4 days: get list of AI tools and regexs to run on 1000 pages. finalize script
// 3 days: run offline tool, see if it works
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { clearInterval } = require('timers');
const { chatbotProviders, viewports, userAgents } = require("./static_data_structs.cjs");
const interactWithAllForms = require("./input_interaction.cjs")
const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { performGenericDetection } = require('./generic_detection');
const { applyBotMitigation, setRealisticHeaders } = require('./bot_mitigation');
const { handleConsentBanners, waitForPageReady } = require('./consent_handler');
const { instrumentPage } = require('./instrumentation');
const { enhancedInstrumentPage } = require('./enhanced_instrumentation');

// Plugins for basic bot mitigation with error handling
// Use a more minimal stealth configuration to avoid protocol issues
const stealthPlugin = StealthPlugin();
// Remove problematic evasions that can cause target closure
stealthPlugin.enabledEvasions.delete('user-agent-override');
stealthPlugin.enabledEvasions.delete('webgl.vendor');
stealthPlugin.enabledEvasions.delete('webgl.renderer');
puppeteer.use(stealthPlugin);

const INPUT_CSV = '../tranco_3N2WL.csv'; // Can also use 'test_URLs.csv' for testing
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

const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
  throw new Error(`manifest.json not found in ${extensionDir}`);
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
            if (!file.startsWith('incomplete_')) {
              try {
                fs.renameSync(path.join(urlDir, file), path.join(archiveDir, file));
              } catch (err) {
                console.warn(`⚠️  Could not archive ${file}: ${err.message}`);
              }
            }
          }
        } else {
          console.log(`\n🌐 Processing site ${i + 1}/${urls.length}: ${url}`);
        }
        
        // Create fresh browser for each site
        let browser = null;
        try {
          browser = await puppeteer.launch({
            headless: false,   // extensions only work in headful mode
            protocolTimeout: 120000, // Increased to 2 minutes for problematic sites
            ignoreDefaultArgs: [
              '--disable-extensions',
              '--disable-component-extensions-with-background-pages',
              '--disable-blink-features=AutomationControlled,MojoJS',
              '--disable-iframe-blocking'  // Add this to prevent iframe blocking
            ],
            args: [
              `--disable-extensions-except=${extensionDir}`,
              `--load-extension=${extensionDir}`,
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-zygote',
              '--disable-gpu',
              '--disable-features=IsolateOrigins,site-per-process',  // Add this for better iframe handling
              '--disable-web-security',  // Help with CORS issues
              '--disable-features=VizDisplayCompositor',  // Reduce GPU issues
              '--disable-backgrounding-occluded-windows',  // Keep tabs active
              '--disable-renderer-backgrounding'  // Keep renderer active
            ],
            userDataDir: path.join(__dirname, `profile_${i}_${Date.now()}`),
            dumpio: false  // Disable verbose logging to reduce noise
          });

          // Create site-specific queues array for this iteration
          const siteQueues = [];
          
          try {
            await processSingleSite(browser, url, siteQueues);
          } catch (err) {
            const errorLog = `❌ [${new Date().toISOString()}] Failed to process site ${url}: ${err.message}\n`;
            console.error(errorLog);
            // Log error to a central error log file
            fs.appendFileSync(path.join(OUTPUT_DIR, 'crawl_errors.log'), errorLog);
            // Log the full error stack to the URL-specific log directory
            if (url) {
              const slug = url.replace(/(^\w+:|^)\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
              const urlDir = path.join(OUTPUT_DIR, slug);
              if (!fs.existsSync(urlDir)) {
                fs.mkdirSync(urlDir, { recursive: true });
              }
              fs.appendFileSync(
                path.join(urlDir, 'error.log'),
                `[${new Date().toISOString()}] ${err.stack || err.message}\n\n`
              );
            }
          } finally {
            // Always close browser after each site
            if (browser) {
              try {
                const pages = await browser.pages();
                await Promise.all(pages.map(page => page.close().catch(() => {})));
                await browser.close();
                console.log(`🔒 Browser closed for ${url}`);
              } catch (e) {
                console.warn(`⚠️  Could not close browser cleanly: ${e.message}`);
              }
            }
          }
        } catch (err) {
          console.error(`❌ Failed to process site ${url}:`, err.message);
        }
      }
      
      console.log('✅ All sites processed successfully!');
    });
})();

// Extract site processing logic into a separate function
async function processSingleSite(browser, url, siteQueues) {

  // const normalizedURL = normalizeUrl(url)
  // 1) make a filesystem-safe "slug" from the URL
  const slug = url
    .replace(/(^\w+:|^)\/\//, '')      // strip protocol
    .replace(/[^a-zA-Z0-9_-]/g, '_');  // replace unsafe chars

  // 2) make the folder: data/<slug>/
  const urlDir = path.join(OUTPUT_DIR, slug);
  fs.mkdirSync(urlDir, { recursive: true });

  // ~~ Save terminal output ~~
  // open a write‐stream for all terminal output
  const termStream = fs.createWriteStream(path.join(urlDir, 'terminal.log'), { flags: 'a' });

  // save originals
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  // override them
  process.stdout.write = (chunk, encoding, callback) => {
    termStream.write(chunk, encoding, callback);
    return origStdout(chunk, encoding, callback);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    termStream.write(chunk, encoding, callback);
    return origStderr(chunk, encoding, callback);
  };
  
  let page = null;
  let client = null;
  let instrumentationResult = null;
  
  try {
    // 3) create queues that write into that folder
    const networkQueue = new DataQueue(path.join(urlDir, 'network.log'));
    const domQueue     = new DataQueue(path.join(urlDir, 'dom.log'));
    const responseQueue = new DataQueue(path.join(urlDir, 'responses.log'));
    const consoleQueue = new DataQueue(path.join(urlDir, 'console.log'));
    const debugQueue   = new DataQueue(path.join(urlDir, 'debug.log'));
    const interactionQueue = new DataQueue(path.join(urlDir, 'interactions.log'));
    const detectionQueue = new DataQueue(path.join(urlDir, 'detection.log'));

    // Add queues to site-specific array for cleanup
    siteQueues.push(networkQueue, domQueue, responseQueue, consoleQueue, debugQueue, interactionQueue, detectionQueue);
    
    // 1) figure out which full URL actually works:
    let pageCreationRetries = 3;
    while (pageCreationRetries > 0) {
      try {
        page = await browser.newPage();
        
        // Add page error handlers before instrumentation
        page.on('error', error => {
          console.error(`🚨 Page crashed: ${error.message}`);
        });
        
        page.on('pageerror', error => {
          console.warn(`⚠️  Page error: ${error.message}`);
        });
        
        // Wait a moment for page to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        instrumentationResult = await enhancedInstrumentPage(page, {
          networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue
        });
        break; // Success
      } catch (pageError) {
        pageCreationRetries--;
        console.warn(`⚠️  Page creation attempt failed (${3 - pageCreationRetries}/3): ${pageError.message}`);
        
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (e) {}
        }
        
        if (pageCreationRetries === 0) {
          throw new Error(`Failed to create page after 3 attempts: ${pageError.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Set basic page properties (but don't run full bot mitigation yet)
    await page.setUserAgent(
      userAgents[Math.floor(Math.random() * userAgents.length)]
    );
    await page.setViewport(viewports[Math.floor(Math.random() * viewports.length)]);
    await setRealisticHeaders(page);
        
    detectionQueue.enqueue({ event: 'crawlStarted', timestamp: Date.now() }); // to ensure detection log always exists
    
    // Create CDP session with proper error handling and retry logic
    let cdpRetries = 3;
    while (cdpRetries > 0) {
      try {
        // Wait a bit before creating CDP session to ensure page is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if page target is available
        const target = page.target();
        if (!target) {
          throw new Error('No page target available');
        }
        
        // Wait for target to be properly initialized
        let targetReady = false;
        for (let i = 0; i < 10; i++) {
          if (target.url() && target.url() !== 'about:blank') {
            targetReady = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`Target URL: ${target.url()}, ready: ${targetReady}`);
        
        client = await target.createCDPSession();
        break; // Success, exit retry loop
      } catch (cdpError) {
        cdpRetries--;
        console.warn(`⚠️  CDP session creation attempt failed (${3 - cdpRetries}/3): ${cdpError.message}`);
        
        if (cdpRetries === 0) {
          throw new Error(`Failed to create CDP session after 3 attempts: ${cdpError.message}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    try {
      
      // Add error handling for page interactions
      page.on('pageerror', error => {
        console.error(`Page error on ${page.url()}: ${error.message}`);
        consoleQueue.enqueue({
          type: 'pageError',
          url: page.url(),
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
      });

      page.on('error', error => {
        console.error(`Browser error on ${page.url()}: ${error.message}`);
        consoleQueue.enqueue({
          type: 'browserError',
          url: page.url(),
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
      });

      page.on('frameattached', frame => {
        frame.on('error', error => {
          console.warn(`Iframe error on ${frame.url()}: ${error.message}`);
          consoleQueue.enqueue({
            type: 'iframeError',
            url: frame.url(),
            error: error.message,
            timestamp: Date.now()
          });
        });
      });
      
      // deal with bad certs
      await client.send('Security.enable');
      await client.send('Security.setIgnoreCertificateErrors', { ignore: true });

      // Enable CDP domains with individual error handling and retries
      const cdpDomains = [
        'Network.enable',
        'Page.enable', 
        'DOM.enable',
        'Runtime.enable',
        'Debugger.enable'
        // Removed 'Target.enable' - deprecated in newer Chrome versions
      ];
      
      for (const domain of cdpDomains) {
        let domainRetries = 2;
        while (domainRetries > 0) {
          try {
            await client.send(domain);
            console.log(`✅ ${domain} enabled successfully`);
            break; // Success, move to next domain
          } catch (err) {
            domainRetries--;
            if (domainRetries === 0) {
              console.warn(`⚠️  Failed to enable ${domain} after retries: ${err.message}`);
            } else {
              console.warn(`⚠️  Retrying ${domain} (${2 - domainRetries}/2): ${err.message}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }
    } catch (err) {
      console.error(`❌ Failed to create CDP session: ${err.message}`);
      throw err;
    }

    let workingUrl = null;
    let genericDetectionResults = {};
    const stripped = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    console.log(stripped);

        const [host, ...rest] = stripped.split('/');
        const pathPart = rest.length ? '/' + rest.join('/') : '';

        const subdomains = ['', 'www.'];
        const protocols  = ['', 'http://', 'https://'];

        page.on('request', req => {
          for (const [name, re] of Object.entries(chatbotProviders)) {
            if (re.test(req.url())) {
              console.log(`🕵️ Detected provider ${name} on ${req.frame().url()}`);
              detectionQueue.enqueue({
                event: 'providerDetected',
                provider: name,
                url: req.url()
              });
            }
          }
        });

        for (const sub of subdomains) {
          for (const prot of protocols) {
            const candidate = prot + sub + host + pathPart;
            
            // Validate URL before attempting navigation
            let validUrl;
            try {
              validUrl = new URL(candidate.startsWith('http') ? candidate : 'https://' + candidate);
              if (!validUrl.hostname || validUrl.hostname.includes('..') || validUrl.hostname.startsWith('.')) {
                console.warn(` ✗ Invalid URL format: ${candidate}`);
                continue;
              }
            } catch (urlError) {
              console.warn(` ✗ Invalid URL: ${candidate} - ${urlError.message}`);
              continue;
            }
            
            try {
              // Set page timeouts
              await page.setDefaultNavigationTimeout(30000); // 30 seconds
              await page.setDefaultTimeout(15000); // 15 seconds for other operations
              
              // Navigate with error handling
              try {
                await page.goto(validUrl.href, { 
                  waitUntil: ['domcontentloaded', 'networkidle0'], 
                  timeout: 30000 
                });
                workingUrl = validUrl.href;
                console.log(` → navigation succeeded on ${validUrl.href}`);
                break;
              } catch (navError) {
                console.warn(` ✗ Navigation to ${validUrl.href} failed: ${navError.message}`);
                // If navigation fails, try with just domcontentloaded
                try {
                  await page.goto(validUrl.href, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 30000 
                  });
                  workingUrl = validUrl.href;
                  console.log(` → recovery navigation succeeded on ${validUrl.href}`);
                  break;
                } catch (reloadError) {
                  console.warn(` ✗ Recovery navigation failed: ${reloadError.message}`);
                }
              }
            } catch (err) {
              console.warn(` ✗ ${candidate} failed: ${err.message}`);
            }
          }
          if (workingUrl) break;
        }

        if (!workingUrl) {
          const errorMsg = `No working variant for ${url}, skipping.`;
          console.warn(`‼ ${errorMsg}`);
          
          // Ensure error logging even for skipped sites
          const errorLog = `❌ [${new Date().toISOString()}] ${errorMsg}\n`;
          fs.appendFileSync(path.join(OUTPUT_DIR, 'crawl_errors.log'), errorLog);
          fs.appendFileSync(path.join(urlDir, 'error.log'), `[${new Date().toISOString()}] ${errorMsg}\n\n`);
          
          if (page && !page.isClosed()) {
            await page.close();
          }
          return; // Skip this site and return from function
        }
        
        normalizedURL = workingUrl

        client.on('Debugger.paused', async evt => {
            debugQueue.enqueue({ event: 'paused', details: evt });
            try {
              // Only try to resume if we're actually paused
              if (evt.reason) {
                await client.send('Debugger.resume');
              }
            } catch (err) {
              // Silently ignore resume errors - they're usually harmless
              console.warn(`⚠️  Debugger resume warning: ${err.message}`);
            }
          });

        // Breakpoint before script execution
        await client.send('Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' });

        // Network event hooks, capturing request and response bodies including request post data
        client.on('Network.requestWillBeSent', async params => {
          let postData = params.request.postData || null;
          try {
            const req = await client.send('Network.getRequestPostData', { requestId: params.requestId });
            if (req.postData) postData = req.postData;
          } catch (e) {}
          networkQueue.enqueue({
            event: 'requestWillBeSent',
            url: params.request.url,
            method: params.request.method,
            headers: params.request.headers,
            postData,
            initiator: params.initiator
          });
        });
        client.on('Network.requestWillBeSentExtraInfo', params => {
          networkQueue.enqueue({
            event: 'requestWillBeSentExtraInfo',
            requestId: params.requestId,
            cookies: params.associatedCookies,
            headers: params.headers,
            securityState: params.clientSecurityState
          });
        });
        client.on('Network.responseReceived', async params => {
          let body = null, base64 = false;
          try {
            const resp = await client.send('Network.getResponseBody', { requestId: params.requestId });
            body = resp.body;
            base64 = resp.base64Encoded;
          } catch (e) {}
          networkQueue.enqueue({
            event: 'responseReceived',
            url: params.response.url,
            status: params.response.status,
            headers: params.response.headers,
            mimeType: params.response.mimeType,
            body,
            base64
          });
        });

        // Runtime console and exception hooks
        client.on('Runtime.consoleAPICalled', evt => consoleQueue.enqueue({ event: 'console', details: evt }));
        client.on('Runtime.exceptionThrown', evt => consoleQueue.enqueue({ event: 'exception', details: evt }));

        // Debugger instrumentation hits
        client.on('Debugger.instrumentationBreakpoint', evt => debugQueue.enqueue({ event: 'beforeScriptExecution', details: evt }));
        // detectionQueue.enqueue({ event: 'providerDetected', details: evt, url: req.url() });

        // Navigate and scroll
        try {
          await page.goto(normalizedURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
          
          // Apply advanced bot mitigation AFTER page loads (so it can interact with actual elements)
          console.log('🛡️  Applying post-navigation bot mitigation...');
          try {
            // Add timeout to prevent hanging
            await Promise.race([
              applyBotMitigation(page, {
                enableMouseMovement: true,
                enableRandomScrolling: true,
                enableWebGLFingerprinting: true,
                enableCanvasFingerprinting: true,
                enableTimingAttacks: true,
                logMitigation: true
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Bot mitigation timeout')), 15000)
              )
            ]);
            console.log('✅ Bot mitigation completed successfully');
          } catch (error) {
            console.warn(`⚠️  Bot mitigation failed or timed out: ${error.message}`);
            // Continue anyway - bot mitigation is not critical
          }
          
          // Apply consent banner handling with Consent-O-Matic
          await handleConsentBanners(page);
          await waitForPageReady(page);
        
          // Perform generic detection for search elements and chatbots (Comments 8, 9, 10)
          console.log('🔍 Running generic detection (regex-based patterns + iframe support)...');
          genericDetectionResults = await performGenericDetection(page, domQueue);
        
          // Log generic detection results to interaction queue
          interactionQueue?.enqueue?.({
            event: 'genericDetectionResults',
            url: url,
            searchElements: genericDetectionResults.searchElements.length,
            chatbots: genericDetectionResults.chatbots.length,
            iframeChatbots: genericDetectionResults.iframeChatbots.length,
            timestamp: Date.now(),
            detectionDetails: genericDetectionResults
          });
          
          await scrollWithPauses(page);
        } catch (err) {
          console.warn(`Navigation failed for ${normalizedURL}: ${err.message}`);
        }

        // Capture DOM for main frame + iframes
        const { frameTree } = await client.send('Page.getFrameTree');
        await captureFrameDOM(page, domQueue);

        // Enhanced input interaction with generic detection, fresh tabs and detailed logging
        const interactionSummary = await enhancedInputInteraction(page, url, {
          instrumentPage,
          queues: { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue },
          logFile: path.join(urlDir, 'interaction_log.json'),
          maxInteractionsPerPage: 20,
          interactionTimeout: 30000,
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
        
        console.log(`📊 Completed ${interactionSummary.totalInteractions} interactions with ${interactionSummary.totalNetworkRequests} network requests`);
        console.log(`✅ Crawled ${url} successfully`);
        console.log(`   - Network requests: ${interactionSummary.totalNetworkRequests}`);
        console.log(`   - Input interactions: ${interactionSummary.totalInteractions}`);
        console.log(`   - Elements found: ${interactionSummary.totalElementsFound}`);
        console.log(`   - Generic search elements: ${interactionSummary.genericSearchElements}`);
        console.log(`   - Generic chatbots: ${interactionSummary.genericChatbots}`);
        console.log(`   - Iframe chatbots: ${interactionSummary.iframeChatbots}`);
        
        // Keep original form interaction as fallback/additional coverage
        const finalPage = await interactWithAllForms(page, workingUrl, {
          instrumentPage,
          queues: { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue },
          openUrlMode: 'original',
          finalFreshOriginal: true,
          closeSubmissionTabs: true,
          bodyPreviewLimit: 1_000_000,
        });


  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  } finally {
    // Restore terminal output
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    termStream.end();
    
    // Cleanup CDP session first
    if (client) {
      try {
        await client.detach();
      } catch (e) {
        console.warn(`⚠️  Could not detach CDP session: ${e.message}`);
      }
    }
    
    // Cleanup enhanced instrumentation
    if (instrumentationResult && instrumentationResult.cleanup) {
      try {
        instrumentationResult.cleanup();
      } catch (e) {
        console.warn(`⚠️  Could not cleanup instrumentation: ${e.message}`);
      }
    }
    
    // Close page
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) {
        console.warn(`⚠️  Could not close page: ${e.message}`);
      }
    }
    
    // Flush site-specific queues and wait for all writes to complete
    try {
      await Promise.all(siteQueues.map(q => q.flush()));
      // Wait for all pending writes to complete
      await Promise.all(siteQueues.map(q => q.waitForFlush ? q.waitForFlush() : Promise.resolve()));
    } catch (e) {
      console.warn(`⚠️  Could not flush queues: ${e.message}`);
    }
  }
}