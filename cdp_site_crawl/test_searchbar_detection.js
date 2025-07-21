// detect_search_bar.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

import { searchBarSelectors } from './static_data_structs.js';

export async function detectSearchBar(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 1. Check for search bar presence
    const hasSearchBar = await page.evaluate((selectors) =>
      selectors.some((sel) => !!document.querySelector(sel)),
      searchBarSelectors
    );

    if (!hasSearchBar) {
      console.log('🔎 No search bar found.');
      return;
    }

    // 2. Find the first visible and enabled search input
    const searchSel = await page.evaluate((selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (
          el &&
          el.offsetParent !== null && // visible
          !el.disabled &&
          !el.readOnly
        ) {
          return sel;
        }
      }
      return null;
    }, searchBarSelectors);

    if (!searchSel) {
      console.log('🔎 Search bar detected, but none were interactable.');
      return;
    }

    // 3. Interact with the search bar
    await page.waitForSelector(searchSel, { timeout: 3000 });
    await page.click(searchSel, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    const searchQuery = 'test query';
    await page.type(searchSel, searchQuery);

    // 4. Try to submit via form if possible, otherwise press Enter
    const formSubmitted = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const form = el.closest('form');
      if (form) {
        form.submit();
        return true;
      }
      return false;
    }, searchSel);

    if (!formSubmitted) {
      await page.keyboard.press('Enter');
    }

    console.log(`✅ Search bar detected and used: ${searchSel}`);

    // 5. Wait for results: navigation or content change
    try {
      await Promise.race([
        page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' }).catch(() => {}),
        page.waitForFunction(
          (selector, q) => {
            const elements = Array.from(document.querySelectorAll('*'));
            return elements.some(
              (el) => el.textContent && el.textContent.toLowerCase().includes(q.toLowerCase())
            );
          },
          { timeout: 5000 },
          searchSel,
          searchQuery
        ).catch(() => {}),
      ]);
      console.log('🔍 Search results likely appeared (waited for navigation or content update).');
      // Attempt to extract up to 5 visible results containing the search query
const foundResults = await page.evaluate((q) => {
    // Try several common selectors
    const resultSelectors = [
      '[class*=result]',
      '[id*=result]',
      '[class*=item]',
      'li',
      'article',
      'div',
    ];
    let results = [];
    for (const sel of resultSelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const txt = el.innerText || '';
        if (
          txt.length > 30 &&
          txt.toLowerCase().includes(q.toLowerCase()) &&
          !results.includes(txt)
        ) {
          results.push(txt.trim());
          if (results.length >= 5) break;
        }
      }
      if (results.length >= 5) break;
    }
    return results;
  }, searchQuery);

  if (foundResults && foundResults.length) {
    console.log('📝 Top search results:');
    foundResults.forEach((res, i) => {
      console.log(`  ${i + 1}. ${res.slice(0, 200)}${res.length > 200 ? '...' : ''}`);
    });
  } else {
    console.log('ℹ️ Could not extract any search results from the page.');
  }

    } catch (err) {
      console.warn('⚠️  Could not detect new search results or navigation.');
    }
  } catch (err) {
    console.error('❌ Error during search bar detection:', err);
  } finally {
    await page.close();
    await browser.close();
  }
}

// CLI entry point for ESM
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node detect_search_bar.js <url>');
    process.exit(1);
  }
  detectSearchBar(url);
}
