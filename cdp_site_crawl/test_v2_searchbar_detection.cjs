const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { searchBarSelectors } = require("./static_data_structs.cjs");

puppeteer.use(StealthPlugin());

/**
 * Detect and interact with every search input on the homepage.
 *  1. Load the homepage
 *  2. Collect all visible, enabled search inputs
 *  3. For each input:
 *     - Scroll into view
 *     - Clear and type a query
 *     - Submit the form or press Enter
 *     - Extract results
 *     - Navigate back to the homepage
 */

  // In your crawler helper
  async function detectSearchBar(page, originalUrl) {
    // 1️⃣ Try each frame (top‐level + iframes)
    for (const frame of [page.mainFrame(), ...page.frames().slice(1)]) {
      // 2️⃣ Look for forms first
      const formHandles = await frame.$$('form[role="search"], form[method="get"], form[method="post"]');
      for (const form of formHandles) {
        const input = await form.$('input[type="search"], input[type="text"]');
        if (input) {
          const sel = await frame.evaluate(el => {
            if (el.id) return `#${el.id}`;
            if (el.name) return `input[name="${el.name}"]`;
            return 'input[type="search"], input[type="text"]';
          }, input);
          console.log(`🔎 Found via form: ${sel} in frame ${frame.url()}`);
          return await trySubmit(frame, sel, originalUrl);
        }
      }
  
      // 3️⃣ Fallback: global selectors
      for (const sel of searchBarSelectors) {
        try {
          await frame.waitForSelector(sel, { visible: true, timeout: 1000 });
          console.log(`🔎 Found via selector: ${sel} in frame ${frame.url()}`);
          return await trySubmit(frame, sel, originalUrl);
        } catch {
          // not found here—next sel
        }
      }
    }
  
    console.warn('⚠️ No search bar detected on page or iframes.');
    return false;
  }
  
  async function trySubmit(frame, selector, originalUrl) {
    const searchQuery = 'How do I contact support?';
    const input = await frame.$(selector);
    await input.click({ clickCount: 3 });
    await frame.keyboard.press('Backspace');
    await input.type(searchQuery);
    // attempt form submit
    const didForm = await frame.evaluate(sel => {
      const el = document.querySelector(sel);
      const form = el && el.closest('form');
      if (form) { form.submit(); return true; }
      return false;
    }, selector);
    if (!didForm) await frame.keyboard.press('Enter');
    await Promise.race([
      frame.waitForNavigation({ timeout: 5000 }).catch(() => {}),
      frame.waitForFunction(
        q => document.body.innerText.toLowerCase().includes(q.toLowerCase()),
        { timeout: 5000 },
        searchQuery
      )
    ]);
    console.log('✅ Search submitted & results loaded.');
    // come back
    await frame.goto(originalUrl, { waitUntil: 'domcontentloaded' });
    return true;
  }

module.exports = detectSearchBar;
