// consent_handler_fixed.js
// Enhanced consent banner handling with proper tab management and Consent-O-Matic integration

const { applyBotMitigation, randomDelay } = require('./bot_mitigation_final_fix');

/**
 * Enhanced Consent-O-Matic detection with multiple indicators
 */
async function isConsentOMaticActive(page) {
  return await page.evaluate(() => {
    // Enhanced Consent-O-Matic detection with more reliable indicators
    const indicators = [
      // Global variables (most reliable)
      () => !!(window.ConsentOMaticCMP || window.ConsentOMatic || window.cmp),
      
      // DOM elements with Consent-O-Matic markers
      () => !!(document.querySelector('[data-consent-o-matic]') ||
               document.querySelector('.ConsentOMatic') ||
               document.querySelector('.ConsentOMatic-Progress-Dialog-Modal') ||
               document.querySelector('.ConsentOMatic-CMP-Hider') ||
               document.querySelector('[data-cmp-ab]') ||
               document.querySelector('[id*="consent-o-matic" i]') ||
               document.querySelector('[class*="consent-o-matic" i]')),

      // Scroll behaviour override classes injected by Consent-O-Matic
      () => !!(document.documentElement.classList.contains('consent-scrollbehaviour-override') ||
               document.body?.classList.contains('consent-scrollbehaviour-override')),
      
      // Chrome extension API availability with extension ID check
      () => {
        if (window.chrome && window.chrome.runtime) {
          try {
            // Try to detect extension by checking for extension-specific behavior
            return document.documentElement.hasAttribute('data-consent-o-matic-processed') ||
                   document.head.querySelector('meta[name="consent-o-matic"]') !== null;
          } catch (e) {
            return true; // Extension API available
          }
        }
        return false;
      },
      
      // Extension scripts in DOM (enhanced detection)
      () => {
        const scripts = Array.from(document.scripts);
        return scripts.some(script => {
          const src = script.src || '';
          const content = script.textContent || '';
          return src.includes('consent') || src.includes('cmp') ||
                 content.includes('ConsentOMatic') || content.includes('consent-o-matic') ||
                 content.includes('CMP') || content.includes('cookiebot');
        });
      },
      
      // Check for cookie banner elements that have been hidden (processed by extension)
      () => {
        const commonBannerSelectors = [
          '[class*="cookie" i]', '[class*="consent" i]', '[class*="gdpr" i]',
          '[id*="cookie" i]', '[id*="consent" i]', '[id*="gdpr" i]'
        ];
        
        return commonBannerSelectors.some(selector => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).some(el => {
            const style = window.getComputedStyle(el);
            return style.display === 'none' || style.visibility === 'hidden';
          });
        });
      }
    ];
    
    let activeCount = 0;
    const results = indicators.map(indicator => {
      try {
        const result = indicator();
        if (result) activeCount++;
        return result;
      } catch (e) {
        return false;
      }
    });
    
    return {
      active: activeCount > 0,
      indicatorCount: activeCount,
      totalChecks: indicators.length,
      results: results
    };
  });
}

/**
 * Check for remaining consent banners after Consent-O-Matic processing
 */
async function checkForRemainingConsentBanners(page) {
  return await page.evaluate(() => {
    const bannerSelectors = [
      // Common cookie banner selectors
      '[class*="cookie" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[class*="consent" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[class*="gdpr" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[id*="cookie" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[id*="consent" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[id*="gdpr" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      
      // Specific banner patterns
      '.cookie-banner:not([style*="display: none"])',
      '.consent-banner:not([style*="display: none"])',
      '.privacy-notice:not([style*="display: none"])',
      '#cookieConsent:not([style*="display: none"])',
      '#cookie-notice:not([style*="display: none"])'
    ];
    
    const visibleBanners = [];
    
    bannerSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        Array.from(elements).forEach(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          
          if (rect.width > 0 && rect.height > 0 && 
              style.visibility !== 'hidden' && 
              style.display !== 'none') {
            visibleBanners.push({
              selector: selector,
              element: el.tagName,
              text: el.textContent?.substring(0, 100) || ''
            });
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    });
    
    return visibleBanners;
  });
}


async function handleConsentBanners(page, browser) {
  try {
    console.log('Checking for consent banners and Consent-O-Matic extension...');
    
    // Get initial page count and close any unwanted tabs
    const initialPages = await browser.pages();
    const mainPage = page;
    const mainPageUrl = page.url();
    
    // Close any extra tabs that might have opened (like Consent-O-Matic welcome page)
    for (const p of initialPages) {
      if (p !== mainPage && !p.isClosed()) {
        const pageUrl = p.url();
        // Close Consent-O-Matic extension pages and other unwanted tabs
        if (pageUrl.includes('chrome-extension://') || 
            pageUrl.includes('consent-o-matic') ||
            pageUrl === 'about:blank' ||
            pageUrl === '') {
          try {
            console.log(`Closing unwanted tab: ${pageUrl}`);
            await p.close();
          } catch (e) {
            console.warn(`Could not close tab ${pageUrl}: ${e.message}`);
          }
        }
      }
    }
    
    // Ensure we're on the main page
    if (page.isClosed() || page.url() !== mainPageUrl) {
      const pages = await browser.pages();
      const targetPage = pages.find(p => p.url() === mainPageUrl);
      if (targetPage) {
        page = targetPage;
        await page.bringToFront();
      }
    }

    // Wait a moment for Consent-O-Matic to do its work
    await randomDelay(2000, 4000);

    // Check if Consent-O-Matic extension is active
    const consentOMaticActive = await isConsentOMaticActive(page);

    if (consentOMaticActive.active) {
      console.log(`Consent-O-Matic detected (${consentOMaticActive.indicatorCount}/${consentOMaticActive.totalChecks} indicators)`);
      
      // Wait longer for Consent-O-Matic to work, then check if banners remain
      await randomDelay(3000, 5000);
      const remainingBanners = await checkForRemainingConsentBanners(page);
      
      if (remainingBanners.length > 0) {
        console.log(`Consent-O-Matic detected but ${remainingBanners.length} banners still visible, applying manual handling...`);
        await manualConsentHandling(page);
      } else {
        console.log('Consent-O-Matic successfully handled consent banners');
      }
    } else {
      console.log('Consent-O-Matic not detected, trying manual consent handling...');
      await manualConsentHandling(page);
    }

    // Additional wait for any remaining consent processing
    await randomDelay(1000, 2000);
    
    // Final cleanup - close any new tabs that opened during consent handling
    const finalPages = await browser.pages();
    for (const p of finalPages) {
      if (p !== page && !p.isClosed()) {
        const pageUrl = p.url();
        if (pageUrl.includes('chrome-extension://') || 
            pageUrl.includes('consent-o-matic') ||
            pageUrl === 'about:blank' ||
            pageUrl === '') {
          try {
            console.log(`Closing tab opened during consent handling: ${pageUrl}`);
            await p.close();
          } catch (e) {
            console.warn(`Could not close consent tab ${pageUrl}: ${e.message}`);
          }
        }
      }
    }
    
    // Ensure main page is focused
    if (!page.isClosed()) {
      await page.bringToFront();
    }

  } catch (error) {
    console.warn('Consent handling error:', error.message);
  }
  
  return page; // Return the main page reference
}

/**
 * Manual consent banner handling as fallback
 */
async function manualConsentHandling(page) {
  try {
    // Common consent banner selectors
    const consentSelectors = [
      // Accept buttons
      'button[id*="accept" i]',
      'button[class*="accept" i]',
      'button[data-testid*="accept" i]',
      // Note: :contains is not supported by querySelectorAll; using text-based fallback below instead
      
      // Common cookie banner classes/IDs
      '#cookie-accept',
      '#accept-cookies',
      '.cookie-accept',
      '.accept-cookies',
      '.cookie-consent-accept',
      '.gdpr-accept',
      '.privacy-accept',
      
      // GDPR/Privacy specific
      '[data-qa="accept-all"]',
      '[data-testid="cookie-accept"]',
      '[aria-label*="accept" i]',
      '[title*="accept" i]',
      
      // Close/dismiss buttons for cookie banners
      'button[aria-label*="close" i]',
      'button[title*="close" i]',
      '.cookie-banner button',
      '.consent-banner button',
      '.privacy-notice button'
    ];

    let consentHandled = false;

    for (const selector of consentSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          // Check if element is visible and clickable
          const isVisible = await element.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          });

          if (isVisible) {
            await element.click();
            console.log(`Clicked consent button: ${selector}`);
            consentHandled = true;
            await randomDelay(500, 1000);
            break;
          }
        }
        if (consentHandled) break;
      } catch (e) {
        // Continue to next selector
        continue;
      }
    }

    // Text-based fallback if CSS selector approach failed
    if (!consentHandled) {
      try {
        const clicked = await page.evaluate(() => {
          const patterns = [
            /accept all/i,
            /accept/i,
            /agree/i,
            /allow all/i,
            /allow/i,
            /ok/i,
            /continue/i,
            /got it/i,
            /i agree/i,
            /consent/i
          ];
          function isVisible(el) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          }
          const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="button" i]'));
          for (const el of candidates) {
            try {
              const text = (el.innerText || el.textContent || '').trim();
              if (!text) continue;
              if (isVisible(el) && patterns.some(p => p.test(text))) {
                el.click();
                return { text, tag: el.tagName };
              }
            } catch (e) {
              // ignore
            }
          }
          return null;
        });
        if (clicked) {
          console.log(`Clicked consent by text: ${clicked.text}`);
          consentHandled = true;
          await randomDelay(500, 1000);
        }
      } catch (e) {
        console.warn('Text-based consent fallback error:', e.message);
      }
    }

    if (!consentHandled) {
      console.log('No consent banners found or already handled');
    }

  } catch (error) {
    console.warn('Manual consent handling error:', error.message);
  }
}

/**
 * Wait for page to be ready for interaction
 */
async function waitForPageReady(page, timeout = 10000) {
  try {
    // Wait for basic page load
    await page.waitForLoadState?.('domcontentloaded', { timeout: timeout / 2 });
    
    // Wait for network to be mostly idle
    await page.waitForLoadState?.('networkidle', { timeout: timeout / 2 });
    
    // Additional wait for dynamic content
    await randomDelay(1000, 2000);
    
    return true;
  } catch (error) {
    console.warn('Page ready wait timeout:', error.message);
    return false;
  }
}

module.exports = {
  handleConsentBanners,
  waitForPageReady,
  isConsentOMaticActive,
  checkForRemainingConsentBanners,
  manualConsentHandling
};
