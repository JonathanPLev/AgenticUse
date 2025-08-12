// enhanced_input_interaction_iframe.js
// Enhanced input interaction with iframe support for chatbot detection

const { genericChatbotDetection } = require('./static_data_structs.cjs');

/**
 * Enhanced chatbot detection that searches in all frames including iframes
 */
async function detectChatbotsInAllFrames(page) {
  const chatbots = [];
  
  try {
    // Get all frames (main frame + all iframes)
    const frames = page.frames();
    
    for (const frame of frames) {
      try {
        // Check each frame for chatbot indicators
        const frameUrl = frame.url();
        const frameChatbots = await frame.evaluate((detection, frameUrl) => {
          const found = [];
          
          // Check network patterns in frame URL
          const urlMatches = detection.networkPatterns.some(pattern => 
            pattern.test(frameUrl)
          );
          if (urlMatches) {
            found.push({
              type: 'network_pattern',
              frame: frameUrl,
              location: 'frame_url'
            });
          }
          
          // Check DOM patterns in frame
          detection.domPatterns.forEach(pattern => {
            const elements = Array.from(document.querySelectorAll('*')).filter(el => {
              return pattern.test(el.className) || 
                     pattern.test(el.id) || 
                     pattern.test(el.getAttribute('data-testid') || '') ||
                     pattern.test(el.getAttribute('aria-label') || '');
            });
            
            elements.forEach(el => {
              found.push({
                type: 'dom_pattern',
                frame: frameUrl,
                element: el.tagName.toLowerCase(),
                selector: el.id ? `#${el.id}` : `.${el.className}`,
                location: 'frame_dom'
              });
            });
          });
          
          // Check text patterns in frame
          const bodyText = document.body ? document.body.innerText : '';
          detection.textPatterns.forEach(pattern => {
            if (pattern.test(bodyText)) {
              found.push({
                type: 'text_pattern',
                frame: frameUrl,
                text: bodyText.substring(0, 100) + '...',
                location: 'frame_text'
              });
            }
          });
          
          return found;
        }, genericChatbotDetection, frameUrl);
        
        chatbots.push(...frameChatbots);
        
      } catch (error) {
        console.warn(`Error checking frame ${frame.url()}:`, error.message);
      }
    }
    
  } catch (error) {
    console.warn('Error detecting chatbots in frames:', error.message);
  }
  
  return chatbots;
}

/**
 * Enhanced input interaction with better chatbot questions and iframe support
 */
async function performEnhancedInputInteraction(page, options = {}) {
  const {
    betterQuestions = [
      "How can I find information about your products?",
      "How can I contact customer support?", 
      "What services do you offer?",
      "How can I get help with my account?",
      "Where can I find pricing information?",
      "How do I speak with a representative?",
      "What are your business hours?",
      "How can I track my order?"
    ],
    maxInteractions = 10,
    interactionTimeout = 15000
  } = options;
  
  const results = {
    chatbotsFound: [],
    interactionsPerformed: [],
    errors: []
  };
  
  try {
    // Detect chatbots in all frames including iframes
    console.log('🔍 Detecting chatbots in all frames (including iframes)...');
    results.chatbotsFound = await detectChatbotsInAllFrames(page);
    
    if (results.chatbotsFound.length > 0) {
      console.log(`✅ Found ${results.chatbotsFound.length} chatbot indicators across all frames`);
      
      // Try to interact with detected chatbots
      for (const chatbot of results.chatbotsFound.slice(0, maxInteractions)) {
        try {
          const question = betterQuestions[Math.floor(Math.random() * betterQuestions.length)];
          
          // Find the frame containing this chatbot
          const targetFrame = page.frames().find(frame => frame.url() === chatbot.frame);
          if (!targetFrame) continue;
          
          // Try to find and interact with input elements in the chatbot frame
          const interactionResult = await targetFrame.evaluate((selector, question) => {
            const inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
            for (const input of inputs) {
              try {
                input.focus();
                input.value = question;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Try to find and click submit button
                const submitBtn = input.closest('form')?.querySelector('button[type="submit"], input[type="submit"]') ||
                                 input.parentElement?.querySelector('button') ||
                                 document.querySelector('[aria-label*="send" i], [data-testid*="send" i]');
                
                if (submitBtn) {
                  submitBtn.click();
                  return { success: true, question, element: input.tagName };
                }
                
                return { success: true, question, element: input.tagName, note: 'no_submit_button' };
              } catch (error) {
                return { success: false, error: error.message };
              }
            }
            return { success: false, error: 'no_input_found' };
          }, chatbot.selector, question);
          
          results.interactionsPerformed.push({
            chatbot,
            question,
            result: interactionResult,
            timestamp: Date.now()
          });
          
          // Wait between interactions
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          results.errors.push({
            chatbot,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    } else {
      console.log('ℹ️  No chatbots detected in any frame');
    }
    
  } catch (error) {
    console.error('❌ Enhanced input interaction failed:', error.message);
    results.errors.push({ error: error.message, timestamp: Date.now() });
  }
  
  return results;
}

/**
 * Capture dynamic iframes that load after initial page load
 */
async function setupDynamicIframeCapture(page, callback) {
  // Listen for new frames being added
  page.on('frameattached', async (frame) => {
    try {
      console.log(`🆕 New iframe detected: ${frame.url()}`);
      
      // Wait for frame to load
      await frame.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      
      // Check if this frame contains chatbot indicators
      const chatbots = await frame.evaluate((detection) => {
        const found = [];
        
        // Check DOM patterns
        detection.domPatterns.forEach(pattern => {
          const elements = Array.from(document.querySelectorAll('*')).filter(el => {
            return pattern.test(el.className) || pattern.test(el.id);
          });
          
          elements.forEach(el => {
            found.push({
              type: 'dom_pattern',
              element: el.tagName.toLowerCase(),
              selector: el.id ? `#${el.id}` : `.${el.className}`
            });
          });
        });
        
        return found;
      }, genericChatbotDetection);
      
      if (chatbots.length > 0 && callback) {
        callback(frame, chatbots);
      }
      
    } catch (error) {
      console.warn(`Error processing new iframe ${frame.url()}:`, error.message);
    }
  });
  
  // Listen for frame navigation (iframe content changes)
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) return; // Skip main frame
    
    try {
      console.log(`🔄 Iframe navigated: ${frame.url()}`);
      
      // Re-check this frame for chatbot indicators after navigation
      const chatbots = await detectChatbotsInAllFrames(page);
      if (chatbots.length > 0 && callback) {
        callback(frame, chatbots);
      }
      
    } catch (error) {
      console.warn(`Error processing iframe navigation ${frame.url()}:`, error.message);
    }
  });
}

module.exports = {
  detectChatbotsInAllFrames,
  performEnhancedInputInteraction,
  setupDynamicIframeCapture
};
