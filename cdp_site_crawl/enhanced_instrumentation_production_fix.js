// enhanced_instrumentation_production_fix.js
// PRODUCTION FIX: Enhanced instrumentation with proper dynamic content capture and reduced noise

const { DataQueue } = require('./helpers');

/**
 * PRODUCTION FIX: Enhanced page instrumentation with proper dynamic content detection
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
  let networkRequestCount = 0;
  let dynamicContentDetected = false;

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

  // PRODUCTION FIX: Enhanced debugger configuration for proper function name recording
  try {
    // Enable async stack traces for better function name capture
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
    
    // Enable breakpoints on all scripts for function name capture
    await client.send('Debugger.setBreakpointsActive', { active: true });
    
    // Set pause on exceptions to capture more stack traces
    await client.send('Debugger.setPauseOnExceptions', { state: 'uncaught' });
    
    // Enable runtime call frame inspection with enhanced settings
    await client.send('Runtime.enable');
    await client.send('Runtime.setAsyncCallStackDepth', { maxDepth: 32 });
    
    // CRITICAL: Enable script parsing to get function names
    await client.send('Debugger.setSkipAllPauses', { skip: false });
    
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
  
  // PRODUCTION FIX: Smart iframe logging - only log meaningful iframes
  let frameEventCount = 0;
  const MAX_FRAME_LOGS = 3;
  const meaningfulDomains = new Set();
  
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
      
      // Only log meaningful frame detachments
      if (frameInfo && frameInfo.url && frameInfo.url !== 'about:blank' && !frameInfo.url.startsWith('data:')) {
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
      
      // PRODUCTION FIX: Smart iframe detection - filter out tracking/ad iframes
      const isTrackingIframe = frameUrl && (
        frameUrl.includes('doubleclick.net') ||
        frameUrl.includes('googleadservices.com') ||
        frameUrl.includes('googlesyndication.com') ||
        frameUrl.includes('googletagmanager.com') ||
        frameUrl.includes('facebook.com/tr') ||
        frameUrl.includes('analytics') ||
        frameUrl.includes('tracking') ||
        frameUrl.includes('ads') ||
        frameUrl.includes('pixel')
      );
      
      // PRODUCTION FIX: Detect meaningful dynamic content
      const isMeaningfulIframe = frameUrl && 
        frameUrl !== 'about:blank' && 
        !frameUrl.startsWith('data:') && 
        !isTrackingIframe &&
        frameUrl.length > 20; // Meaningful URLs are usually longer
      
      if (isMeaningfulIframe) {
        // Extract domain for logging
        try {
          const urlObj = new URL(frameUrl);
          meaningfulDomains.add(urlObj.hostname);
          
          console.log(`🆕 New iframe detected: ${urlObj.hostname}`);
          dynamicContentDetected = true;
          
          domQueue?.enqueue?.({
            event: 'frameNavigated',
            frameId,
            url: frameUrl,
            domain: urlObj.hostname,
            isTracking: false,
            timestamp: Date.now()
          });
          
          // Process frame content after navigation with delay to avoid detached frame errors
          setTimeout(async () => {
            try {
              // Check if frame is still attached before processing
              const currentFrameInfo = frameTracker.get(frameId);
              if (currentFrameInfo && currentFrameInfo.attached) {
                await processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue);
              }
            } catch (error) {
              console.warn(`⚠️  Error processing navigated frame: ${error.message}`);
            }
          }, 2000);
        } catch (urlError) {
          // Invalid URL, skip
        }
      } else if (isTrackingIframe) {
        // Log tracking iframes separately with reduced verbosity
        domQueue?.enqueue?.({
          event: 'trackingIframe',
          frameId,
          url: frameUrl,
          isTracking: true,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame navigation: ${error.message}`);
    }
  });

  // PRODUCTION FIX: Enhanced network monitoring with dynamic content detection
  client.on('Network.requestWillBeSent', (params) => {
    try {
      networkRequestCount++;
      
      const { request, requestId, type } = params;
      const url = request.url;
      
      // Detect dynamic content requests
      const isDynamicRequest = type === 'XHR' || 
                              type === 'Fetch' || 
                              url.includes('api') ||
                              url.includes('ajax') ||
                              url.includes('json');
      
      if (isDynamicRequest) {
        dynamicContentDetected = true;
        console.log(`🔄 Dynamic request detected: ${type} to ${new URL(url).hostname}`);
      }
      
      networkQueue?.enqueue?.({
        event: 'requestWillBeSent',
        ...params,
        isDynamic: isDynamicRequest,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network request: ${error.message}`);
    }
  });

  client.on('Network.responseReceived', (params) => {
    try {
      const { response, requestId, type } = params;
      
      responseQueue?.enqueue?.({
        event: 'responseReceived',
        ...params,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network response: ${error.message}`);
    }
  });

  // PRODUCTION FIX: Enhanced debugger event handling with comprehensive function name capture
  client.on('Debugger.scriptParsed', async (params) => {
    try {
      const { scriptId, url, startLine, startColumn, endLine, endColumn } = params;
      
      // Store script information for function name resolution
      debugQueue?.enqueue?.({
        event: 'scriptParsed',
        scriptId,
        url,
        startLine,
        startColumn,
        endLine,
        endColumn,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling script parsed: ${error.message}`);
    }
  });

  client.on('Debugger.paused', async (params) => {
    try {
      const { callFrames, reason, data } = params;
      
      // PRODUCTION FIX: Enhanced call frame processing with comprehensive function name extraction
      const enhancedCallFrames = await Promise.all(callFrames.map(async (frame) => {
        let functionName = frame.functionName || '';
        
        // Try multiple methods to extract function name
        if (!functionName || functionName === '') {
          try {
            // Method 1: Get script source and extract function name
            if (frame.location && frame.location.scriptId) {
              try {
                const scriptSource = await client.send('Debugger.getScriptSource', { 
                  scriptId: frame.location.scriptId 
                });
                
                if (scriptSource && scriptSource.scriptSource) {
                  const lines = scriptSource.scriptSource.split('\n');
                  const lineNumber = frame.location.lineNumber || 0;
                  
                  // Look for function declarations around the line
                  for (let i = Math.max(0, lineNumber - 5); i <= Math.min(lines.length - 1, lineNumber + 2); i++) {
                    const line = lines[i] || '';
                    
                    // Various function patterns
                    const patterns = [
                      /function\s+(\w+)\s*\(/,
                      /(\w+)\s*:\s*function/,
                      /(\w+)\s*=\s*function/,
                      /(\w+)\s*=>\s*/,
                      /async\s+function\s+(\w+)/,
                      /(\w+)\s*\([^)]*\)\s*{/,
                      /class\s+(\w+)/,
                      /(\w+)\s*\([^)]*\)\s*=>/
                    ];
                    
                    for (const pattern of patterns) {
                      const match = line.match(pattern);
                      if (match && match[1]) {
                        functionName = match[1];
                        break;
                      }
                    }
                    
                    if (functionName) break;
                  }
                }
              } catch (scriptError) {
                // Ignore script source errors
              }
            }
            
            // Method 2: Fallback to URL-based naming
            if (!functionName && frame.url) {
              const urlParts = frame.url.split('/');
              const fileName = urlParts[urlParts.length - 1] || 'unknown';
              functionName = `${fileName}:${frame.location?.lineNumber || 0}:${frame.location?.columnNumber || 0}`;
            }
          } catch (extractError) {
            // Ignore extraction errors
          }
        }
        
        return {
          ...frame,
          functionName: functionName || 'anonymous',
          enhancedFunctionName: functionName || `line_${frame.location?.lineNumber || 0}_col_${frame.location?.columnNumber || 0}`,
          extractionMethod: functionName ? 'extracted' : 'fallback'
        };
      }));
      
      debugQueue?.enqueue?.({
        event: 'paused',
        details: {
          callFrames: enhancedCallFrames,
          reason,
          data,
          timestamp: Date.now(),
          functionNamesExtracted: enhancedCallFrames.filter(f => f.extractionMethod === 'extracted').length
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

  // PRODUCTION FIX: Enhanced periodic frame processing with dynamic content monitoring
  const frameProcessingInterval = setInterval(async () => {
    try {
      await processAllFrames(page, client, domQueue, interactionQueue, frameTracker, processedFrames);
      
      // Log dynamic content detection status
      if (dynamicContentDetected) {
        console.log(`📊 Dynamic content activity detected - Network requests: ${networkRequestCount}, Domains: ${meaningfulDomains.size}`);
      }
    } catch (error) {
      console.warn(`⚠️  Error in periodic frame processing: ${error.message}`);
    }
  }, 20000); // Increased interval to 20 seconds

  // Cleanup function
  const cleanup = () => {
    try {
      clearInterval(frameProcessingInterval);
      frameTracker.clear();
      processedFrames.clear();
      meaningfulDomains.clear();
    } catch (error) {
      console.warn(`⚠️  Error during instrumentation cleanup: ${error.message}`);
    }
  };

  return {
    client,
    cleanup: cleanup,
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames,
    getNetworkRequestCount: () => networkRequestCount,
    getDynamicContentStatus: () => dynamicContentDetected,
    getMeaningfulDomains: () => Array.from(meaningfulDomains)
  };
}

/**
 * PRODUCTION FIX: Process content with better error handling for detached frames
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

    // Get frame DOM with enhanced error handling for detached frames
    try {
      // First check if we can get the document
      const { root } = await client.send('DOM.getDocument', { depth: 1, pierce: false });
      
      if (root && root.nodeId) {
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
      }

    } catch (domError) {
      if (domError.message.includes('detached') || domError.message.includes('Could not find node')) {
        // Frame was detached, this is normal
        return;
      }
      console.warn(`⚠️  Error getting DOM for frame ${frameId}: ${domError.message}`);
    }

  } catch (error) {
    if (!error.message.includes('detached')) {
      console.warn(`⚠️  Error processing frame content ${frameId}: ${error.message}`);
    }
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
        
        // Check if frame is detached before processing
        if (frame.isDetached && frame.isDetached()) {
          continue;
        }
        
        await processFrameContent(client, frameId, frameUrl, domQueue, interactionQueue);
        processedFrames.add(frameId);
        
        // Remove from processed set after some time to allow re-processing of dynamic content
        setTimeout(() => {
          processedFrames.delete(frameId);
        }, 60000); // Increased timeout to 60 seconds
        
      } catch (frameError) {
        // Handle detached frame errors gracefully
        if (frameError.message.includes('detached') || frameError.message.includes('Attempted to use detached Frame')) {
          continue; // Skip detached frames silently
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
