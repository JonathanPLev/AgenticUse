// enhanced_instrumentation_optimized.js
// ENHANCED VERSION: Full data collection with function tracking capabilities

const fs = require('fs');
const path = require('path');
const { QueueManager } = require('./queue_manager.js');
const { FunctionTracker } = require('./function_tracker.js');
const { EnhancedNetworkTracer } = require('./enhanced_network_tracer.js');
const { StreamingResponseProcessor } = require('./streaming_response_processor.js');

// Function to create clean domain-based slugs
function createCleanUrlSlug(url) {
  try {
    // Remove protocol and www prefix, extract clean domain
    let cleanUrl = url
      .replace(/^https?:\/\//, '')  // Remove protocol
      .replace(/^www\./, '')        // Remove www prefix
      .split('/')[0]                // Get just the domain part
      .split('?')[0]                // Remove query parameters
      .split('#')[0];               // Remove fragments
    
    // Keep dots for domains, only replace truly unsafe characters
    cleanUrl = cleanUrl
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')  // Replace unsafe chars but keep dots
      .substring(0, 100);                  // Limit length
    
    return cleanUrl;
  } catch (error) {
    // Fallback to old method if parsing fails
    return url
      .replace(/(^\w+:|^)\//, '')
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .substring(0, 100);
  }
}

// Configuration for small in-memory data only (large content is streamed to disk)
const LOG_LIMITS = {
  MAX_CONSOLE_ARGS: 10000,
  MAX_NETWORK_HEADERS: null,
  MAX_STACK_FRAMES: 20,
  TRUNCATE_SUFFIX: '...[TRUNCATED_FOR_MEMORY]'
};

// Static file extensions to filter out
const STATIC_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'css', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp4', 'webm', 'avi', 'mov', 'mp3', 'wav', 'ogg',
  'pdf', 'zip', 'tar', 'gz', 'rar'
]);

// Image extensions to exclude from streaming (but still track metadata)
const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff'
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
  if (!content || !maxLength) return content || '';
  if (typeof content !== 'string') {
    try {
      content = JSON.stringify(content);
    } catch (e) {
      return '[UNSERIALIZABLE_CONTENT]';
    }
  }
  if (content.length <= maxLength) return content;
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

function isImageFile(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const extension = pathname.split('.').pop();
    return IMAGE_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

// This function is no longer needed since large content is streamed to disk
// Keeping it for any remaining small content processing
function shouldTruncateContent(content, maxSize) {
  if (!content || !maxSize) {
    return {
      content: content || '',
      truncated: false,
      metadata: extractEssentialMetadata(content)
    };
  }
  
  const metadata = extractEssentialMetadata(content);
  
  if (content.length <= maxSize) {
    return {
      content: content,
      truncated: false,
      metadata
    };
  }
  
  return {
    content: truncateContent(content, maxSize),
    truncated: true,
    originalSize: content.length,
    metadata
  };
}

async function enhancedInstrumentPage(page, queues) {
  const { networkQueue, responseQueue, consoleQueue, domQueue, interactionQueue, functionTrackingQueue } = queues;
  
  const frameTracker = new Map();
  const processedFrames = new Set();
  let networkRequestCount = 0;
  let dynamicContentDetected = false;
  
  // Initialize streaming processor for the current site
  const currentUrl = page.url();
  const urlSlug = createCleanUrlSlug(currentUrl);
  const siteOutputDir = path.join('data', urlSlug);
  const streamingProcessor = new StreamingResponseProcessor(siteOutputDir);
  
  // Initialize function tracking
  const functionTracker = new FunctionTracker(page, functionTrackingQueue, networkQueue);
  await functionTracker.initialize();
  
  // Initialize enhanced network tracer with error-based correlation
  const networkTracer = new EnhancedNetworkTracer(page, networkQueue);
  await networkTracer.initialize();
  networkTracer.startPeriodicExtraction();

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
      console.warn(`Failed to enable ${domain}: ${err.message}`);
    }
  }

  // Enhanced debugger configuration for script parsing only (no pausing)
  try {
    await client.send('Runtime.setAsyncCallStackDepth', { maxDepth: 16 });
  } catch (debuggerError) {
    console.warn(`Enhanced debugger configuration failed: ${debuggerError.message}`);
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
      console.warn(`Error handling frame attach: ${error.message}`);
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
                await processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue, streamingProcessor, siteOutputDir);
              }
            } catch (error) {
              console.warn(`Error processing navigated frame: ${error.message}`);
            }
          }, 2000);
        } catch (urlError) {
          // Invalid URL, skip
        }
      }
      
    } catch (error) {
      console.warn(`Error handling frame navigation: ${error.message}`);
    }
  });

  // Enhanced network monitoring with function correlation
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
      
      // Enhanced function call correlation with detailed analysis and error handling
      const correlationPromise = page.evaluate((reqId, requestUrl, requestMethod) => {
        const tracker = window.__functionTracker;
        if (!tracker) return null;
        
        // Get current stack trace to correlate with network request
        const currentStack = new Error().stack;
        
        // Find the most recent function call that might have triggered this request
        const recentCalls = tracker.calls?.slice(-10) || [];
        let correlatedCall = null;
        
        // Look for function calls that happened within the last 100ms
        const now = Date.now();
        for (let i = recentCalls.length - 1; i >= 0; i--) {
          const call = recentCalls[i];
          if (now - call.timestamp < 100) {
            // Check if this call's stack trace contains network-related functions
            const stackStr = call.stackTrace || '';
            if (stackStr.includes('fetch') || stackStr.includes('XMLHttpRequest') || 
                stackStr.includes('ajax') || stackStr.includes(requestUrl.split('/').pop())) {
              correlatedCall = call;
              break;
            }
          }
        }
        
        // If no direct correlation, get the most recent call
        if (!correlatedCall && recentCalls.length > 0) {
          correlatedCall = recentCalls[recentCalls.length - 1];
        }
        
        return {
          functionCall: correlatedCall,
          currentStack: currentStack,
          trackerStats: {
            totalCalls: tracker.calls?.length || 0,
            recentCallsCount: recentCalls.length
          }
        };
      }, requestId, url, request.method).catch(evalError => {
        // Handle evaluation errors gracefully
        if (evalError.message.includes('Execution context was destroyed') ||
            evalError.message.includes('detached Frame') ||
            evalError.message.includes('Promise was collected') ||
            evalError.message.includes('Target closed')) {
          return null; // Silently ignore context destruction errors
        }
        console.warn('Function correlation error:', evalError.message);
        return null;
      });

      correlationPromise.then(correlationData => {
        
        // Extract initiator stack trace details
        const initiatorStack = params.initiator?.stack?.callFrames || [];
        const enhancedStackTrace = initiatorStack.map(frame => ({
          functionName: frame.functionName || 'anonymous',
          scriptUrl: frame.url,
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber,
          scriptId: frame.scriptId
        }));
        
        // Get function source code for the top stack frame if available
        const topFrame = initiatorStack[0];
        let functionSourcePromise = Promise.resolve(null);
        
        if (topFrame && topFrame.scriptId) {
          functionSourcePromise = page.evaluate((scriptId, lineNum) => {
            try {
              // Try to get the script source
              const scripts = document.querySelectorAll('script');
              for (let script of scripts) {
                if (script.src && script.src.includes(scriptId)) {
                  return script.textContent || script.innerHTML;
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          }, topFrame.scriptId, topFrame.lineNumber).catch(() => null);
        }
        
        functionSourcePromise.then(functionSource => {
          // Only process if we have valid correlation data
          if (correlationData !== null) {
            // Enhanced network log entry with detailed function analysis
            const enhancedNetworkEntry = {
              event: 'requestWillBeSent',
              requestId,
              url,
              method: request.method,
              headers: request.headers,
              postData: request.postData,
              type,
              isDynamic: isDynamicRequest,
              timestamp: Date.now(),
              
              // Enhanced function correlation data
              functionAnalysis: {
                correlatedFunctionCall: correlationData?.functionCall,
                initiatorType: params.initiator?.type,
                enhancedStackTrace,
                functionSource: functionSource,
                
                // Detailed stack analysis
                stackAnalysis: {
                  totalFrames: enhancedStackTrace.length,
                  topFunction: enhancedStackTrace[0]?.functionName,
                  scriptOrigin: enhancedStackTrace[0]?.scriptUrl,
                  isMinified: enhancedStackTrace[0]?.scriptUrl?.includes('.min.') || 
                             enhancedStackTrace.some(f => f.functionName?.length === 1),
                  hasAsyncFrames: enhancedStackTrace.some(f => f.functionName?.includes('async'))
                },
                
                // Function tracker correlation
                trackerCorrelation: {
                  hasTracker: !!correlationData,
                  trackerStats: correlationData?.trackerStats,
                  correlationConfidence: correlationData?.functionCall ? 'high' : 'low'
                }
              },
              
              // Request context analysis
              requestContext: {
                frameId: params.frameId,
                isMainFrame: !params.frameId || params.frameId === 'main',
                resourceType: type,
                isThirdParty: !url.includes(new URL(page.url()).hostname),
                urlAnalysis: {
                  domain: new URL(url).hostname,
                  path: new URL(url).pathname,
                  hasQueryParams: new URL(url).search.length > 0,
                  isAPI: url.includes('api') || url.includes('ajax') || url.includes('.json'),
                  isMedia: /\.(jpg|jpeg|png|gif|mp4|webm|mp3)$/i.test(url)
                }
              }
            };
            
            networkQueue?.enqueue?.(enhancedNetworkEntry);
          }
        }).catch(sourceError => {
          // Handle function source extraction errors
          if (!sourceError.message.includes('detached Frame') &&
              !sourceError.message.includes('Execution context was destroyed') &&
              !sourceError.message.includes('Promise was collected')) {
            console.warn('Function source extraction error:', sourceError.message);
          }
        });
        
      }).catch(error => {
        console.warn('Function correlation error:', error.message);
        // Fallback with basic data
        networkQueue?.enqueue?.({
          event: 'requestWillBeSent',
          requestId,
          url,
          method: request.method,
          headers: request.headers,
          type,
          isDynamic: isDynamicRequest,
          timestamp: Date.now(),
          error: 'Function correlation failed: ' + error.message
        });
      });
    } catch (error) {
      console.warn(`Error handling network request: ${error.message}`);
    }
  });

  // Track when responses finish loading to capture complete bodies
  client.on('Network.loadingFinished', async (params) => {
    try {
      const { requestId, encodedDataLength } = params;
      
      // Try to get response body when loading is complete
      try {
        const response = await client.send('Network.getResponseBody', { requestId });
        if (response && response.body) {
          streamingProcessor.bufferResponseData(requestId, response.body, encodedDataLength);
        }
      } catch (error) {
        // Response body not available - this is expected for many response types
        // The streaming processor will handle this gracefully
      }
    } catch (error) {
      // Ignore errors in response capture
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
      
      // Stream response body directly to disk (skip images to save space)
      let responseMetadata = null;
      if (isImageFile(url)) {
        // For images, just store metadata without streaming the body
        responseMetadata = {
          url,
          mimeType: response.mimeType,
          headers: response.headers,
          status: response.status,
          skipped: 'image_file',
          timestamp: Date.now()
        };
      } else {
        try {
          responseMetadata = await streamingProcessor.startResponseStream(
            client, requestId, url, response.mimeType, response.headers, response.status
          );
        } catch (streamError) {
          console.warn(`Error streaming response ${requestId}: ${streamError.message}`);
          responseMetadata = {
            url,
            error: streamError.message,
            timestamp: Date.now()
          };
        }
      }
      
      // Get function call correlation and link with response with error handling
      page.evaluate((reqId) => {
        const functionCallId = window.__functionTracker?.functionToRequestMap?.get(reqId);
        const requestInfo = window.__functionTracker?.activeNetworkRequests?.get(reqId);
        return { functionCallId, requestInfo };
      }, requestId).then(correlation => {
        // Link network request with function tracking
        functionTracker.linkWithNetworkRequests({
          requestId,
          url,
          method: response.headers?.method || 'GET',
          status: response.status,
          timestamp: Date.now(),
          triggeredByFunction: correlation.functionCallId,
          clientSideRequestInfo: correlation.requestInfo
        });
      }).catch(correlationError => {
        // Handle correlation errors gracefully
        if (!correlationError.message.includes('detached Frame') &&
            !correlationError.message.includes('Execution context was destroyed') &&
            !correlationError.message.includes('Promise was collected') &&
            !correlationError.message.includes('Target closed')) {
          console.warn('Response correlation error:', correlationError.message);
        }
        
        // Fallback without correlation
        functionTracker.linkWithNetworkRequests({
          requestId,
          url,
          method: response.headers?.method || 'GET',
          status: response.status,
          timestamp: Date.now()
        });
      });
      
      // Log response metadata (body is already streamed to disk)
      responseQueue?.enqueue?.({
        event: 'responseReceived',
        requestId,
        url,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        mimeType: response.mimeType,
        bodyStreamed: true,
        streamedFile: responseMetadata?.filename,
        streamedPath: responseMetadata?.filepath,
        bodySize: responseMetadata?.bytesWritten || 0,
        processingTime: responseMetadata?.processingTime,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`Error handling network response: ${error.message}`);
    }
  });

  // Enhanced script parsing with full source capture
  client.on('Debugger.scriptParsed', async (params) => {
    try {
      const { scriptId, url, startLine, startColumn, endLine, endColumn } = params;
      
      // Stream script source directly to disk
      let scriptMetadata = null;
      try {
        const sourceResponse = await client.send('Debugger.getScriptSource', { scriptId });
        if (sourceResponse && sourceResponse.scriptSource) {
          scriptMetadata = await streamingProcessor.streamScriptSource(
            scriptId, url, sourceResponse.scriptSource, siteOutputDir
          );
        }
      } catch (sourceError) {
        // Script source not available
        scriptMetadata = {
          scriptId,
          url,
          error: sourceError.message,
          timestamp: Date.now()
        };
      }
      
      // Log script metadata (source is already streamed to disk)
      functionTrackingQueue?.enqueue?.({
        event: 'scriptParsed',
        scriptId,
        url,
        startLine,
        startColumn,
        endLine,
        endColumn,
        sourceStreamed: true,
        streamedFile: scriptMetadata?.filename,
        streamedPath: scriptMetadata?.filepath,
        sourceLength: scriptMetadata?.bytesWritten || 0,
        originalSourceSize: scriptMetadata?.originalSize || 0,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`Error handling script parsed: ${error.message}`);
    }
  });

  // Enhanced console logging with full arguments
  client.on('Runtime.consoleAPICalled', (params) => {
    try {
      const { type, args, stackTrace } = params;
      
      // Process console arguments with memory-safe limits
      const fullArgs = args.map(arg => {
        try {
          let value = arg.value || '';
          if (typeof value === 'object') {
            value = JSON.stringify(value, null, 2);
          } else {
            value = String(value);
          }
          return {
            type: arg.type,
            value: truncateContent(value, LOG_LIMITS.MAX_CONSOLE_ARGS),
            truncated: value.length > LOG_LIMITS.MAX_CONSOLE_ARGS
          };
        } catch (e) {
          return {
            type: arg.type,
            value: '[UNSERIALIZABLE_ARG]',
            truncated: false
          };
        }
      });
      
      consoleQueue?.enqueue?.({
        event: 'consoleAPICalled',
        type,
        args: fullArgs,
        stackTrace: stackTrace ? {
          callFrames: stackTrace.callFrames.slice(0, LOG_LIMITS.MAX_STACK_FRAMES) // Limit stack trace depth
        } : undefined,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn(`Error handling console event: ${error.message}`);
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
      console.warn(`Error logging page error: ${logError.message}`);
    }
  });

  // Periodic frame processing with memory cleanup
  const frameProcessingInterval = setInterval(async () => {
    try {
      await processAllFramesOptimized(page, client, domQueue, interactionQueue, frameTracker, processedFrames, streamingProcessor, siteOutputDir);
      
      // Memory cleanup: remove old frame data
      const now = Date.now();
      const maxAge = 300000; // 5 minutes
      for (const [frameId, frameInfo] of frameTracker.entries()) {
        if (frameInfo.createdAt && (now - frameInfo.createdAt) > maxAge) {
          frameTracker.delete(frameId);
        }
      }
      
      // Limit processed frames set size
      if (processedFrames.size > 1000) {
        const framesToDelete = Array.from(processedFrames).slice(0, 500);
        framesToDelete.forEach(frameId => processedFrames.delete(frameId));
      }
    } catch (error) {
      console.warn(`Error in periodic frame processing: ${error.message}`);
    }
  }, 30000); // Increased to 30 seconds

  const cleanup = () => {
    try {
      clearInterval(frameProcessingInterval);
      frameTracker.clear();
      processedFrames.clear();
      meaningfulDomains.clear();
      functionTracker.cleanup();
      streamingProcessor.cleanup();
    } catch (error) {
      console.warn(`Error during instrumentation cleanup: ${error.message}`);
    }
  };

  return {
    client,
    cleanup,
    functionTracker,
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames,
    getNetworkRequestCount: () => networkRequestCount,
    getDynamicContentStatus: () => dynamicContentDetected,
    getMeaningfulDomains: () => Array.from(meaningfulDomains),
    getFunctionTrackingReport: () => functionTracker.getTrackingReport(),
    getStreamingStats: () => streamingProcessor.getMemoryStats()
  };
}

// OPTIMIZED: Process frame content with size limits
async function processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue, streamingProcessor, siteOutputDir) {
  try {
    if (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:') || frameUrl.startsWith('blob:')) {
      return;
    }

    try {
      const { root } = await client.send('DOM.getDocument', { depth: 1, pierce: false });
      
      if (root && root.nodeId) {
        const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
        
        if (outerHTML && outerHTML.length > 100) {
          // Stream HTML content directly to disk
          let htmlMetadata = null;
          try {
            htmlMetadata = await streamingProcessor.streamHTMLContent(
              frameId, frameUrl, outerHTML, siteOutputDir
            );
          } catch (streamError) {
            console.warn(`Error streaming HTML content: ${streamError.message}`);
          }
          
          domQueue?.enqueue?.({
            event: 'frameContent',
            frameId,
            url: frameUrl,
            htmlStreamed: true,
            streamedFile: htmlMetadata?.filename,
            streamedPath: htmlMetadata?.filepath,
            originalSize: outerHTML.length,
            bytesWritten: htmlMetadata?.bytesWritten || 0,
            timestamp: Date.now()
          });

          // Analyze for chatbot indicators (use first 5KB for analysis to avoid memory issues)
          const htmlSample = outerHTML.substring(0, 5000);
          const chatbotIndicators = analyzeChatbotContentOptimized(htmlSample, frameUrl);
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
      console.warn(`Error getting DOM for frame ${frameId}: ${domError.message}`);
    }
  } catch (error) {
    if (!error.message.includes('detached')) {
      console.warn(`Error processing frame content ${frameId}: ${error.message}`);
    }
  }
}

// OPTIMIZED: Process all frames
async function processAllFramesOptimized(page, client, domQueue, interactionQueue, frameTracker, processedFrames, streamingProcessor, siteOutputDir) {
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
        
        await processFrameContentOptimized(client, frameId, frameUrl, domQueue, interactionQueue, streamingProcessor, siteOutputDir);
        processedFrames.add(frameId);
        
        setTimeout(() => {
          processedFrames.delete(frameId);
        }, 120000); // Increased timeout to 2 minutes
        
      } catch (frameError) {
        if (frameError.message.includes('detached') || frameError.message.includes('Attempted to use detached Frame')) {
          continue;
        }
        console.warn(`Error processing frame ${frame.url()}: ${frameError.message}`);
      }
    }
  } catch (error) {
    console.warn(`Error in processAllFramesOptimized: ${error.message}`);
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

// Cleanup function for network tracer
async function cleanupInstrumentation(page, networkTracer) {
  try {
    if (networkTracer) {
      networkTracer.stopPeriodicExtraction();
      // Extract any remaining data
      await networkTracer.extractCorrelationData();
    }
  } catch (error) {
    console.warn('Error during instrumentation cleanup:', error.message);
  }
}

module.exports = {
  enhancedInstrumentPage,
  processFrameContentOptimized,
  processAllFramesOptimized,
  analyzeChatbotContentOptimized,
  cleanupInstrumentation
};
