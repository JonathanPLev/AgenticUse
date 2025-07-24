import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
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
export async function detectSearchBar(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();

  try {
    // Setup UA and viewport
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    const originalUrl = url;
    await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 1. Gather all visible, enabled search inputs on the homepage
    const selectors = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll(
          'input[type="search"], input[type="text"], input[name*="search"], input[id*="search"]'
        )
      ).filter(i => i.offsetParent !== null && !i.disabled && !i.readOnly);
      return inputs.map((input, idx) => {
        if (input.id) return `#${input.id}`;
        if (input.name) return `input[name=\"${input.name}\"]`;
        return `input[type=\"${input.type}\"]:nth-of-type(${idx + 1})`;
      });
    });
    console.log(`🔎 Found ${selectors.length} search inputs on homepage.`);

    const searchQuery = 'How do I contact support?';

    // 2. Iterate through each detected search input
    for (const selector of selectors) {
      console.log(`🔎 Interacting with: ${selector}`);
      try {
        // Wait for the element to appear
        await page.waitForSelector(selector, { timeout: 3000 });
        const inputHandle = await page.$(selector);
        if (!inputHandle) throw new Error('Handle not found');

        // Scroll into view and clear existing value
        await inputHandle.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await inputHandle.click({ clickCount: 3 }).catch(async () => {
          await inputHandle.focus();
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
        });
        await page.keyboard.press('Backspace');

        // Type the search query
        await inputHandle.type(searchQuery);

        // Submit via form if possible
        const formSubmitted = await page.evaluate(sel => {
          const inp = document.querySelector(sel);
          const form = inp?.closest('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        }, selector);
        if (!formSubmitted) {
          await page.keyboard.press('Enter');
        }

        console.log(`✅ Submitted search for: ${selector}`);

        // 3. Wait for results or content update
        await Promise.race([
          page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' }).catch(() => {}),
          page.waitForFunction(
            q => document.body.innerText.toLowerCase().includes(q.toLowerCase()),
            { timeout: 5000 },
            searchQuery
          ).catch(() => {}),
        ]);

        // 4. Extract up to 5 visible results
        const results = await page.evaluate(q => {
          const sels = ['[class*=result]', '[id*=result]', 'article', 'li', 'div'];
          const out = [];
          for (const s of sels) {
            for (const el of document.querySelectorAll(s)) {
              const txt = el.innerText.trim();
              if (txt.length > 30 && txt.toLowerCase().includes(q.toLowerCase()) && !out.includes(txt)) {
                out.push(txt);
                if (out.length >= 5) return out;
              }
            }
          }
          return out;
        }, searchQuery);

        if (results.length) {
          console.log('📝 Results:');
          results.forEach((r, i) => console.log(`  ${i + 1}. ${r.slice(0, 200)}${r.length > 200 ? '...' : ''}`));
        } else {
          console.log('ℹ️ No results extracted.');
        }
      } catch (innerErr) {
        console.error(`❌ Error with ${selector}:`, innerErr);
      } finally {
        // Navigate back to homepage for next selector
        await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
    }
  } catch (err) {
    console.error('❌ Fatal error during search-bar loop:', err);
  } finally {
    await page.close();
    await browser.close();
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node detect_search_bar.js <url>');
    process.exit(1);
  }
  detectSearchBar(url);
}
