// consent_handler.js
// Additional consent banner handling to ensure Consent-O-Matic is working properly

const { randomDelay } = require('./bot_mitigation');

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
               document.querySelector('[data-cmp-ab]') ||
               document.querySelector('[id*="consent-o-matic" i]') ||
               document.querySelector('[class*="consent-o-matic" i]')),
      
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
        const cookieElements = document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i]');
        return Array.from(cookieElements).some(el => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
        });
      },
      
      // Check for extension-specific CSS modifications
      () => {
        const stylesheets = Array.from(document.styleSheets);
        return stylesheets.some(sheet => {
          try {
            return sheet.href && (sheet.href.includes('consent') || sheet.href.includes('cmp'));
          } catch (e) {
            return false;
          }
        });
      }
    ];
    
    // Return detailed detection results
    const results = indicators.map((check, index) => {
      try {
        return { index, result: check() };
      } catch (e) {
        return { index, result: false, error: e.message };
      }
    });
    
    const activeIndicators = results.filter(r => r.result);
    
    return {
      active: activeIndicators.length > 0,
      indicatorCount: activeIndicators.length,
      totalChecks: indicators.length,
      activeChecks: activeIndicators.map(r => r.index),
      details: results
    };
  });
}

/**
 * Verify Consent-O-Matic extension is loaded and working
 * Also provide manual fallback for cookie banners
 */
async function handleConsentBanners(page) {
  try {
    console.log('🍪 Checking for consent banners and Consent-O-Matic extension...');

    // Wait a moment for Consent-O-Matic to do its work
    await randomDelay(2000, 4000);

    // Check if Consent-O-Matic extension is active
    const consentOMaticActive = await isConsentOMaticActive(page);

    if (consentOMaticActive.active) {
      console.log(`✅ Consent-O-Matic detected (${consentOMaticActive.indicatorCount}/${consentOMaticActive.totalChecks} indicators)`);
      
      // Wait longer for Consent-O-Matic to work, then check if banners remain
      await randomDelay(3000, 5000);
      const remainingBanners = await checkForRemainingConsentBanners(page);
      
      if (remainingBanners.length > 0) {
        console.log(`⚠️  Consent-O-Matic detected but ${remainingBanners.length} banners still visible, applying manual handling...`);
        await manualConsentHandling(page);
      } else {
        console.log('✅ Consent-O-Matic successfully handled consent banners');
      }
    } else {
      console.log('⚠️  Consent-O-Matic not detected, trying manual consent handling...');
      await manualConsentHandling(page);
    }

    // Additional wait for any remaining consent processing
    await randomDelay(1000, 2000);

  } catch (error) {
    console.warn('Consent handling error:', error.message);
  }
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
      'button:contains("Accept All")',
      'button:contains("Accept all")',
      'button:contains("Accept")',
      'button:contains("OK")',
      'button:contains("I Agree")',
      'button:contains("Agree")',
      'button:contains("Allow All")',
      'button:contains("Continue")',
      
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
            console.log(`✅ Clicked consent button: ${selector}`);
            consentHandled = true;
            await randomDelay(500, 1000);
            break;
          }
        }
        if (consentHandled) break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!consentHandled) {
      console.log('ℹ️  No consent banners found or already handled');
    }

  } catch (error) {
    console.warn('Manual consent handling failed:', error.message);
  }
}

/**
 * Wait for page to be ready after consent handling
 */
async function waitForPageReady(page) {
  try {
    // Wait for network to be idle after consent handling
    await page.waitForNetworkIdle({ 
      idleTime: 1000, 
      timeout: 8000 
    });
  } catch (e) {
    // Network idle timeout is acceptable
  }

  // Additional wait for any dynamic content
  await randomDelay(1000, 2000);
}

async function checkForRemainingConsentBanners(page) {
  return await page.evaluate(() => {
    const bannerSelectors = [
      '[id*="cookie" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[class*="cookie" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[id*="consent" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[class*="consent" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[id*="gdpr" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[class*="gdpr" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[aria-label*="cookie" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '[aria-label*="consent" i]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '.cookie-banner:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '.consent-banner:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '#cookieConsent:not([style*="display: none"]):not([style*="visibility: hidden"])',
      '#cookie-consent:not([style*="display: none"]):not([style*="visibility: hidden"])'
    ];
    
    const visibleBanners = [];
    
    bannerSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          
          // Check if element is actually visible
          if (rect.width > 0 && rect.height > 0 && 
              style.display !== 'none' && 
              style.visibility !== 'hidden' && 
              style.opacity !== '0') {
            visibleBanners.push({
              selector: selector,
              id: el.id,
              className: el.className,
              text: el.textContent.substring(0, 100)
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

module.exports = {
  handleConsentBanners,
  manualConsentHandling,
  waitForPageReady,
  isConsentOMaticActive,
  checkForRemainingConsentBanners
};
