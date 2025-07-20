// crawl_with_puppeteer.js
// A Puppeteer + CDP crawler with batching, network tracking (including request body), DOM snapshots (including iframes),
// runtime/console capture, Debugger instrumentation breakpoints, and basic bot-mitigation.

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { clearInterval } = require('timers')
const { chatbotKeywords, chatbotProviders, chatLaunchers } = require('./static_data.js')
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




const allQueues = [];


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

        // 5) Keyword‐based detection in rendered content
        const hasChatInText = await page.evaluate((keywords) => {
          return document.body.innerText
            .toLowerCase()
            .split('\n')
            .some(line => keywords.some(k => line.includes(k)));
        }, chatbotKeywords);

        const hasChatInScripts = await page.evaluate((keywords) => {
          return Array.from(document.querySelectorAll('script, iframe'))
            .some(node => {
              const src = (node.src || '').toLowerCase();
              return keywords.some(k => src.includes(k));
            });
        }, chatbotKeywords);

        const texts = await Promise.all(
          page.frames().map(f =>
            f.evaluate(() => document.body.innerText)
             .catch(() => '')   // cross-origin frames will throw
          )
        );
        
        const fullText = texts.join('\n').toLowerCase();
        const hasChatAnywhere = chatbotKeywords.some(k => fullText.includes(k));
        console.log('🔎 chat keywords in any frame?', hasChatAnywhere);
        // TODO: log and interact with chatbot.
        let clicked = false;
        if (hasChatInText || hasChatInScripts) {
          for (const sel of chatLaunchers) {
            try {
              await page.waitForSelector(sel, { timeout: 3000 });
              await page.click(sel);
              console.log(`✅ Chat opened via selector: ${sel}`);
              clicked = true;
              break;
            } catch {
              // not found or not clickable—try next
            }
        }
      }
        if (!clicked) {
          console.warn('⚠️  No chat launcher matched any known selector');
        }
        else{
          // 1) pick the right “chat frame” (falls back to main page)
        let chatFrame = page;
        for (const f of page.frames()) {
          // use whatever pattern matches your provider domain
          if (/intercom\.io|driftcdn\.com|livechatinc\.com/.test(f.url())) {
            chatFrame = f;
            console.log('🔍 chatting inside frame:', f.url());
            break;
          }
        }
        const chatInputs = [
          'textarea.chat-input',          // generic textarea
          'input.chat-input',             // generic input
          'textarea#intercom-chat-input', // Intercom
          'textarea.drift-input',         // Drift
          '#livechat-message-input',      // LiveChat
        ];

          // 3) find the first one that works
          let inputSel = null;
          for (const sel of chatInputs) {
            try {
              await chatFrame.waitForSelector(sel, { timeout: 5000 });
              inputSel = sel;
              console.log(`✏️  typing into ${sel}`);
              break;
            } catch { /* not found, try next */ }
          }

          if (!inputSel) {
            console.warn('⚠️  No chat input found – can’t send message');
          } else {
            // 4) type + send
            const message = 'Hello, are you a bot?';
            await chatFrame.type(inputSel, message);
            await chatFrame.keyboard.press('Enter');
            console.log(`📤 sent: "${message}"`);

            // 5) wait for the bot’s response bubble
            const responseSelectors = [
              '.chat-bubble.bot:last-child',                // generic
              '.intercom-chat-message--agent:last-child',   // Intercom
              '.drift-widget-message:last-child',           // Drift
              '.lc-chat__message--operator:last-child',     // LiveChat
            ];

            let replySel = null;
            for (const sel of responseSelectors) {
              try {
                await chatFrame.waitForSelector(sel, { timeout: 20000 });
                replySel = sel;
                break;
              } catch { /* not found, try next */ }

            }
            if (!replySel) {
              console.warn('⚠️  No bot reply detected within timeout');
            } else {
              const botReply = await chatFrame.$eval(replySel, el => el.innerText.trim());
              console.log('🤖 Bot replied:', botReply);
            }
          }
        }

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
