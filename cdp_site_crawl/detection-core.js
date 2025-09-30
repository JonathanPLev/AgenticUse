// detection-core.js
// Consolidated detection: generic_detection_fixed.js + bot_mitigation_final_fix.js + consent_handler_fixed.js
// Reduces 3 files (~40KB) into 1 optimized module

const fs = require('fs');
const path = require('path');
const { chatLaunchers, searchBarSelectors, helpLaunchers, genericChatbotDetection } = require('./utils.js');

// ===== BOT MITIGATION =====
async function applyBotMitigation(page, options = {}) {
  const {
    enableMouseMovement = true,
    enableRandomScrolling = true,
    enableRandomDelays = true,
    enableWebGLFingerprinting = true,
    enableCanvasFingerprinting = true,
    enableTimingAttacks = true,
    logMitigation = false
  } = options;

  if (logMitigation) console.log('Applying enhanced bot mitigation...');

  try {
    await page.evaluateOnNewDocument(() => {
      // Enhanced webdriver property handling
      try {
        delete Object.getPrototypeOf(navigator).webdriver;
        delete navigator.webdriver;
        navigator.webdriver = undefined;
      } catch (e1) {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
          if (descriptor && descriptor.configurable) {
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined,
              set: () => {},
              configurable: true,
              enumerable: false
            });
          } else {
            Object.setPrototypeOf(navigator, new Proxy(Object.getPrototypeOf(navigator), {
              get: (target, prop) => prop === 'webdriver' ? undefined : target[prop],
              has: (target, prop) => prop === 'webdriver' ? false : prop in target
            }));
          }
        } catch (e2) {
          console.warn('Webdriver property mitigation failed:', e2.message);
        }
      }

      // Enhanced fingerprinting protection
      if (window.chrome) {
        Object.defineProperty(window.chrome, 'runtime', {
          get: () => ({ onConnect: undefined, onMessage: undefined }),
          configurable: true
        });
      }

      // Canvas fingerprinting protection
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        const context = getContext.apply(this, [type, ...args]);
        if (type === '2d') {
          const imageData = context.getImageData;
          context.getImageData = function(...args) {
            const data = imageData.apply(this, args);
            for (let i = 0; i < data.data.length; i += 4) {
              data.data[i] += Math.floor(Math.random() * 3) - 1;
              data.data[i + 1] += Math.floor(Math.random() * 3) - 1;
              data.data[i + 2] += Math.floor(Math.random() * 3) - 1;
            }
            return data;
          };
        }
        return context;
      };

      // WebGL fingerprinting protection
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.apply(this, arguments);
      };

      // Timing attack protection
      const originalPerformanceNow = performance.now;
      performance.now = function() {
        return originalPerformanceNow.call(this) + Math.random() * 0.1;
      };
    });

    // Human-like mouse movements
    if (enableMouseMovement) {
      await randomDelay(100, 300);
      await page.mouse.move(
        Math.random() * 100 + 50,
        Math.random() * 100 + 50,
        { steps: Math.floor(Math.random() * 5) + 3 }
      );
    }

    // Random scrolling
    if (enableRandomScrolling) {
      await randomDelay(200, 500);
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 200 - 100);
      });
    }

  } catch (error) {
    console.warn('Bot mitigation failed:', error.message);
  }
}

async function randomDelay(min = 100, max = 500) {
  const delay = Math.random() * (max - min) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function setRealisticHeaders(page) {
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
  });
}

// ===== GENERIC DETECTION =====
async function detectSearchBarsGeneric(page) {
  return await Promise.race([
    page.evaluate(() => {
      const searchElements = [];
      const searchPatterns = [
        /search/i, /query/i, /find/i, /lookup/i, /filter/i, /explore/i, /discover/i
      ];
      
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      inputs.forEach(el => {
        try {
          const className = el.className || '';
          const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
          const id = el.id || '';
          const placeholder = el.placeholder || '';
          const name = el.name || '';
          const type = el.type || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          
          const attributesToCheck = [classString, id, placeholder, name, type, ariaLabel];
          const matchesPattern = attributesToCheck.some(attr => 
            searchPatterns.some(pattern => pattern.test(attr))
          );
          
          if (matchesPattern) {
            searchElements.push({
              type: 'search_input',
              tagName: el.tagName,
              id: id,
              className: classString,
              placeholder: placeholder,
              name: name,
              inputType: type,
              ariaLabel: ariaLabel,
              selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : el.tagName.toLowerCase()),
              detectionMethod: 'generic_search_pattern',
              isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
            });
          }
        } catch (e) {
          console.warn('Search detection error:', e.message);
        }
      });
      return searchElements;
    }),
    new Promise(resolve => setTimeout(() => resolve([]), 5000))
  ]);
}

async function detectChatbotsGeneric(page) {
  return await Promise.race([
    page.evaluate(() => {
      const chatbotElements = [];
      const chatPatterns = [
        /chat/i, /support/i, /help/i, /assistant/i, /bot/i, /message/i, /conversation/i, /contact/i
      ];
      
      const allElements = Array.from(document.querySelectorAll('*'));
      allElements.forEach(el => {
        try {
          const className = el.className || '';
          const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
          const id = el.id || '';
          const textContent = el.textContent || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          
          const attributesToCheck = [classString, id, textContent.substring(0, 100), ariaLabel];
          const matchesPattern = attributesToCheck.some(attr => 
            chatPatterns.some(pattern => pattern.test(attr))
          );
          
          if (matchesPattern && (el.offsetWidth > 0 && el.offsetHeight > 0)) {
            chatbotElements.push({
              type: 'chatbot_element',
              tagName: el.tagName,
              id: id,
              className: classString,
              textContent: textContent.substring(0, 200),
              ariaLabel: ariaLabel,
              selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : el.tagName.toLowerCase()),
              detectionMethod: 'generic_chatbot_pattern',
              isVisible: true
            });
          }
        } catch (e) {
          console.warn('Chatbot detection error:', e.message);
        }
      });
      return chatbotElements;
    }),
    new Promise(resolve => setTimeout(() => resolve([]), 5000))
  ]);
}

async function performGenericDetection(page) {
  try {
    const [searchBars, chatbots] = await Promise.all([
      detectSearchBarsGeneric(page),
      detectChatbotsGeneric(page)
    ]);
    
    return {
      searchBars: searchBars || [],
      chatbots: chatbots || [],
      timestamp: Date.now(),
      url: page.url()
    };
  } catch (error) {
    console.warn('Generic detection failed:', error.message);
    return { searchBars: [], chatbots: [], timestamp: Date.now(), url: page.url() };
  }
}

// ===== CONSENT HANDLING =====
async function handleConsentBanners(page, options = {}) {
  const { timeout = 10000, logActions = false } = options;
  
  try {
    // Common consent banner selectors
    const consentSelectors = [
      '[id*="consent" i]', '[class*="consent" i]',
      '[id*="cookie" i]', '[class*="cookie" i]',
      '[id*="gdpr" i]', '[class*="gdpr" i]',
      '[id*="privacy" i]', '[class*="privacy" i]',
      'button[id*="accept" i]', 'button[class*="accept" i]',
      'button[id*="agree" i]', 'button[class*="agree" i]',
      'button[id*="allow" i]', 'button[class*="allow" i]'
    ];

    const consentButtons = await page.evaluate((selectors) => {
      const buttons = [];
      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (el.offsetParent !== null) { // Visible element
              buttons.push({
                selector,
                text: el.textContent?.trim().substring(0, 100) || '',
                tagName: el.tagName,
                id: el.id,
                className: el.className
              });
            }
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });
      return buttons;
    }, consentSelectors);

    if (consentButtons.length > 0 && logActions) {
      console.log(`Found ${consentButtons.length} potential consent elements`);
    }

    // Try to click accept buttons
    for (const button of consentButtons.slice(0, 3)) { // Limit to first 3
      try {
        const element = await page.$(button.selector);
        if (element) {
          await element.click();
          await randomDelay(500, 1000);
          if (logActions) {
            console.log(`Clicked consent button: ${button.text}`);
          }
          break; // Stop after first successful click
        }
      } catch (error) {
        // Continue to next button
      }
    }

    return { handled: consentButtons.length > 0, buttonsFound: consentButtons.length };
  } catch (error) {
    console.warn('Consent handling failed:', error.message);
    return { handled: false, buttonsFound: 0 };
  }
}

async function waitForPageReady(page, options = {}) {
  const { timeout = 30000, waitForSelectors = [] } = options;
  
  try {
    // Wait for basic page load
    await page.waitForLoadState('domcontentloaded', { timeout });
    
    // Wait for network to be mostly idle
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 10000) });
    
    // Wait for specific selectors if provided
    if (waitForSelectors.length > 0) {
      await Promise.race([
        Promise.all(waitForSelectors.map(selector => 
          page.waitForSelector(selector, { timeout: 5000 }).catch(() => null)
        )),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
    }
    
    return true;
  } catch (error) {
    console.warn('Page ready wait failed:', error.message);
    return false;
  }
}

module.exports = {
  // Bot mitigation
  applyBotMitigation,
  randomDelay,
  setRealisticHeaders,
  
  // Detection
  performGenericDetection,
  detectSearchBarsGeneric,
  detectChatbotsGeneric,
  
  // Consent handling
  handleConsentBanners,
  waitForPageReady
};
