// crawl_with_puppeteer.js
// A Puppeteer + CDP crawler with batching, network tracking, DOM snapshots (including iframes),
// runtime/console capture, Debugger instrumentation breakpoints, and basic bot-mitigation.

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Plugins for basic bot mitigation
puppeteer.use(StealthPlugin());

const INPUT_CSV = 'urls.csv';
const OUTPUT_DIR = 'data';
const BATCH_SIZE = 100;
let FLUSH_INTERVAL_MS = 5000;           // can adjust flush interval
const SCROLL_DURATION_MS = 20000 + Math.random() * 5000; // 20-25s scroll window
const MAX_SCROLL_STEPS = 50;            // max scroll actions

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

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

// Scroll for a fixed duration or until max steps
async function scrollWithPauses(page) {
  const start = Date.now();
  let steps = 0;
  while ((Date.now() - start) < SCROLL_DURATION_MS && steps < MAX_SCROLL_STEPS) {
    await page.evaluate(h => window.scrollBy(0, h), 300);
    // random short pause 500-1500ms
    await page.waitForTimeout(500 + Math.random() * 1000);
    steps++;
  }
  // hang out until total duration
  const elapsed = Date.now() - start;
  if (elapsed < SCROLL_DURATION_MS) {
    await page.waitForTimeout(SCROLL_DURATION_MS - elapsed);
  }
}

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
    .on('data', row => row.url && urls.push(row.url))
    .on('end', async () => {
      console.log(`Loaded ${urls.length} URLs.`);

      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

      const networkQueue = new DataQueue('network.log');
      const domQueue     = new DataQueue('dom.log');
      const consoleQueue = new DataQueue('console.log');
      const debugQueue   = new DataQueue('debug.log');

      setInterval(() => Promise.all([
        networkQueue.flush(),
        domQueue.flush(),
        consoleQueue.flush(),
        debugQueue.flush()
      ]).catch(console.error), FLUSH_INTERVAL_MS);

      for (const url of urls) {
        console.log(`Processing: ${url}`);
        const page   = await browser.newPage();
        // Bot mitigation: randomize UA & viewport
        await page.setUserAgent(
          `Mozilla/5.0 (Windows NT ${10 + Math.floor(Math.random()*3)}.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${110 + Math.floor(Math.random()*10)}.0.0.0 Safari/537.36`
        );
        await page.setViewport({ width: 1280 + Math.floor(Math.random()*400), height: 720 + Math.floor(Math.random()*300) });

        const client = await page.target().createCDPSession();
        await Promise.all([
          client.send('Network.enable'),
          client.send('Page.enable'),
          client.send('DOM.enable'),
          client.send('Runtime.enable'),
          client.send('Debugger.enable')
        ]);
        await client.send('Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' });

        client.on('Network.requestWillBeSent', params => networkQueue.enqueue({ event: 'requestWillBeSent', params }));
        client.on('Network.requestWillBeSentExtraInfo', params => networkQueue.enqueue({ event: 'requestWillBeSentExtraInfo', params }));
        client.on('Network.responseReceived', async params => {
          let body = null, base64 = false;
          try { const resp = await client.send('Network.getResponseBody', { requestId: params.requestId }); body = resp.body; base64 = resp.base64Encoded; } catch {};
          networkQueue.enqueue({ event: 'responseReceived', params, body, base64 });
        });

        client.on('Runtime.consoleAPICalled', evt => consoleQueue.enqueue({ event: 'console', evt }));
        client.on('Runtime.exceptionThrown', evt => consoleQueue.enqueue({ event: 'exception', evt }));
        client.on('Debugger.instrumentationBreakpoint', evt => debugQueue.enqueue({ event: 'instrumentationBreakpoint', evt }));

        // Navigate, scroll, capture DOM
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await scrollWithPauses(page);
        } catch (err) {
          console.warn(`Navigation failed: ${err.message}`);
        }

        const { frameTree } = await client.send('Page.getFrameTree');
        await captureFrameDOM(client, frameTree, domQueue);

        await page.close();
      }

      await browser.close();
      console.log('Crawling complete.');
    });
})();
