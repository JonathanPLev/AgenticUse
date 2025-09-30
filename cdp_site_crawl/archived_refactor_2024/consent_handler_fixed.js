// consent_handler_fixed.js

const { applyBotMitigation, randomDelay } = require('./bot_mitigation_final_fix');

/**
 * Enhanced Consent-O-Matic detection with multiple indicators
 */
async function isConsentOMaticActive(page) {
  return await page.evaluate(() => {
    const indicators = [
      // Chrome extension API (most reliable - extension is loaded)
      () => !!(window.chrome && window.chrome.runtime),

      // Global variables
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
      
      // Extension processed markers
      () => !!(document.documentElement.hasAttribute('data-consent-o-matic-processed') ||
               document.head.querySelector('meta[name="consent-o-matic"]')),
      
      // Absence of visible cookie banners (indirect indicator)
      () => {
        const bannerSelectors = [
          '[id*="cookie" i]', '[class*="cookie" i]',
          '[id*="consent" i]', '[class*="consent" i]',
          '[id*="gdpr" i]', '[class*="gdpr" i]'
        ];
        
        let visibleBanners = 0;
        bannerSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              if (rect.width > 0 && rect.height > 0 && 
                  style.visibility !== 'hidden' && style.display !== 'none') {
                visibleBanners++;
              }
            });
          } catch (e) {}
        });
        
        // If no visible banners found, extension likely worked
        return visibleBanners === 0;
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
    
    const activeIndicators = indicators.filter(indicator => {
      try {
        return indicator();
      } catch (e) {
        return false;
      }
    });

    return {
      anyActive: activeIndicators.length > 0,
      activeCount: activeIndicators.length,
      totalIndicators: indicators.length,
      // Consider extension active if Chrome API available OR no visible banners
      extensionWorking: activeIndicators.length >= 1,
      details: indicators.map((indicator, index) => {
        try {
          return { index, result: indicator() };
        } catch (e) {
          return { index, result: false, error: e.message };
        }
      })
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
    
    // Ensure we're on the main page and it's active
    await randomDelay(500, 1000); // Wait for tab closure to complete
    
    const currentPages = await browser.pages();
    let targetPage = currentPages.find(p => !p.isClosed() && p.url() === mainPageUrl);
    
    if (!targetPage) {
      // If main page not found, find any page with the target domain
      const targetDomain = new URL(mainPageUrl).hostname;
      targetPage = currentPages.find(p => {
        try {
          return !p.isClosed() && new URL(p.url()).hostname === targetDomain;
        } catch (e) {
          return false;
        }
      });
    }
    
    if (targetPage && !targetPage.isClosed()) {
      page = targetPage;
      await page.bringToFront();
      console.log(`Switched to main page: ${page.url()}`);
    } else {
      console.warn(`Could not find main page with URL: ${mainPageUrl}`);
    }

    // Wait a moment for Consent-O-Matic to do its work
    await randomDelay(2000, 4000);

    // Check if Consent-O-Matic extension is active
    const consentOMaticResult = await isConsentOMaticActive(page);
  
  if (consentOMaticResult.extensionWorking) {
    console.log(`Consent-O-Matic active (${consentOMaticResult.activeCount}/${consentOMaticResult.totalIndicators} indicators)`);
    
    // Wait a bit longer for Consent-O-Matic to process
    await randomDelay(3000, 5000);
    
    // Check if there are still visible consent banners
    const remainingBanners = await checkForRemainingConsentBanners(page);
    
    if (remainingBanners && remainingBanners.length === 0) {
      console.log('Consent-O-Matic successfully handled consent banners');
      return page;
    } else {
      const bannerCount = remainingBanners ? remainingBanners.length : 0;
      console.log(`Consent-O-Matic active but ${bannerCount} banners still visible, applying manual handling...`);
      await manualConsentHandling(page);
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
    
    // Ensure main page is focused and return the correct page reference
    const endPages = await browser.pages();
    const mainPageFinal = endPages.find(p => !p.isClosed() && p.url() === mainPageUrl);
    
    if (mainPageFinal) {
      page = mainPageFinal;
      await page.bringToFront();
      console.log(`Final page focus: ${page.url()}`);
    } else {
      console.warn(`Main page lost during consent handling: ${mainPageUrl}`);
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
