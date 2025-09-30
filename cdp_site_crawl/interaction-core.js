// interaction-core.js
// Consolidated input interaction: enhanced_input_interaction.js + input_interaction.cjs
// Reduces 2 files (~35KB) into 1 optimized module

const fs = require('fs');
const path = require('path');

/**
 * Unified input interaction system that combines enhanced and basic interaction modes
 */
async function enhancedInputInteraction(page, originalUrl, opts = {}) {
  const {
    instrumentPage,
    queues = {},
    logFile = null,
    maxInteractionsPerPage = Infinity,
    interactionTimeout = 30000,
    enableBotMitigation = true,
    testInputs = ['Where do I find the help center and help support', 'help center', 'support', 'customer service', 'contact support'],
    mode = 'enhanced', // 'enhanced' or 'basic'
    bodyPreviewLimit = 1_000_000,
    bigBodyHardCap = 10_000_000,
    idleAfterOpenMs = 1000,
    finalFreshOriginal = true,
    closeSubmissionTabs = true
  } = opts;

  const browser = page.browser();
  const startUrl = originalUrl || page.url();
  const interactions = [];
  const networkRequests = [];
  
  // Validate startUrl
  if (!startUrl || typeof startUrl !== 'string' || startUrl === 'about:blank') {
    console.warn('Invalid startUrl provided to enhancedInputInteraction');
    return { interactions: [], networkRequests: [], error: 'Invalid URL' };
  }

  // Utility functions
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  const isBinary = (ct = '') => /octet-stream|zip|image|pdf|font|video|audio|wasm/i.test(ct);

  async function safePreview(res) {
    if (!res) return {};
    const headers = res.headers?.() ?? {};
    const ct = headers['content-type'] || '';
    const cl = Number(headers['content-length'] || '0');
    if (isBinary(ct) || (Number.isFinite(cl) && cl > bigBodyHardCap)) return {};
    try {
      const buf = await res.buffer();
      if (!buf) return {};
      const truncated = buf.length > bodyPreviewLimit;
      return {
        bodyPreview: buf.subarray(0, Math.min(buf.length, bodyPreviewLimit)).toString('utf8'),
        bodyPreviewTruncated: truncated || undefined
      };
    } catch { return {}; }
  }

  async function openInstrumentedTab(url) {
    const newPage = await browser.newPage();
    if (typeof instrumentPage === 'function') {
      try { 
        await instrumentPage(newPage, queues); 
      } catch (e) {
        console.warn('instrumentPage error:', e.message);
      }
    }
    await newPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { 
      await newPage.waitForNetworkIdle({ idleTime: idleAfterOpenMs, timeout: 8000 }); 
    } catch {}
    return newPage;
  }

  // Enhanced mode: comprehensive element detection and interaction
  if (mode === 'enhanced') {
    try {
      // Find all interactive elements
      const elements = await page.evaluate(() => {
        const selectors = [
          'input[type="text"]', 'input[type="search"]', 'input[type="email"]',
          'textarea', 'select', 'button', '[role="button"]',
          '[class*="chat" i]', '[class*="help" i]', '[class*="support" i]',
          '[id*="chat" i]', '[id*="help" i]', '[id*="support" i]'
        ];
        
        const elements = [];
        selectors.forEach(selector => {
          try {
            document.querySelectorAll(selector).forEach((el, index) => {
              if (el.offsetParent !== null) { // Element is visible
                elements.push({
                  selector,
                  tagName: el.tagName.toLowerCase(),
                  type: el.type || el.getAttribute('role') || 'unknown',
                  index,
                  text: el.textContent?.trim().substring(0, 100) || '',
                  id: el.id || '',
                  className: el.className || '',
                  placeholder: el.placeholder || ''
                });
              }
            });
          } catch (e) {
            console.warn(`Selector ${selector} failed:`, e.message);
          }
        });
        return elements;
      });

      console.log(`Found ${elements.length} interactive elements`);

      // Interact with each element
      for (let i = 0; i < Math.min(elements.length, maxInteractionsPerPage); i++) {
        const elementInfo = elements[i];
        
        try {
          // Create fresh tab for each interaction
          const interactionPage = await openInstrumentedTab(startUrl);
          
          // Apply bot mitigation if enabled
          if (enableBotMitigation) {
            const { applyBotMitigation } = require('./detection-core.js');
            await applyBotMitigation(interactionPage);
          }

          // Find element on new page
          const element = await findElementOnPage(interactionPage, elementInfo);
          if (!element) {
            await interactionPage.close();
            continue;
          }

          // Perform interaction
          const interactionResult = await performInteraction(interactionPage, element, elementInfo, testInputs);
          interactions.push(interactionResult);

          // Wait for network activity to settle
          await sleep(2000);
          
          // Close interaction tab
          await interactionPage.close();
          
        } catch (error) {
          console.warn(`Interaction ${i} failed:`, error.message);
        }
      }
    } catch (error) {
      console.error('Enhanced interaction mode failed:', error);
    }
  }

  // Basic mode: form-based interaction
  if (mode === 'basic') {
    try {
      const formCount = await page.$$eval('form', fs => fs.length).catch(() => 0);
      console.log(`Processing ${formCount} form(s) in basic mode`);

      for (let idx = 1; idx <= formCount; idx++) {
        if (page.url() !== startUrl) {
          try { 
            await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); 
          } catch (e) { 
            console.warn(`Reload before form #${idx} failed:`, e.message); 
            continue; 
          }
        }

        const form = await page.$(`form:nth-of-type(${idx})`);
        if (!form) continue;

        const els = await form.$$('input, textarea, select');
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          try {
            const tag = (await (await el.getProperty('tagName')).jsonValue()).toLowerCase();
            const type = tag === 'select' 
              ? 'select' 
              : (await (await el.getProperty('type')).jsonValue() || tag).toLowerCase();

            if (['hidden','submit','reset','button','file'].includes(type)) continue;

            try { await form.evaluate(f => f.reset?.()); } catch {}

            if (type === 'checkbox' || type === 'radio') {
              await el.click({ delay: 60 + Math.random()*80 });
              await submitForm(form, page, startUrl, queues);
            } else if (type === 'select') {
              const optVal = await el.$eval('option:not([disabled])', o => o.value);
              await el.select(optVal);
              await submitForm(form, page, startUrl, queues);
            } else {
              await el.focus();
              await el.click({ clickCount: 3 }).catch(() => {});
              await sleep(120 + Math.random()*180);
              await el.type('Are you a bot?', { delay: 25 + Math.random()*25 });
              await sleep(120 + Math.random()*180);
              await submitForm(form, page, startUrl, queues);
            }
          } catch (e) {
            if (e.message.includes('DOM.describeNode') || e.message.includes('Cannot find context')) {
              continue;
            }
            console.warn(`Field #${i+1} error:`, e.message);
          }
        }
      }
    } catch (error) {
      console.error('Basic interaction mode failed:', error);
    }
  }

  // Return fresh tab if requested
  if (finalFreshOriginal) {
    return await openInstrumentedTab(startUrl);
  }
  
  return { interactions, networkRequests };
}

// Helper function to find element on page with multiple strategies
async function findElementOnPage(page, elementInfo) {
  const strategies = [
    // Strategy 1: Direct selector with nth-of-type
    () => {
      if (typeof elementInfo.index === 'number' && !isNaN(elementInfo.index) && elementInfo.index >= 0) {
        return page.$(`${elementInfo.selector}:nth-of-type(${elementInfo.index + 1})`);
      }
      return null;
    },
    
    // Strategy 2: ID-based selection
    () => elementInfo.id ? page.$(`#${elementInfo.id}`) : null,
    
    // Strategy 3: Class-based selection
    () => elementInfo.className ? page.$(`.${elementInfo.className.split(' ')[0]}`) : null,
    
    // Strategy 4: Fallback to just the selector
    () => elementInfo.selector ? page.$(elementInfo.selector) : null
  ];

  for (const strategy of strategies) {
    try {
      const element = await strategy();
      if (element) return element;
    } catch (error) {
      // Continue to next strategy
    }
  }
  
  return null;
}

// Helper function to perform interaction with element
async function performInteraction(page, element, elementInfo, testInputs) {
  const interactionStart = Date.now();
  const result = {
    elementInfo,
    timestamp: interactionStart,
    success: false,
    error: null,
    networkActivity: []
  };

  try {
    const tagName = elementInfo.tagName.toLowerCase();
    const type = elementInfo.type.toLowerCase();

    if (tagName === 'input' && ['text', 'search', 'email'].includes(type)) {
      await element.focus();
      await element.click({ clickCount: 3 });
      await page.waitForTimeout(200);
      
      const testInput = testInputs[Math.floor(Math.random() * testInputs.length)];
      await element.type(testInput, { delay: 50 + Math.random() * 50 });
      await page.keyboard.press('Enter');
      
    } else if (tagName === 'textarea') {
      await element.focus();
      await element.click({ clickCount: 3 });
      await page.waitForTimeout(200);
      
      const testInput = testInputs[Math.floor(Math.random() * testInputs.length)];
      await element.type(testInput, { delay: 50 + Math.random() * 50 });
      
    } else if (tagName === 'button' || elementInfo.type === 'button') {
      await element.click();
      
    } else if (tagName === 'select') {
      const options = await element.$$('option');
      if (options.length > 1) {
        const randomOption = options[Math.floor(Math.random() * options.length)];
        const value = await randomOption.evaluate(opt => opt.value);
        await element.select(value);
      }
    }

    result.success = true;
  } catch (error) {
    result.error = error.message;
  }

  result.duration = Date.now() - interactionStart;
  return result;
}

// Helper function to submit form and handle responses
async function submitForm(form, page, startUrl, queues) {
  let navResp = null, xhrResp = null;
  
  try {
    const submitBtn = await form.$('button[type=submit], input[type=submit]');
    const navP = page.waitForNavigation({ 
      waitUntil: ['domcontentloaded','networkidle2'], 
      timeout: 15000 
    }).catch(() => null);
    
    const xhrP = page.waitForResponse(r => {
      const q = r.request();
      return q.frame() === page.mainFrame() && ['POST','PUT','PATCH','DELETE'].includes(q.method());
    }, { timeout: 15000 }).catch(() => null);

    if (submitBtn) {
      await submitBtn.click({ delay: 80 + Math.random()*120 });
    } else {
      await form.evaluate(f => f.submit());
    }

    [navResp, xhrResp] = await Promise.all([navP, xhrP]);
  } catch (e) {
    console.warn('Submit/wait error:', e.message);
  }

  // Log responses
  for (const res of [navResp, xhrResp].filter(Boolean)) {
    try {
      const preview = await safePreview(res);
      queues.responseQueue?.enqueue?.({
        event: 'formSubmissionResponse',
        url: res.url(),
        status: res.status(),
        headers: res.headers?.() ?? {},
        ts: Date.now(),
        ...preview
      });
    } catch {}
  }

  // Navigate back to start URL if needed
  if (!page.isClosed() && page.url() !== startUrl) {
    try { 
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); 
    } catch {}
  }
}

module.exports = {
  enhancedInputInteraction
};
