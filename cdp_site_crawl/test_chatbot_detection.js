// test_chatbot_finder.js. requires static data structs but not helpers.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { chatbotKeywords, chatbotProviders, chatLaunchers } = require('./static_data_structs.js');

puppeteer.use(StealthPlugin());

;(async () => {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node test_chatbot_finder.js <URL>');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)…');
  await page.setViewport({ width: 1280, height: 800 });

  // catch any requests to known chatbot providers
  page.on('request', req => {
    for (const [name, re] of Object.entries(chatbotProviders)) {
      if (re.test(req.url())) {
        console.log(`🕵️ Detected provider network call: ${name} → ${req.url()}`);
      }
    }
  });

  console.log(`Navigating to ${url}…`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // 1) in-page keyword scan
  const hasChatInText = await page.evaluate(keywords =>
    document.body.innerText
      .toLowerCase()
      .split('\n')
      .some(line => keywords.some(k => line.includes(k))),
    chatbotKeywords
  );

  const hasChatInScripts = await page.evaluate(keywords =>
    Array.from(document.querySelectorAll('script, iframe'))
      .some(node => {
        const src = (node.src || '').toLowerCase();
        return keywords.some(k => src.includes(k));
      }),
    chatbotKeywords
  );

  // 2) full-text fallback
  const fullText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  const hasChatAnywhere = hasChatInText || hasChatInScripts || chatbotKeywords.some(k => fullText.includes(k));
      // TODO: ADD TO MAIN SCRIPT
  console.log('🔎 hasChatInText?   ', hasChatInText);
  console.log('🔎 hasChatInScripts?', hasChatInScripts);
  console.log('🔎 hasChatAnywhere? ', hasChatAnywhere);

// … after you compute hasChatAnywhere and log the three flags …

if (hasChatAnywhere) {
    let clicked = false;

    for (const sel of chatLaunchers) {
      // 1) Try main page
      try {
        await page.waitForSelector(sel, { timeout: 2000 });
        await page.click(sel);
        console.log(`✅ Chat opened on main page via selector: ${sel}`);
        clicked = true;
        break;
      } catch {
        // not in main page, fall through
      }

      // 2) Try every child frame
      for (const frame of page.frames()) {
        try {
          // note: frame.waitForSelector works relative to that frame
          const handle = await frame.waitForSelector(sel, { timeout: 2000 });
          if (handle) {
            await frame.click(sel);
            console.log(`✅ Chat opened in frame [${frame.url()}] via selector: ${sel}`);
            clicked = true;
            break;
          }
        } catch {
          // not found in this frame
        }
      }
      if (clicked) break;
    }

    if (!clicked) {
      console.warn('⚠️  No chat‑launcher selector matched, even though chat was detected.');
    }
  } else {
    console.log('ℹ️  No chatbot detected, skipping launcher click.');
  }


  await browser.close();
})();
