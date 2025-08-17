// enhanced_instrumentation.js
// Robust instrumentation that handles dynamic iframes, detached frames, and comprehensive data capture

const { DataQueue } = require('./helpers');

/**
 * Enhanced page instrumentation with robust iframe handling and comprehensive data capture
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
      
      console.log(`Enhanced instrumentation target URL: ${target.url()}, ready: ${targetReady}`);
      
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
    'Runtime.enable',
    'DOM.enable',
    'Debugger.enable'
    // Removed 'Target.enable' - deprecated in newer Chrome versions
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

  // Enhanced frame tracking - handle dynamic frame creation/destruction
  // Add CDP session error handling
  client.on('sessionattached', () => {
    console.log('📡 CDP session attached successfully');
  });
  
  client.on('sessiondetached', () => {
    console.warn('📡 CDP session detached');
  });
  
  // Reduce frame logging noise - only log significant frame events
  let frameEventCount = 0;
  const MAX_FRAME_LOGS = 5;
  
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
      
      domQueue?.enqueue?.({
        event: 'frameAttached',
        frameId,
        parentFrameId,
        timestamp: Date.now()
      });
      
      // Only log first few frame events to reduce noise
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
      
      domQueue?.enqueue?.({
        event: 'frameDetached',
        frameId,
        frameInfo,
        timestamp: Date.now()
      });
      
      // Only log first few frame events to reduce noise
      if (frameEventCount < MAX_FRAME_LOGS) {
        console.log(`📎 Frame detached: ${frameId}`);
        frameEventCount++;
      }
      
      // Clean up after a delay to allow for final processing
      setTimeout(() => {
        frameTracker.delete(frameId);
        processedFrames.delete(frameId);
      }, 5000);
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame detach: ${error.message}`);
    }
  });

  client.on('Page.frameNavigated', async (params) => {
    try {
      const { frame } = params;
      const frameInfo = frameTracker.get(frame.id);
      
      if (frameInfo) {
        frameInfo.url = frame.url;
        frameInfo.navigatedAt = Date.now();
      }
      
      domQueue?.enqueue?.({
        event: 'frameNavigated',
        frameId: frame.id,
        url: frame.url,
        timestamp: Date.now()
      });
      
      // Only log main frame navigation and first few iframe navigations
      if (frame.url && !frame.url.includes('about:blank') && frameEventCount < MAX_FRAME_LOGS) {
        console.log(`🧭 Frame navigated: ${frame.id} -> ${frame.url}`);
        frameEventCount++;
      }
      
      // Process new iframe content with error handling
      await processFrameContent(client, frame.id, frame.url, domQueue, interactionQueue);
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame navigation: ${error.message}`);
    }
  });

  // Enhanced network request tracking with frame context
  client.on('Network.requestWillBeSent', async (params) => {
    try {
      let postData = params.request.postData || null;
      
      // Try to get post data if available
      try {
        const req = await client.send('Network.getRequestPostData', { requestId: params.requestId });
        if (req.postData) postData = req.postData;
      } catch {}
      
      const frameInfo = frameTracker.get(params.frameId);
      
      const requestData = {
        event: 'requestWillBeSent',
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers,
        postData,
        timestamp: Date.now(),
        frameId: params.frameId,
        frameUrl: frameInfo?.url || 'unknown',
        frameAttached: frameInfo?.attached || false,
        type: params.type,
        initiator: params.initiator,
        resourceType: params.type,
        // Enhanced categorization
        isIframeRequest: frameInfo && frameInfo.parentId !== undefined,
        isDynamicContent: /ajax|fetch|xhr|api|json|graphql/i.test(params.request.url),
        isPotentialChatbot: /chat|widget|support|bot|intercom|zendesk|drift/i.test(params.request.url)
      };
      
      networkQueue?.enqueue?.(requestData);
      
      // Log potential interaction-related requests
      if (requestData.isDynamicContent || requestData.isPotentialChatbot || params.request.method !== 'GET') {
        interactionQueue?.enqueue?.({
          ...requestData,
          event: 'potentialInteractionRequest',
          detectionReason: requestData.isPotentialChatbot ? 'chatbot pattern' : 
                          requestData.isDynamicContent ? 'dynamic content' : 'non-GET method'
        });
      }
      
    } catch (error) {
      console.warn(`⚠️  Error processing network request: ${error.message}`);
    }
  });

  // Enhanced response handling
  client.on('Network.responseReceived', async (params) => {
    try {
      const { response, requestId } = params;
      let bodyPreview, bodyPreviewTruncated;

      // Try to get response body with error handling
      try {
        const bodyObj = await client.send('Network.getResponseBody', { requestId });
        if (bodyObj) {
          const raw = bodyObj.base64Encoded
            ? Buffer.from(bodyObj.body, 'base64')
            : Buffer.from(bodyObj.body, 'utf8');
          const cap = 1_000_000; // 1 MB
          bodyPreview = raw.subarray(0, Math.min(raw.length, cap)).toString('utf8');
          bodyPreviewTruncated = raw.length > cap || undefined;
        }
      } catch {}

      const frameInfo = frameTracker.get(params.frameId);

      responseQueue?.enqueue?.({
        event: 'responseReceived',
        requestId,
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        mimeType: response.mimeType,
        timestamp: Date.now(),
        frameId: params.frameId,
        frameUrl: frameInfo?.url || 'unknown',
        frameAttached: frameInfo?.attached || false,
        bodyPreview,
        bodyPreviewTruncated,
        // Enhanced categorization
        isIframeResponse: frameInfo && frameInfo.parentId !== undefined,
        containsChatbotData: bodyPreview && /chat|widget|support|bot|message/i.test(bodyPreview)
      });

    } catch (error) {
      console.warn(`⚠️  Error processing network response: ${error.message}`);
    }
  });

  // Enhanced console logging with frame context
  page.on('console', msg => {
    try {
      const frame = msg.location()?.url || 'unknown';
      consoleQueue?.enqueue?.({
        event: 'console',
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        frameUrl: frame,
        timestamp: Date.now(),
        // Enhanced categorization
        isError: msg.type() === 'error',
        isChatbotRelated: /chat|widget|support|bot|intercom|zendesk|drift/i.test(msg.text())
      });
    } catch (error) {
      console.warn(`⚠️  Error processing console message: ${error.message}`);
    }
  });

  // Enhanced error handling
  page.on('pageerror', error => {
    try {
      consoleQueue?.enqueue?.({
        event: 'pageerror',
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
    } catch {}
  });

  // Periodic frame processing to catch any missed dynamic content
  const frameProcessingInterval = setInterval(async () => {
    try {
      await processAllFrames(page, client, domQueue, interactionQueue, frameTracker, processedFrames);
    } catch (error) {
      console.warn(`⚠️  Error in periodic frame processing: ${error.message}`);
    }
  }, 5000);

  // Return cleanup function
  return {
    client,
    cleanup: () => {
      clearInterval(frameProcessingInterval);
      frameTracker.clear();
      processedFrames.clear();
    },
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames
  };
}

/**
 * Process content of a specific frame with robust error handling
 */
async function processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue) {
  try {
    // Skip about:blank and other non-content frames
    if (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:')) {
      return;
    }

    // Get frame DOM with error handling
    try {
      const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
      const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
      
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

    } catch (domError) {
      console.warn(`⚠️  Error getting DOM for frame ${frameId}: ${domError.message}`);
    }

  } catch (error) {
    console.warn(`⚠️  Error processing frame content ${frameId}: ${error.message}`);
  }
}

/**
 * Process all frames periodically to catch dynamic content
 */
async function processAllFrames(page, client, domQueue, interactionQueue, frameTracker, processedFrames) {
  try {
    const frames = page.frames();
    
    for (const frame of frames) {
      try {
        const frameId = frame._id;
        const frameUrl = frame.url();
        
        // Skip if already processed recently or if it's a non-content frame
        if (processedFrames.has(frameId) || !frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:')) {
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
