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

// Plugins for basic bot mitigation
puppeteer.use(StealthPlugin());

const INPUT_CSV = '../tranco_3N2WL.csv'; // Can also use 'test_URLs.csv' for testing
const OUTPUT_DIR = 'data';
let FLUSH_INTERVAL_MS = 5000;           // adjustable flush interval
let workingUrl = null;
let normalizedURL = null;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const { normalizeUrl, DataQueue, scrollWithPauses, captureFrameDOM, captureAllFrames} = require('./helpers.js')

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
        console.log(`\n🌐 Processing site ${i + 1}/${urls.length}: ${url}`);
        
        // Create fresh browser for each site
        let browser = null;
        try {
          browser = await puppeteer.launch({
            headless: false,   // extensions only work in headful mode
            ignoreDefaultArgs: [
              '--disable-extensions',
              '--disable-component-extensions-with-background-pages',
              '--disable-blink-features=AutomationControlled,MojoJS'
            ],
            args: [
              `--disable-extensions-except=${extensionDir}`,
              `--load-extension=${extensionDir}`,
              '--no-sandbox',
              '--disable-setuid-sandbox'
            ],
            userDataDir: path.join(__dirname, `profile_${i}_${Date.now()}`)
          });

          // Create site-specific queues array for this iteration
          const siteQueues = [];
          
          await processSingleSite(browser, url, siteQueues);
          
        } catch (err) {
          console.error(`❌ Failed to process site ${url}:`, err.message);
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
    page = await browser.newPage();
    instrumentationResult = await enhancedInstrumentPage(page, {
      networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue
    });
        // Enhanced bot mitigation: randomize UA & viewport + advanced techniques
        await page.setUserAgent(
          userAgents[Math.floor(Math.random() * userAgents.length)]
        );
        await page.setViewport(viewports[Math.floor(Math.random() * viewports.length)]);
        await setRealisticHeaders(page);
        
        // Apply advanced bot mitigation before any page interaction
        await applyBotMitigation(page, {
          enableMouseMovement: true,
          enableRandomScrolling: true,
          enableWebGLFingerprinting: true,
          enableCanvasFingerprinting: true,
          enableTimingAttacks: true,
          logMitigation: true
        });
        
    detectionQueue.enqueue({ event: 'crawlStarted', timestamp: Date.now() }); // to ensure detection log always exists
    
    // Create CDP session with proper error handling
    try {
      client = await page.target().createCDPSession();
      
      // deal with bad certs
      await client.send('Security.enable');
      await client.send('Security.setIgnoreCertificateErrors', { ignore: true });

      // Enable CDP domains with individual error handling
      const cdpDomains = [
        'Network.enable',
        'Page.enable', 
        'DOM.enable',
        'Runtime.enable',
        'Debugger.enable'
      ];
      
      for (const domain of cdpDomains) {
        try {
          await client.send(domain);
        } catch (err) {
          console.warn(`⚠️  Failed to enable ${domain}: ${err.message}`);
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
            try {
              // listen for network requests of chatbot providers
              // try to navigate
              await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 10000 });
              // got a 2xx/3xx — we’ll assume success
              workingUrl = candidate;
              console.log(` → navigation succeeded on ${candidate}`);
              break;
            } catch (err) {
              console.warn(` ✗ ${candidate} failed: ${err.message}`);
            }
          }
          if (workingUrl) break;
        }

        if (!workingUrl) {
          console.warn(`‼ No working variant for ${url}, skipping.`);
          if (page && !page.isClosed()) {
            await page.close();
          }
          return; // Skip this site and return from function
        }

        normalizedURL = workingUrl

        client.on('Debugger.paused', async evt => {
            debugQueue.enqueue({ event: 'paused', details: evt });
            try {
              await client.send('Debugger.resume');
            } catch (err) {
              console.error('Failed to resume debugger:', err);
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
    
    // Flush site-specific queues
    try {
      await Promise.all(siteQueues.map(q => q.flush()));
    } catch (e) {
      console.warn(`⚠️  Could not flush queues: ${e.message}`);
    }
  }
}