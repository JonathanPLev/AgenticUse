// enhanced_input_interaction.js
// Comprehensive input interaction with fresh browser tabs and detailed logging

const { applyBotMitigation, randomDelay } = require('./bot_mitigation');
const { performGenericDetection, detectChatbotsInAllFrames } = require('./generic_detection');
const fs = require('fs');
const path = require('path');

/**
 * Enhanced input interaction that finds and interacts with ALL input elements
 * Each interaction happens in a fresh browser tab with full network logging
 */
async function enhancedInputInteraction(page, originalUrl, opts = {}) {
  const {
    instrumentPage,
    queues = {},
    logFile = null,
    maxInteractionsPerPage = Infinity, // No limit for production use
    interactionTimeout = 30000,
    enableBotMitigation = true,
    testInputs = ['test input', 'Are you a bot?', 'hello', 'search query', '123']
  } = opts;

  const browser = page.browser();
  const startUrl = originalUrl || page.url();
  const interactions = [];
  const networkRequests = [];
  
  // Validate startUrl before proceeding
  if (!startUrl || typeof startUrl !== 'string' || startUrl === 'about:blank') {
    throw new Error(`Invalid or missing URL for enhanced input interaction: ${startUrl}`);
  }
  
  console.log(`🔍 Starting enhanced input interaction for: ${startUrl}`);

  try {
    // Apply bot mitigation before any interactions
    if (enableBotMitigation) {
      await applyBotMitigation(page);
    }

    // Use generic detection to find search elements and chatbots (Comments 8, 9, 10)
    const genericDetection = await performGenericDetection(page);
    console.log(`🔍 Generic detection results:`);
    console.log(`   📝 Search elements: ${genericDetection.searchElements.length}`);
    console.log(`   💬 Chatbots (main frame): ${genericDetection.chatbots.length}`);
    console.log(`   🖼️  Chatbots (all frames): ${genericDetection.iframeChatbots.length}`);
    
    // Find all interactive input elements (traditional method)
    const inputElements = await findAllInputElements(page);
    console.log(`📝 Found ${inputElements.length} input elements using traditional selectors`);
    
    // Combine generic detection results with traditional input elements
    const allDetectedElements = [
      ...inputElements,
      ...genericDetection.searchElements.map(el => ({...el, detectionSource: 'generic_search'})),
      ...genericDetection.chatbots.filter(cb => cb.selector).map(cb => ({...cb, detectionSource: 'generic_chatbot'})),
      ...genericDetection.iframeChatbots.filter(cb => cb.selector).map(cb => ({...cb, detectionSource: 'iframe_chatbot'}))
    ];
    
    console.log(`📊 Total elements to interact with: ${allDetectedElements.length}`);

    let interactionCount = 0;
    for (const element of allDetectedElements) {
      if (maxInteractionsPerPage !== Infinity && interactionCount >= maxInteractionsPerPage) {
        console.log(`⚠️  Reached max interactions limit (${maxInteractionsPerPage})`);
        break;
      }

      try {
        // Create fresh browser tab for this interaction
        const freshTab = await createFreshTab(browser, startUrl, instrumentPage, queues);
        
        // Track network requests for this interaction
        const interactionNetworkRequests = [];
        const requestListener = (request) => {
          interactionNetworkRequests.push({
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
            postData: request.postData(),
            timestamp: Date.now(),
            resourceType: request.resourceType()
          });
        };
        
        freshTab.on('request', requestListener);

        // Perform the interaction
        const interactionResult = await performSingleInteraction(
          freshTab, 
          element, 
          testInputs[interactionCount % testInputs.length],
          interactionTimeout
        );

        // Wait for network activity to settle
        await randomDelay(1000, 3000);

        // Stop tracking requests
        freshTab.off('request', requestListener);

        // Enhanced logging with detection source information
        const interactionLog = {
          elementInfo: element,
          inputValue: testInputs[interactionCount % testInputs.length],
          timestamp: Date.now(),
          success: interactionResult.success,
          error: interactionResult.error,
          networkRequests: interactionNetworkRequests,
          detectionSource: element.detectionSource || 'traditional_selector',
          detectionMethod: element.detectionMethod || 'hardcoded_selector'
        };
        
        interactions.push(interactionLog);
        networkRequests.push(...interactionNetworkRequests);
        
        // Enhanced logging to interaction queue
        if (queues.interactionQueue) {
          queues.interactionQueue.enqueue({
            event: 'inputInteraction',
            url: startUrl,
            element: element,
            input: testInputs[interactionCount % testInputs.length],
            result: interactionResult,
            detectionSource: element.detectionSource || 'traditional_selector',
            detectionMethod: element.detectionMethod || 'hardcoded_selector',
            timestamp: Date.now()
          });
        }

        console.log(`✅ Interaction ${interactionCount + 1}/${allDetectedElements.length} completed`);
        
        // Close the fresh tab
        await freshTab.close();
        
        interactionCount++;
        
        // Random delay between interactions
        await randomDelay(500, 2000);

      } catch (error) {
        console.warn(`⚠️  Interaction ${interactionCount + 1} failed:`, error.message);
        
        // If it's a URL-related error, try to continue with the original page instead of fresh tabs
        if (error.message.includes('Invalid parameters') || error.message.includes('url') || error.message.includes('navigate')) {
          console.log(`🔄 URL error detected, switching to original page interaction mode...`);
          try {
            // Perform interaction on original page instead
            const interactionResult = await performSingleInteraction(
              page, 
              element, 
              testInputs[interactionCount % testInputs.length],
              interactionTimeout
            );
            
            const interactionLog = {
              elementInfo: element,
              inputValue: testInputs[interactionCount % testInputs.length],
              timestamp: Date.now(),
              success: interactionResult.success,
              error: interactionResult.error,
              networkRequests: [],
              detectionSource: element.detectionSource || 'traditional_selector',
              detectionMethod: element.detectionMethod || 'hardcoded_selector',
              fallbackMode: 'original_page_interaction'
            };
            
            interactions.push(interactionLog);
            console.log(`✅ Fallback interaction ${interactionCount + 1} completed on original page`);
            
          } catch (fallbackError) {
            console.warn(`⚠️  Fallback interaction also failed:`, fallbackError.message);
          }
        }
        
        interactionCount++;
      }
    }

    // Log summary
    const summary = {
      url: startUrl,
      totalElementsFound: allDetectedElements.length,
      traditionalElements: inputElements.length,
      genericSearchElements: genericDetection.searchElements.length,
      genericChatbots: genericDetection.chatbots.length,
      iframeChatbots: genericDetection.iframeChatbots.length,
      totalInteractions: interactionCount,
      totalNetworkRequests: networkRequests.length,
      interactions: interactions,
      genericDetectionResults: genericDetection
    };

    console.log(`📊 Interaction Summary: ${interactionCount} interactions, ${networkRequests.length} network requests`);
    
    return summary;

  } catch (error) {
    console.error('❌ Enhanced input interaction failed:', error.message);
    throw error;
  }
}

/**
 * Find all interactive input elements on the page
 */
async function findAllInputElements(page) {
  return await page.evaluate(() => {
    const elements = [];
    
    // Define all possible input selectors
    const inputSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="password"]',
      'input[type="search"]',
      'input[type="tel"]',
      'input[type="url"]',
      'input[type="number"]',
      'input[type="date"]',
      'input[type="datetime-local"]',
      'input[type="month"]',
      'input[type="week"]',
      'input[type="time"]',
      'input[type="color"]',
      'input[type="range"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'input:not([type])', // inputs without type default to text
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable=""]'
    ];

    // Find elements using all selectors
    inputSelectors.forEach(selector => {
      try {
        const foundElements = document.querySelectorAll(selector);
        foundElements.forEach((el, index) => {
          // Skip hidden or disabled elements
          if (el.offsetParent === null || el.disabled) return;
          
          // Get element information
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const elementInfo = {
            tagName: el.tagName.toLowerCase(),
            type: el.type || el.tagName.toLowerCase(),
            id: el.id || null,
            name: el.name || null,
            className: el.className || null,
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            selector: selector,
            index: index,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            visible: true,
            interactable: true
          };

          elements.push(elementInfo);
        });
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e.message);
      }
    });

    // Remove duplicates based on position and type
    const uniqueElements = [];
    const seen = new Set();
    
    elements.forEach(el => {
      const key = `${el.rect.x}-${el.rect.y}-${el.type}-${el.tagName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueElements.push(el);
      }
    });

    return uniqueElements;
  });
}

/**
 * Create a fresh browser tab with instrumentation
 */
async function createFreshTab(browser, url, instrumentPage, queues) {
  const newTab = await browser.newPage();
  
  // Apply instrumentation if provided
  if (typeof instrumentPage === 'function') {
    try {
      await instrumentPage(newTab, queues);
    } catch (error) {
      console.warn('⚠️  Instrumentation failed for fresh tab:', error.message);
    }
  }

  // Apply bot mitigation to fresh tab
  await applyBotMitigation(newTab);

  // Validate URL before navigation
  if (!url || typeof url !== 'string') {
    throw new Error(`Invalid URL provided to createFreshTab: ${url}`);
  }

  // Ensure URL has proper protocol
  let validUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    validUrl = 'https://' + url;
  }

  try {
    // Test URL validity
    new URL(validUrl);
  } catch (error) {
    throw new Error(`Invalid URL format: ${validUrl}`);
  }

  // Navigate to the URL
  await newTab.goto(validUrl, { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });

  // Wait for page to settle
  try {
    await newTab.waitForNetworkIdle({ 
      idleTime: 1000, 
      timeout: 8000 
    });
  } catch (e) {
    // Network idle timeout is acceptable
  }

  return newTab;
}

/**
 * Perform a single interaction with an input element
 */
async function performSingleInteraction(page, elementInfo, testInput, timeout) {
  const startTime = Date.now();
  
  try {
    // Find the element on the fresh page
    const element = await findElementOnPage(page, elementInfo);
    if (!element) {
      return {
        success: false,
        error: 'Element not found on fresh page',
        duration: Date.now() - startTime
      };
    }

    // Scroll element into view
    await element.scrollIntoView();
    await randomDelay(200, 500);

    // Focus on the element
    await element.focus();
    await randomDelay(100, 300);

    let interactionResult = {};

    // Perform interaction based on element type
    switch (elementInfo.type) {
      case 'checkbox':
      case 'radio':
        await element.click();
        interactionResult = {
          action: 'click',
          checked: await element.evaluate(el => el.checked)
        };
        break;

      case 'select':
        const options = await element.$$('option:not([disabled])');
        if (options.length > 0) {
          const randomOption = options[Math.floor(Math.random() * options.length)];
          const value = await randomOption.evaluate(opt => opt.value);
          await element.select(value);
          interactionResult = {
            action: 'select',
            selectedValue: value
          };
        }
        break;

      case 'range':
        const min = await element.evaluate(el => el.min || 0);
        const max = await element.evaluate(el => el.max || 100);
        const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
        await element.evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomValue);
        interactionResult = {
          action: 'setValue',
          value: randomValue
        };
        break;

      case 'color':
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        await element.evaluate((el, color) => {
          el.value = color;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomColor);
        interactionResult = {
          action: 'setValue',
          value: randomColor
        };
        break;

      case 'date':
        const randomDate = generateRandomDate();
        await element.evaluate((el, date) => {
          el.value = date;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomDate);
        interactionResult = {
          action: 'setValue',
          value: randomDate
        };
        break;

      case 'datetime-local':
        const randomDateTime = generateRandomDateTime();
        await element.evaluate((el, datetime) => {
          el.value = datetime;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomDateTime);
        interactionResult = {
          action: 'setValue',
          value: randomDateTime
        };
        break;

      case 'time':
        const randomTime = generateRandomTime();
        await element.evaluate((el, time) => {
          el.value = time;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomTime);
        interactionResult = {
          action: 'setValue',
          value: randomTime
        };
        break;

      case 'month':
        const randomMonth = generateRandomMonth();
        await element.evaluate((el, month) => {
          el.value = month;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomMonth);
        interactionResult = {
          action: 'setValue',
          value: randomMonth
        };
        break;

      case 'week':
        const randomWeek = generateRandomWeek();
        await element.evaluate((el, week) => {
          el.value = week;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, randomWeek);
        interactionResult = {
          action: 'setValue',
          value: randomWeek
        };
        break;

      case 'email':
        const testEmail = 'test@example.com';
        await element.click({ clickCount: 3 });
        await randomDelay(100, 200);
        await element.type(testEmail, { delay: 50 + Math.random() * 50 });
        interactionResult = {
          action: 'type',
          value: testEmail
        };
        break;

      case 'tel':
        const testPhone = '+1-555-123-4567';
        await element.click({ clickCount: 3 });
        await randomDelay(100, 200);
        await element.type(testPhone, { delay: 50 + Math.random() * 50 });
        interactionResult = {
          action: 'type',
          value: testPhone
        };
        break;

      case 'url':
        const testUrl = 'https://example.com';
        await element.click({ clickCount: 3 });
        await randomDelay(100, 200);
        await element.type(testUrl, { delay: 50 + Math.random() * 50 });
        interactionResult = {
          action: 'type',
          value: testUrl
        };
        break;

      case 'number':
        const randomNumber = Math.floor(Math.random() * 1000).toString();
        await element.click({ clickCount: 3 });
        await randomDelay(100, 200);
        await element.type(randomNumber, { delay: 50 + Math.random() * 50 });
        interactionResult = {
          action: 'type',
          value: randomNumber
        };
        break;

      default:
        // Text-based inputs
        await element.click({ clickCount: 3 }); // Select all existing text
        await randomDelay(100, 200);
        await element.type(testInput, { delay: 50 + Math.random() * 50 });
        interactionResult = {
          action: 'type',
          value: testInput
        };
        break;
    }

    // Try to submit or trigger events
    await triggerSubmissionEvents(page, element);

    return {
      success: true,
      elementInfo,
      interactionResult,
      duration: Date.now() - startTime
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      elementInfo,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Find an element on the page using the stored element info
 */
async function findElementOnPage(page, elementInfo) {
  try {
    // Try multiple strategies to find the element
    const strategies = [
      () => elementInfo.id ? page.$(`#${elementInfo.id}`) : null,
      () => elementInfo.name ? page.$(`[name="${elementInfo.name}"]`) : null,
      () => page.$(`${elementInfo.tagName}[type="${elementInfo.type}"]`),
      () => page.$(`${elementInfo.selector}:nth-of-type(${elementInfo.index + 1})`)
    ];

    for (const strategy of strategies) {
      const element = await strategy();
      if (element) return element;
    }

    return null;
  } catch (error) {
    console.warn('Element finding failed:', error.message);
    return null;
  }
}

/**
 * Trigger submission events (form submit, enter key, etc.)
 * Enhanced to ensure forms are always submitted with data
 */
async function triggerSubmissionEvents(page, element) {
  try {
    // Try to find and submit parent form
    const form = await element.evaluateHandle(el => el.closest('form'));
    if (form) {
      // Fill any remaining empty required fields in the form
      await fillRemainingFormFields(page, form);
      
      // Look for submit button with various selectors
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Submit")',
        'button:contains("Send")',
        'button:contains("Search")',
        'button:contains("Go")',
        'input[value*="Submit" i]',
        'input[value*="Send" i]',
        'input[value*="Search" i]',
        '[role="button"][aria-label*="submit" i]'
      ];

      for (const selector of submitSelectors) {
        try {
          const submitButton = await form.$(selector);
          if (submitButton) {
            await randomDelay(300, 700);
            await submitButton.click();
            console.log(`✅ Form submitted via ${selector}`);
            return { submitted: true, method: selector };
          }
        } catch (e) {
          // Try next selector
        }
      }

      // If no submit button found, try form.submit()
      await form.evaluate(f => {
        if (f.submit) f.submit();
      });
      console.log('✅ Form submitted via form.submit()');
      return { submitted: true, method: 'form.submit()' };
    }

    // Try pressing Enter key as fallback
    await randomDelay(200, 500);
    await element.press('Enter');
    console.log('✅ Attempted submission via Enter key');
    return { submitted: true, method: 'Enter key' };
    
  } catch (error) {
    console.warn('Submission event failed:', error.message);
    return { submitted: false, error: error.message };
  }
}

/**
 * Fill any remaining empty required fields in a form
 */
async function fillRemainingFormFields(page, form) {
  try {
    const emptyFields = await form.$$('input:required:not([type="submit"]):not([type="button"]):not([type="hidden"]), select:required, textarea:required');
    
    for (const field of emptyFields) {
      const value = await field.evaluate(el => el.value);
      if (!value || value.trim() === '') {
        const type = await field.evaluate(el => el.type || el.tagName.toLowerCase());
        await fillFieldByType(field, type);
      }
    }
  } catch (error) {
    console.warn('Failed to fill remaining form fields:', error.message);
  }
}

/**
 * Fill a field based on its type
 */
async function fillFieldByType(field, type) {
  try {
    switch (type.toLowerCase()) {
      case 'email':
        await field.type('test@example.com');
        break;
      case 'password':
        await field.type('TestPassword123!');
        break;
      case 'tel':
        await field.type('+1-555-123-4567');
        break;
      case 'url':
        await field.type('https://example.com');
        break;
      case 'number':
        await field.type('123');
        break;
      case 'date':
        await field.evaluate(el => el.value = generateRandomDate());
        break;
      case 'time':
        await field.evaluate(el => el.value = generateRandomTime());
        break;
      case 'select':
        const options = await field.$$('option:not([disabled])');
        if (options.length > 0) {
          const randomOption = options[Math.floor(Math.random() * options.length)];
          const value = await randomOption.evaluate(opt => opt.value);
          await field.select(value);
        }
        break;
      default:
        await field.type('test input');
        break;
    }
  } catch (error) {
    console.warn(`Failed to fill field of type ${type}:`, error.message);
  }
}

/**
 * Log interaction to file
 */
async function logInteractionToFile(logFile, logEntry) {
  try {
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.promises.appendFile(logFile, logLine);
  } catch (error) {
    console.warn('Failed to log interaction:', error.message);
  }
}

/**
 * Generate random date in YYYY-MM-DD format
 */
function generateRandomDate() {
  const start = new Date(2020, 0, 1);
  const end = new Date(2025, 11, 31);
  const randomDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return randomDate.toISOString().split('T')[0];
}

/**
 * Generate random datetime in YYYY-MM-DDTHH:MM format
 */
function generateRandomDateTime() {
  const start = new Date(2020, 0, 1);
  const end = new Date(2025, 11, 31);
  const randomDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return randomDate.toISOString().slice(0, 16);
}

/**
 * Generate random time in HH:MM format
 */
function generateRandomTime() {
  const hours = Math.floor(Math.random() * 24).toString().padStart(2, '0');
  const minutes = Math.floor(Math.random() * 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Generate random month in YYYY-MM format
 */
function generateRandomMonth() {
  const year = 2020 + Math.floor(Math.random() * 6);
  const month = (1 + Math.floor(Math.random() * 12)).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Generate random week in YYYY-W## format
 */
function generateRandomWeek() {
  const year = 2020 + Math.floor(Math.random() * 6);
  const week = (1 + Math.floor(Math.random() * 52)).toString().padStart(2, '0');
  return `${year}-W${week}`;
}

module.exports = {
  enhancedInputInteraction,
  findAllInputElements,
  createFreshTab,
  performSingleInteraction,
  generateRandomDate,
  generateRandomDateTime,
  generateRandomTime,
  generateRandomMonth,
  generateRandomWeek
};
