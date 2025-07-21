const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { chatbotProviders } = require('./static_data_structs.js'); // keywords not needed for this

puppeteer.use(StealthPlugin());

(async () => {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node test_chatbot_finder.js <URL>');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--disable-features=site-per-process']
  });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)…');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

  // 1. Accept cookies if present
  const cookieBtn = await page.$('#onetrust-accept-btn-handler');
  if (cookieBtn) {
    await cookieBtn.click();
    console.log('✅ Accepted cookies');
    await new Promise(res => setTimeout(res, 1200));

  }

  // 2. Try to find and click the Julie widget button
  let widgetFound = false;
  try {
    await page.waitForSelector('#widget-button', { timeout: 8000, visible: true });
    await page.click('#widget-button');
    widgetFound = true;
    console.log('✅ Clicked Julie widget button');
    await new Promise(res => setTimeout(res, 2000));

  } catch (e) {
    console.log('ℹ️  Julie widget button not found.');
  }

  // 3. If widget not found, look for "Need Help?" button and click
  if (!widgetFound) {
    let needHelpFound = false;

    // Amtrak uses this button: .lh-menu__button or text "Need Help?" (subject to change)
    // Try a few selectors and an XPath fallback
    const selectors = [
      '.lh-menu__button',
      'button[aria-label*="help"]',
      'button:contains("Need Help")'
    ];

    for (const sel of selectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        console.log(`✅ Clicked Need Help button with selector: ${sel}`);
        needHelpFound = true;
        await new Promise(res => setTimeout(res, 2000));

        break;
      }
    }

    if (!needHelpFound) {
      // Fallback: XPath for button containing text
      const [xpathBtn] = await page.$x("//button[contains(., 'Need Help') or contains(., 'help')]");
      if (xpathBtn) {
        await xpathBtn.click();
        console.log('✅ Clicked Need Help button via XPath');
        await new Promise(res => setTimeout(res, 2000));

        needHelpFound = true;
      }
    }

    // 4. Wait for the chat input to appear and type
    if (needHelpFound) {
      // Wait for iframe/chat input, then type
      try {
        // Sometimes chat is in an iframe, sometimes in a div, so check both!
        let inputFound = false;

        // Try in the main page
        let input = await page.$('input[type="text"], textarea, [contenteditable="true"]');
        if (input) {
          await input.type('hi');
          console.log('✅ Typed "hi" into chat input');
          inputFound = true;
        }

        // If not found, check if there's a visible iframe
        if (!inputFound) {
          for (const frame of page.frames()) {
            try {
              let frameInput = await frame.$('input[type="text"], textarea, [contenteditable="true"]');
              if (frameInput) {
                await frameInput.type('hi');
                console.log('✅ Typed "hi" into chat input in iframe');
                inputFound = true;
                break;
              }
            } catch (e) {}
          }
        }

        if (!inputFound) {
          console.log('⚠️ Could not find chat input box.');
        }
      } catch (e) {
        console.log('⚠️ Error while typing into chat:', e);
      }
    } else {
      console.log('❌ Could not find Need Help button.');
    }
  }

  // (Optionally: Keep browser open for inspection)
  // await browser.close();
})();
