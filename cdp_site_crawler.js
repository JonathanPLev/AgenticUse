// crawl_with_puppeteer.js
// A Puppeteer + CDP crawler with batching, network tracking (including request body), DOM snapshots (including iframes),
// runtime/console capture, Debugger instrumentation breakpoints, and basic bot-mitigation.

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { clearInterval } = require('timers');

// Plugins for basic bot mitigation
puppeteer.use(StealthPlugin());

const INPUT_CSV = 'test_URLs.csv'; // urls_with_subdomains_forCrawl.csv
const OUTPUT_DIR = 'data';
const BATCH_SIZE = 100;
let FLUSH_INTERVAL_MS = 5000;           // adjustable flush interval
const SCROLL_DURATION_MS = 20000 + Math.random() * 5000; // 20-25s scroll window
const MAX_SCROLL_STEPS = 50;            // max scroll actions

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}


class DataQueue {
  constructor(filename, batchSize = BATCH_SIZE) {
    this.filename = filename;
    this.queue = [];
    this.batchSize = batchSize;
  }
  enqueue(item) {
    this.queue.push(item);
  }
  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.batchSize);
    const out = batch.map(x => JSON.stringify(x)).join('\n') + '\n';
    fs.appendFileSync(path.join(OUTPUT_DIR, this.filename), out);
  }
}

const allQueues = [];

// Scroll for a fixed duration or until max steps
async function scrollWithPauses(page) {
    const start = Date.now();
    let steps = 0;
    while ((Date.now() - start) < SCROLL_DURATION_MS && steps < MAX_SCROLL_STEPS) {
      await page.evaluate(h => window.scrollBy(0, h), 300);
  
      // <-- replace both waitForTimeout/page.waitFor calls with this:
      await new Promise(resolve => setTimeout(
        resolve,
        500 + Math.random() * 1000
      ));
  
      steps++;
    }
    const elapsed = Date.now() - start;
    if (elapsed < SCROLL_DURATION_MS) {
      await new Promise(resolve => setTimeout(
        resolve,
        SCROLL_DURATION_MS - elapsed
      ));
    }
  }
  

// Recursively walk frame tree and capture each frame's HTML
async function captureFrameDOM(client, frameTree, domQueue) {
  try {
    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
    domQueue.enqueue({ frameId: frameTree.frame.id, url: frameTree.frame.url, html: outerHTML });
  } catch (e) {
    console.warn('DOM capture failed for frame', frameTree.frame.id, e.message);
  }
  if (frameTree.childFrames) {
    for (const child of frameTree.childFrames) {
      await captureFrameDOM(client, child, domQueue);
    }
  }
}

(async () => {
  const urls = [];
  fs.createReadStream(INPUT_CSV)
    .pipe(csv())
    .on('data', row => { if (row.url) urls.push(row.url); })
    .on('end', async () => {
      console.log(`Loaded ${urls.length} URLs.`);
    
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ignoreHTTPSErrors: true });

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

        // 3) create four queues that write into that folder
        const networkQueue = new DataQueue(path.join(slug, 'network.log'));
        const domQueue     = new DataQueue(path.join(slug, 'dom.log'));
        const consoleQueue = new DataQueue(path.join(slug, 'console.log'));
        const debugQueue   = new DataQueue(path.join(slug, 'debug.log'));

        // 4) register them so the flushTimer knows about them
        allQueues.push(networkQueue, domQueue, consoleQueue, debugQueue);

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

        for (const sub of subdomains) {
          for (const prot of protocols) {
            const candidate = prot + sub + host + pathPart;
            try {
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

        process.stdout.write = origStdout;
        process.stderr.write = origStderr;
        termStream.end();
        await page.close();
      }

      // Close browser and flush remaining data
      await browser.close();

      // flush _all_ queues one last time
      clearInterval(flushTimer);
      await Promise.all(allQueues.map(q => q.flush()));

      console.log('All data flushed, exiting.');

    });
})();
