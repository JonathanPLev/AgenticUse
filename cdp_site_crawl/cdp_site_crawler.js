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
// 2-3 finalize crawler, check if it detects AI use on websites that i know have AI use ~5 websites
// 1 day: pipeline of regexs, see if detection works
// 1 day: start crawl on 1000 pages
// 3-4 days: get list of AI tools and regexs to run on 1000 pages. finalize script
// 3 days: run offline tool, see if it works

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { clearInterval } = require('timers')
const { chatbotKeywords, chatbotProviders, chatLaunchers} = require('./static_data.js')
const {detectSearchBar} = require("./test_v2_searchbar_detection.js")
const { chatbotDetector } = require('./chatbot_detection.js');


// Plugins for basic bot mitigation
puppeteer.use(StealthPlugin());

const INPUT_CSV = 'test_URLs.csv'; // urls_with_subdomains_forCrawl.csv
const OUTPUT_DIR = 'data';
let FLUSH_INTERVAL_MS = 5000;           // adjustable flush interval
let workingUrl = null;
let normalizedURL = null;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const { normalizeUrl, DataQueue, scrollWithPauses, captureFrameDOM} = require('./helpers.js')

const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
  throw new Error(`manifest.json not found in ${extensionDir}`);
}


const allQueues = [];


(async () => {
  const urls = [];
  fs.createReadStream(INPUT_CSV)
    .pipe(csv())
    .on('data', row => { if (row.url) urls.push(row.url); })
    .on('end', async () => {
      console.log(`Loaded ${urls.length} URLs.`);

      if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
        throw new Error(`manifest.json not found in ${extensionDir}`);
      }

      const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: false,   // extensions only work in headful mode
        ignoreDefaultArgs: [
          '--disable-extensions',
          '--disable-component-extensions-with-background-pages',
          'about:blank'   // drop the default about:blank URL so our flags fire first
        ],
        args: [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        userDataDir: path.join(__dirname, 'profile_with_consents')
      });

      const flushTimer = setInterval(() => {
      Promise.all(allQueues.map(q => q.flush()))
                .catch(console.error);
      }, FLUSH_INTERVAL_MS);


      for (const url of urls) {

         // 1) figure out which full URL actually works:
        const page = await browser.newPage();
        // Bot mitigation: randomize UA & viewport
        await page.setUserAgent(
          `Mozilla/5.0 (Windows NT ${10 + Math.floor(Math.random()*3)}.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${110 + Math.floor(Math.random()*10)}.0.0.0 Safari/537.36`
        );
        await page.setViewport({ width: 1280 + Math.floor(Math.random()*400), height: 720 + Math.floor(Math.random()*300) });

        // const normalizedURL = normalizeUrl(url)
          // 1) make a filesystem-safe “slug” from the URL
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
      try {
        // 3) create four queues that write into that folder
        const networkQueue = new DataQueue(path.join(urlDir, 'network.log'));
        const domQueue     = new DataQueue(path.join(urlDir, 'dom.log'));
        const consoleQueue = new DataQueue(path.join(urlDir, 'console.log'));
        const debugQueue   = new DataQueue(path.join(urlDir, 'debug.log'));
        const detectionQueue = new DataQueue(path.join(urlDir, 'detection.log'))

        // 4) register them so the flushTimer knows about them
        allQueues.push(networkQueue, domQueue, consoleQueue, debugQueue, detectionQueue);

        const client = await page.target().createCDPSession();


        // deal with bad certs
        await client.send('Security.enable');
        await client.send('Security.setIgnoreCertificateErrors', { ignore: true });


        await Promise.all([
          client.send('Network.enable'),
          client.send('Page.enable'),
          client.send('DOM.enable'),
          client.send('Runtime.enable'),
          client.send('Debugger.enable'),
        ]);

        workingUrl = null
        const stripped = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
        const [host, ...rest] = stripped.split('/');
        const pathPart = rest.length ? '/' + rest.join('/') : '';

        const subdomains = ['', 'www.'];
        const protocols  = ['', 'http://', 'https://'];

        page.on('request', req => {
          for (const [name, re] of Object.entries(chatbotProviders)) {
            if (re.test(req.url())) {
              console.log(`🕵️ Detected provider ${name} on ${req.frame().url()}`);
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
          await page.close();
          continue;
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
        detectionQueue.enqueue({ event: 'providerDetected', name, url: req.url() });

        // Navigate and scroll
        try {
          await page.goto(normalizedURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await scrollWithPauses(page);
        } catch (err) {
          console.warn(`Navigation failed for ${normalizedURL}: ${err.message}`);
        }

        // Capture DOM for main frame + iframes
        const { frameTree } = await client.send('Page.getFrameTree');
        await captureFrameDOM(client, frameTree, domQueue);

        // const detectionResult = await chatbotDetector(page, normalizedURL);
        // console.log('🔎 chat found?', detectionResult.foundAnyKeywords);
        await chatbotDetector(page, normalizedURL);


                // ——— Search‑bar detection ———
        detectSearchBar(page, workingUrl)

      }
      catch (err){
        console.error(`Error crawling ${normalizedURL}:`, err);
      }
      finally{
        process.stdout.write = origStdout;
        process.stderr.write = origStderr;
        termStream.end();
        await page.close();
      }
    }

      // Close browser and flush remaining data
      await browser.close();

      // flush _all_ queues one last time
      clearInterval(flushTimer);
      await Promise.all(allQueues.map(q => q.flush()));

      console.log('All data flushed, exiting.');

  });
})();
