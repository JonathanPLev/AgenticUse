// enhanced_instrumentation_fixed.js
// Robust instrumentation that handles dynamic iframes, detached frames, comprehensive data capture,
// and proper function name recording in debug logs

const { DataQueue } = require('./helpers');

/**
 * Enhanced page instrumentation with robust iframe handling and comprehensive data capture
 * FIXED: Proper function name recording and about:blank frame handling
 */
async function enhancedInstrumentPage(page, queues) {
  const {
    networkQueue,
    responseQueue,
    consoleQueue,
    debugQueue,
    domQueue,
    interactionQueue,
  } = queues;

  // Track all frames and their states
  const frameTracker = new Map();
  const processedFrames = new Set();

  // Enhanced CDP session with comprehensive event handling and retry logic
  let client;
  let cdpRetries = 3;
  
  while (cdpRetries > 0) {
    try {
      // Wait for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const target = page.target();
      if (!target) {
        throw new Error('No page target available for enhanced instrumentation');
      }
      
      // Wait for target to be properly initialized
      let targetReady = false;
      for (let i = 0; i < 10; i++) {
        if (target.url() && target.url() !== 'about:blank') {
          targetReady = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`Target URL: ${target.url()}, ready: ${targetReady}`);
      
      client = await target.createCDPSession();
      break;
    } catch (cdpError) {
      cdpRetries--;
      console.warn(`⚠️  Enhanced CDP session creation failed (${3 - cdpRetries}/3): ${cdpError.message}`);
      
      if (cdpRetries === 0) {
        throw new Error(`Failed to create enhanced CDP session: ${cdpError.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Enable all necessary domains with individual error handling
  const domains = [
    'Network.enable',
    'Page.enable',
    'DOM.enable',
    'Runtime.enable',
    'Debugger.enable'
  ];
  
  for (const domain of domains) {
    try {
      await client.send(domain);
      console.log(`✅ ${domain} enabled successfully`);
    } catch (err) {
      console.warn(`⚠️  Failed to enable ${domain} in enhanced instrumentation: ${err.message}`);
      // Continue with other domains even if one fails
    }
  }

  // FIXED: Enhanced debugger configuration for proper function name recording
  try {
    // Enable async stack traces for better function name capture
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 10 });
    
    // Set up breakpoint resolver for function names
    await client.send('Debugger.setPauseOnExceptions', { state: 'none' });
    
    // Enable runtime call frame inspection
    await client.send('Runtime.enable');
    await client.send('Runtime.setAsyncCallStackDepth', { maxDepth: 10 });
    
    console.log('✅ Enhanced debugger configuration applied for function name recording');
  } catch (debuggerError) {
    console.warn(`⚠️  Enhanced debugger configuration failed: ${debuggerError.message}`);
  }

  // Enhanced frame tracking - handle dynamic frame creation/destruction
  // Add CDP session error handling
  client.on('sessionattached', () => {
    console.log('📡 CDP session attached successfully');
  });
  
  client.on('sessiondetached', () => {
    console.warn('📡 CDP session detached');
  });
  
  // FIXED: Reduce frame logging noise and filter out about:blank frames
  let frameEventCount = 0;
  const MAX_FRAME_LOGS = 3; // Reduced from 5
  
  client.on('Page.frameAttached', async (params) => {
    try {
      const { frameId, parentFrameId } = params;
      frameTracker.set(frameId, {
        id: frameId,
        parentId: parentFrameId,
        attached: true,
        url: null,
        processed: false,
        createdAt: Date.now()
      });
      
      // Only log significant frame events, not about:blank
      if (frameEventCount < MAX_FRAME_LOGS) {
        console.log(`📎 Frame attached: ${frameId}`);
        frameEventCount++;
      }
    } catch (error) {
      console.warn(`⚠️  Error handling frame attach: ${error.message}`);
    }
  });

  client.on('Page.frameDetached', async (params) => {
    try {
      const { frameId } = params;
      const frameInfo = frameTracker.get(frameId);
      
      if (frameInfo) {
        frameInfo.attached = false;
        frameInfo.detachedAt = Date.now();
      }
      
      // Only log to domQueue if it's not an about:blank frame
      if (frameInfo && frameInfo.url && frameInfo.url !== 'about:blank') {
        domQueue?.enqueue?.({
          event: 'frameDetached',
          frameId,
          frameInfo,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame detach: ${error.message}`);
    }
  });

  client.on('Page.frameNavigated', async (params) => {
    try {
      const { frame } = params;
      const { id: frameId, url: frameUrl } = frame;
      
      // Update frame tracker
      const frameInfo = frameTracker.get(frameId) || {};
      frameInfo.url = frameUrl;
      frameInfo.navigatedAt = Date.now();
      frameTracker.set(frameId, frameInfo);
      
      // FIXED: Only log meaningful frame navigations, skip about:blank
      if (frameUrl && frameUrl !== 'about:blank' && !frameUrl.startsWith('data:')) {
        console.log(`🧭 Frame navigated: ${frameId} -> ${frameUrl}`);
        
        domQueue?.enqueue?.({
          event: 'frameNavigated',
          frameId,
          url: frameUrl,
          timestamp: Date.now()
        });
        
        // Process frame content after navigation
        setTimeout(async () => {
          try {
            await processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue);
          } catch (error) {
            console.warn(`⚠️  Error processing navigated frame: ${error.message}`);
          }
        }, 1000);
      }
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame navigation: ${error.message}`);
    }
  });

  // FIXED: Enhanced debugger event handling with proper function name capture
  client.on('Debugger.paused', async (params) => {
    try {
      const { callFrames, reason, data } = params;
      
      // Enhanced call frame processing with function name extraction
      const enhancedCallFrames = callFrames.map(frame => {
        let functionName = frame.functionName || '';
        
        // Try to extract function name from various sources
        if (!functionName || functionName === '') {
          // Try to get from script location
          if (frame.location && frame.location.scriptId) {
            try {
              // Extract from script source if available
              const scriptSource = frame.scriptSource || '';
              const lineNumber = frame.location.lineNumber || 0;
              
              // Simple regex to extract function name from source
              const functionMatch = scriptSource.split('\n')[lineNumber]?.match(/function\s+(\w+)/);
              if (functionMatch) {
                functionName = functionMatch[1];
              }
            } catch (e) {
              // Ignore extraction errors
            }
          }
          
          // Fallback to URL-based naming
          if (!functionName && frame.url) {
            const urlParts = frame.url.split('/');
            const fileName = urlParts[urlParts.length - 1] || 'unknown';
            functionName = `${fileName}:${frame.location?.lineNumber || 0}`;
          }
        }
        
        return {
          ...frame,
          functionName: functionName || 'anonymous',
          enhancedFunctionName: functionName || `line_${frame.location?.lineNumber || 0}`
        };
      });
      
      debugQueue?.enqueue?.({
        event: 'paused',
        details: {
          callFrames: enhancedCallFrames,
          reason,
          data,
          timestamp: Date.now()
        }
      });
      
      // Resume execution immediately - we just want to capture the stack
      await client.send('Debugger.resume');
      
    } catch (error) {
      console.warn(`⚠️  Error handling debugger pause: ${error.message}`);
      // Always try to resume to prevent hanging
      try {
        await client.send('Debugger.resume');
      } catch (resumeError) {
        console.warn(`⚠️  Error resuming debugger: ${resumeError.message}`);
      }
    }
  });

  // Network event handling
  client.on('Network.requestWillBeSent', (params) => {
    try {
      networkQueue?.enqueue?.({
        event: 'requestWillBeSent',
        ...params,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network request: ${error.message}`);
    }
  });

  client.on('Network.responseReceived', (params) => {
    try {
      responseQueue?.enqueue?.({
        event: 'responseReceived',
        ...params,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network response: ${error.message}`);
    }
  });

  // Console event handling
  client.on('Runtime.consoleAPICalled', (params) => {
    try {
      consoleQueue?.enqueue?.({
        event: 'consoleAPICalled',
        ...params,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling console event: ${error.message}`);
    }
  });

  // Page error handling
  page.on('pageerror', (error) => {
    try {
      console.warn(`⚠️  Page error: ${error.message}`);
      console.warn(`Page error on ${page.url()}: ${error.message}`);
      
      consoleQueue?.enqueue?.({
        event: 'pageError',
        message: error.message,
        stack: error.stack,
        url: page.url(),
        timestamp: Date.now()
      });
    } catch (logError) {
      console.warn(`⚠️  Error logging page error: ${logError.message}`);
    }
  });

  // Set up periodic frame processing
  const frameProcessingInterval = setInterval(async () => {
    try {
      await processAllFrames(page, client, domQueue, interactionQueue, frameTracker, processedFrames);
    } catch (error) {
      console.warn(`⚠️  Error in periodic frame processing: ${error.message}`);
    }
  }, 10000); // Every 10 seconds

  // Cleanup function
  const cleanup = () => {
    try {
      clearInterval(frameProcessingInterval);
      frameTracker.clear();
      processedFrames.clear();
    } catch (error) {
      console.warn(`⚠️  Error during instrumentation cleanup: ${error.message}`);
    }
  };

  return {
    client,
    cleanup: cleanup,
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames
  };
}

/**
 * Process content of a specific frame with robust error handling
 * FIXED: Better filtering of about:blank and empty frames
 */
async function processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue) {
  try {
    // FIXED: Skip about:blank, data URLs, and other non-content frames
    if (!frameUrl || 
        frameUrl === 'about:blank' || 
        frameUrl.startsWith('data:') || 
        frameUrl.startsWith('blob:') ||
        frameUrl === '') {
      return;
    }

    // Get frame DOM with error handling
    try {
      const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
      const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
      
      // Only log frames with meaningful content
      if (outerHTML && outerHTML.length > 100) { // At least 100 characters
        domQueue?.enqueue?.({
          event: 'frameContent',
          frameId,
          url: frameUrl,
          html: outerHTML,
          timestamp: Date.now(),
          contentLength: outerHTML.length
        });

        // Analyze frame for chatbot/interaction elements
        const chatbotIndicators = analyzeChatbotContent(outerHTML, frameUrl);
        if (chatbotIndicators.length > 0) {
          interactionQueue?.enqueue?.({
            event: 'chatbotDetectedInFrame',
            frameId,
            url: frameUrl,
            indicators: chatbotIndicators,
            timestamp: Date.now()
          });
        }
      }

    } catch (domError) {
      console.warn(`⚠️  Error getting DOM for frame ${frameId}: ${domError.message}`);
    }

  } catch (error) {
    console.warn(`⚠️  Error processing frame content ${frameId}: ${error.message}`);
  }
}

/**
 * Process all frames periodically to catch dynamic content
 * FIXED: Better frame filtering and processing
 */
async function processAllFrames(page, client, domQueue, interactionQueue, frameTracker, processedFrames) {
  try {
    const frames = page.frames();
    
    for (const frame of frames) {
      try {
        const frameId = frame._id;
        const frameUrl = frame.url();
        
        // FIXED: Skip if already processed recently or if it's a non-content frame
        if (processedFrames.has(frameId) || 
            !frameUrl || 
            frameUrl === 'about:blank' || 
            frameUrl.startsWith('data:') ||
            frameUrl.startsWith('blob:') ||
            frameUrl === '') {
          continue;
        }
        
        // Check if frame is still attached
        const frameInfo = frameTracker.get(frameId);
        if (frameInfo && !frameInfo.attached) {
          continue;
        }
        
        await processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue);
        processedFrames.add(frameId);
        
        // Remove from processed set after some time to allow re-processing of dynamic content
        setTimeout(() => {
          processedFrames.delete(frameId);
        }, 30000);
        
      } catch (frameError) {
        // Handle detached frame errors gracefully
        if (frameError.message.includes('detached')) {
          console.log(`📎 Skipping detached frame: ${frame.url()}`);
          continue;
        }
        console.warn(`⚠️  Error processing frame ${frame.url()}: ${frameError.message}`);
      }
    }
    
  } catch (error) {
    console.warn(`⚠️  Error in processAllFrames: ${error.message}`);
  }
}

/**
 * Analyze HTML content for chatbot indicators
 */
function analyzeChatbotContent(html, url) {
  const indicators = [];
  
  const chatbotPatterns = [
    /chat/gi, /widget/gi, /support/gi, /help/gi, /bot/gi, /assistant/gi,
    /intercom/gi, /zendesk/gi, /drift/gi, /crisp/gi, /freshchat/gi, /olark/gi,
    /livechat/gi, /tidio/gi, /hubspot/gi, /messenger/gi, /chatlio/gi
  ];
  
  chatbotPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      indicators.push({
        pattern: pattern.source,
        matches: matches.length,
        type: 'html_content'
      });
    }
  });
  
  // Check URL patterns
  chatbotPatterns.forEach(pattern => {
    if (pattern.test(url)) {
      indicators.push({
        pattern: pattern.source,
        matches: 1,
        type: 'frame_url'
      });
    }
  });
  
  return indicators;
}

module.exports = {
  enhancedInstrumentPage,
  processFrameContent,
  processAllFrames,
  analyzeChatbotContent
};
