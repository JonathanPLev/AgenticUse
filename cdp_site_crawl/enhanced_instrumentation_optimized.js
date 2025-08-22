// enhanced_instrumentation_optimized.js
// OPTIMIZED VERSION: Reduced log sizes while maintaining AI detection capabilities

const { DataQueue } = require('./helpers');

// Configuration for log size optimization
const LOG_LIMITS = {
  MAX_RESPONSE_BODY: 10000,      // 10KB max response body
  MAX_HTML_CONTENT: 50000,       // 50KB max HTML content
  MAX_SCRIPT_SOURCE: 5000,       // 5KB max script source
  MAX_CONSOLE_ARGS: 1000,        // 1KB max console arguments
  TRUNCATE_SUFFIX: '...[TRUNCATED]'
};

// Static file extensions to filter out
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'css', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp4', 'webm', 'avi', 'mov', 'mp3', 'wav', 'ogg',
  'pdf', 'zip', 'tar', 'gz', 'rar'
]);

// Extract essential metadata from content
function extractEssentialMetadata(content, url) {
  const metadata = {
    scriptNames: [],
    functionNames: [],
    apiCalls: [],
    jsLibraries: []
  };
  
  if (!content) return metadata;
  
  // Extract function names
  const functionPatterns = [
    /function\s+(\w+)\s*\(/g,
    /(\w+)\s*:\s*function/g,
    /(\w+)\s*=\s*function/g,
    /async\s+function\s+(\w+)/g,
    /class\s+(\w+)/g
  ];
  
  functionPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].length > 2) {
        metadata.functionNames.push(match[1]);
      }
    }
  });
  
  // Extract API calls and endpoints
  const apiPatterns = [
    /['"`]([^'"` ]*\/api\/[^'"` ]*)['"`]/g,
    /['"`]([^'"` ]*\/v\d+\/[^'"` ]*)['"`]/g,
    /fetch\s*\(['"`]([^'"` ]*)['"`]/g,
    /axios\.[a-z]+\(['"`]([^'"` ]*)['"`]/g
  ];
  
  apiPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        metadata.apiCalls.push(match[1]);
      }
    }
  });
  
  // Extract script/library names
  const scriptPatterns = [
    /import\s+.*\s+from\s+['"`]([^'"` ]*)['"`]/g,
    /require\(['"`]([^'"` ]*)['"`]\)/g,
    /<script[^>]*src=['"`]([^'"` ]*)['"`]/g
  ];
  
  scriptPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        metadata.scriptNames.push(match[1]);
      }
    }
  });
  
  return metadata;
}

function truncateContent(content, maxLength) {
  if (!content || content.length <= maxLength) return content;
  return content.substring(0, maxLength) + LOG_LIMITS.TRUNCATE_SUFFIX;
}

function isStaticFile(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const extension = pathname.split('.').pop();
    return STATIC_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

function shouldTruncateContent(content, maxSize) {
  if (!content || content.length <= maxSize) return { content, truncated: false };
  
  // Extract essential metadata before truncating
  const metadata = extractEssentialMetadata(content);
  
  // If we have important metadata, include it even if over size limit
  const hasImportantData = metadata.functionNames.length > 0 || 
                          metadata.apiCalls.length > 0 || 
                          metadata.scriptNames.length > 0;
  
  if (hasImportantData) {
    // Keep more content if it contains important data
    const extendedLimit = Math.min(maxSize * 2, content.length);
    return {
      content: content.substring(0, extendedLimit) + LOG_LIMITS.TRUNCATE_SUFFIX,
      truncated: content.length > extendedLimit,
      metadata
    };
  }
  
  return {
    content: content.substring(0, maxSize) + LOG_LIMITS.TRUNCATE_SUFFIX,
    truncated: true,
    metadata
  };
}

async function enhancedInstrumentPage(page, queues) {
  const { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue } = queues;
  
  const frameTracker = new Map();
  const processedFrames = new Set();
  let networkRequestCount = 0;
  let dynamicContentDetected = false;

  // Enhanced CDP session creation with retry logic
  let client;
  let cdpRetries = 3;
  
  while (cdpRetries > 0) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const target = page.target();
      if (!target) throw new Error('No page target available');
      
      let targetReady = false;
      for (let i = 0; i < 10; i++) {
        if (target.url() && target.url() !== 'about:blank') {
          targetReady = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      client = await target.createCDPSession();
      break;
    } catch (cdpError) {
      cdpRetries--;
      if (cdpRetries === 0) throw new Error(`Failed to create CDP session: ${cdpError.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Enable domains
  const domains = ['Network.enable', 'Page.enable', 'DOM.enable', 'Runtime.enable', 'Debugger.enable'];
  for (const domain of domains) {
    try {
      await client.send(domain);
    } catch (err) {
      console.warn(`⚠️  Failed to enable ${domain}: ${err.message}`);
    }
  }

  // Enhanced debugger configuration for function name capture
  try {
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 16 });
    await client.send('Debugger.setBreakpointsActive', { active: true });
    await client.send('Debugger.setPauseOnExceptions', { state: 'uncaught' });
    await client.send('Runtime.setAsyncCallStackDepth', { maxDepth: 16 });
    await client.send('Debugger.setSkipAllPauses', { skip: false });
  } catch (debuggerError) {
    console.warn(`⚠️  Enhanced debugger configuration failed: ${debuggerError.message}`);
  }

  // Frame tracking with reduced logging
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
    } catch (error) {
      console.warn(`⚠️  Error handling frame attach: ${error.message}`);
    }
  });

  client.on('Page.frameNavigated', async (params) => {
    try {
      const { frame } = params;
      const { id: frameId, url: frameUrl } = frame;
      
      const frameInfo = frameTracker.get(frameId) || {};
      frameInfo.url = frameUrl;
      frameInfo.navigatedAt = Date.now();
      frameTracker.set(frameId, frameInfo);
      
      // Keep all frames - no filtering based on tracking/ads
      
      const isMeaningfulIframe = frameUrl && 
        frameUrl !== 'about:blank' && 
        !frameUrl.startsWith('data:') &&
        frameUrl.length > 10; // Reduced threshold to capture more frames
      
      if (isMeaningfulIframe) {
        try {
          const urlObj = new URL(frameUrl);
          meaningfulDomains.add(urlObj.host); // Changed from hostname to host
          dynamicContentDetected = true;
          
          // Only log essential frame data
          domQueue?.enqueue?.({
            event: 'frameNavigated',
            frameId,
            url: frameUrl,
            domain: urlObj.host, // Changed from hostname to host
            timestamp: Date.now()
          });
          
          setTimeout(async () => {
            try {
              const currentFrameInfo = frameTracker.get(frameId);
              if (currentFrameInfo && currentFrameInfo.attached) {
                await processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue);
              }
            } catch (error) {
              console.warn(`⚠️  Error processing navigated frame: ${error.message}`);
            }
          }, 2000);
        } catch (urlError) {
          // Invalid URL, skip
        }
      }
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame navigation: ${error.message}`);
    }
  });

  // OPTIMIZED: Network monitoring with static file filtering
  client.on('Network.requestWillBeSent', (params) => {
    try {
      networkRequestCount++;
      const { request, requestId, type } = params;
      const url = request.url;
      
      // Only skip obvious static files (images, videos, fonts)
      if (isStaticFile(url)) {
        return;
      }
      
      const isDynamicRequest = type === 'XHR' || type === 'Fetch' || 
                              url.includes('api') || url.includes('ajax') || url.includes('json');
      
      if (isDynamicRequest) {
        dynamicContentDetected = true;
      }
      
      // Log essential request data
      networkQueue?.enqueue?.({
        event: 'requestWillBeSent',
        requestId,
        url,
        method: request.method,
        headers: request.headers,
        type,
        isDynamic: isDynamicRequest,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network request: ${error.message}`);
    }
  });

  // OPTIMIZED: Response handling with body size limits
  client.on('Network.responseReceived', async (params) => {
    try {
      const { response, requestId, type } = params;
      const url = response.url;
      
      // Only skip obvious static files (images, videos, fonts)
      if (isStaticFile(url)) {
        return;
      }
      
      // Get response body with smart truncation
      let responseBody = '';
      let bodyMetadata = null;
      let bodyTruncated = false;
      try {
        const bodyResponse = await client.send('Network.getResponseBody', { requestId });
        if (bodyResponse && bodyResponse.body) {
          const result = shouldTruncateContent(bodyResponse.body, LOG_LIMITS.MAX_RESPONSE_BODY);
          responseBody = result.content;
          bodyMetadata = result.metadata;
          bodyTruncated = result.truncated;
        }
      } catch (bodyError) {
        // Response body not available
      }
      
      // Log essential response data
      responseQueue?.enqueue?.({
        event: 'responseReceived',
        requestId,
        url,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        mimeType: response.mimeType,
        body: responseBody,
        bodySize: responseBody.length,
        bodyTruncated,
        bodyMetadata,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling network response: ${error.message}`);
    }
  });

  // OPTIMIZED: Script parsing with size limits
  client.on('Debugger.scriptParsed', async (params) => {
    try {
      const { scriptId, url, startLine, startColumn, endLine, endColumn } = params;
      
      // Log all scripts - let AI detector decide relevance later
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

  // OPTIMIZED: Function name capture with essential data only
  client.on('Debugger.paused', async (params) => {
    try {
      const { callFrames, reason } = params;
      
      // Extract function names efficiently
      const functionNames = callFrames.map(frame => ({
        functionName: frame.functionName || 'anonymous',
        url: frame.url,
        lineNumber: frame.location?.lineNumber || 0,
        columnNumber: frame.location?.columnNumber || 0
      }));
      
      debugQueue?.enqueue?.({
        event: 'paused',
        reason,
        functionNames,
        timestamp: Date.now()
      });
      
      await client.send('Debugger.resume');
    } catch (error) {
      console.warn(`⚠️  Error handling debugger pause: ${error.message}`);
      try {
        await client.send('Debugger.resume');
      } catch (resumeError) {
        console.warn(`⚠️  Error resuming debugger: ${resumeError.message}`);
      }
    }
  });

  // OPTIMIZED: Console logging with argument size limits
  client.on('Runtime.consoleAPICalled', (params) => {
    try {
      const { type, args, stackTrace } = params;
      
      // Truncate console arguments
      const truncatedArgs = args.map(arg => ({
        type: arg.type,
        value: truncateContent(JSON.stringify(arg.value || ''), LOG_LIMITS.MAX_CONSOLE_ARGS)
      }));
      
      consoleQueue?.enqueue?.({
        event: 'consoleAPICalled',
        type,
        args: truncatedArgs,
        stackTrace: stackTrace ? {
          callFrames: stackTrace.callFrames.slice(0, 5) // Limit stack trace depth
        } : undefined,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`⚠️  Error handling console event: ${error.message}`);
    }
  });

  // Page error handling
  page.on('pageerror', (error) => {
    try {
      consoleQueue?.enqueue?.({
        event: 'pageError',
        message: error.message,
        stack: truncateContent(error.stack, 2000),
        url: page.url(),
        timestamp: Date.now()
      });
    } catch (logError) {
      console.warn(`⚠️  Error logging page error: ${logError.message}`);
    }
  });

  // Periodic frame processing with reduced frequency
  const frameProcessingInterval = setInterval(async () => {
    try {
      await processAllFramesOptimized(page, client, domQueue, interactionQueue, frameTracker, processedFrames);
    } catch (error) {
      console.warn(`⚠️  Error in periodic frame processing: ${error.message}`);
    }
  }, 30000); // Increased to 30 seconds

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
    cleanup,
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames,
    getNetworkRequestCount: () => networkRequestCount,
    getDynamicContentStatus: () => dynamicContentDetected,
    getMeaningfulDomains: () => Array.from(meaningfulDomains)
  };
}

// OPTIMIZED: Process frame content with size limits
async function processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue) {
  try {
    if (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:') || frameUrl.startsWith('blob:')) {
      return;
    }

    try {
      const { root } = await client.send('DOM.getDocument', { depth: 1, pierce: false });
      
      if (root && root.nodeId) {
        const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
        
        if (outerHTML && outerHTML.length > 100) {
          // Truncate HTML content
          const truncatedHTML = truncateContent(outerHTML, LOG_LIMITS.MAX_HTML_CONTENT);
          
          domQueue?.enqueue?.({
            event: 'frameContent',
            frameId,
            url: frameUrl,
            html: truncatedHTML,
            originalSize: outerHTML.length,
            timestamp: Date.now()
          });

          // Analyze for chatbot indicators
          const chatbotIndicators = analyzeChatbotContentOptimized(truncatedHTML, frameUrl);
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

// OPTIMIZED: Process all frames with reduced frequency
async function processAllFramesOptimized(page, client, domQueue, interactionQueue, frameTracker, processedFrames) {
  try {
    const frames = page.frames();
    
    for (const frame of frames) {
      try {
        const frameId = frame._id;
        const frameUrl = frame.url();
        
        if (processedFrames.has(frameId) || !frameUrl || frameUrl === 'about:blank' || 
            frameUrl.startsWith('data:') || frameUrl.startsWith('blob:')) {
          continue;
        }
        
        const frameInfo = frameTracker.get(frameId);
        if (frameInfo && !frameInfo.attached) continue;
        
        if (frame.isDetached && frame.isDetached()) continue;
        
        await processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue);
        processedFrames.add(frameId);
        
        setTimeout(() => {
          processedFrames.delete(frameId);
        }, 120000); // Increased timeout to 2 minutes
        
      } catch (frameError) {
        if (frameError.message.includes('detached') || frameError.message.includes('Attempted to use detached Frame')) {
          continue;
        }
        console.warn(`⚠️  Error processing frame ${frame.url()}: ${frameError.message}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error in processAllFramesOptimized: ${error.message}`);
  }
}

// OPTIMIZED: Chatbot analysis with essential patterns only
function analyzeChatbotContentOptimized(html, url) {
  const indicators = [];
  
  const chatbotPatterns = [
    /chat/gi, /widget/gi, /support/gi, /bot/gi, /assistant/gi,
    /intercom/gi, /zendesk/gi, /drift/gi, /crisp/gi, /freshchat/gi,
    /livechat/gi, /tidio/gi, /hubspot/gi, /messenger/gi
  ];
  
  // Only check first 5000 characters for performance
  const htmlSample = html.substring(0, 5000);
  
  chatbotPatterns.forEach(pattern => {
    const matches = htmlSample.match(pattern);
    if (matches && matches.length > 0) {
      indicators.push({
        pattern: pattern.source,
        matches: matches.length,
        type: 'html_content'
      });
    }
  });
  
  return indicators;
}

module.exports = {
  enhancedInstrumentPage,
  processFrameContentOptimized,
  processAllFramesOptimized,
  analyzeChatbotContentOptimized
};
