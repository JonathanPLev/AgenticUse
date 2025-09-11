// balanced_ai_instrumentation.js
// Comprehensive instrumentation that preserves data for post-crawl AI detection
// while filtering out static resources and optimizing response sizes

const { DataQueue } = require('./helpers');

/**
 * Static resource patterns to filter out
 */
const STATIC_RESOURCE_PATTERNS = {
  extensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico',
    '.css', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.mp4', '.mp3', '.wav', '.avi', '.mov', '.wmv',
    '.pdf', '.zip', '.tar', '.gz'
  ],
  
  mimeTypes: [
    'image/', 'font/', 'audio/', 'video/',
    'application/pdf', 'application/zip', 'application/octet-stream'
  ],
  
  urlPatterns: [
    /\/assets\//i, /\/static\//i, /\/images\//i, /\/img\//i,
    /\/css\//i, /\/fonts\//i, /\/media\//i,
    /\.amazonaws\.com.*\.(jpg|png|gif|css|js|woff)/i,
    /\.cloudfront\.net.*\.(jpg|png|gif|css|js|woff)/i,
    /\.googleusercontent\.com.*\.(jpg|png|gif)/i
  ]
};

/**
 * Check if a URL/request is a static resource
 */
function isStaticResource(url, mimeType = '') {
  if (!url || typeof url !== 'string') return false;
  
  const lowerUrl = url.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  
  // Check file extensions
  for (const ext of STATIC_RESOURCE_PATTERNS.extensions) {
    if (lowerUrl.includes(ext)) return true;
  }
  
  // Check MIME types
  for (const mime of STATIC_RESOURCE_PATTERNS.mimeTypes) {
    if (lowerMime.includes(mime)) return true;
  }
  
  // Check URL patterns
  for (const pattern of STATIC_RESOURCE_PATTERNS.urlPatterns) {
    if (pattern.test(url)) return true;
  }
  
  return false;
}

/**
 * Check if response content is displayable HTML/text that should be truncated
 */
function isDisplayContent(mimeType, url) {
  if (!mimeType) return false;
  
  const lowerMime = mimeType.toLowerCase();
  const isHtmlContent = lowerMime.includes('text/html') || lowerMime.includes('text/plain');
  const isMainPage = !url.includes('/api/') && !url.includes('/v1/') && !url.includes('.json');
  
  return isHtmlContent && isMainPage;
}

/**
 * Extract function calls and script information from DOM
 */
function extractDOMFunctions(html) {
  if (!html || typeof html !== 'string') return {};
  
  const functions = [];
  const scripts = [];
  
  // Extract script tags and their content
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const scriptContent = scriptMatch[1];
    const scriptTag = scriptMatch[0];
    
    // Extract src attribute if present
    const srcMatch = scriptTag.match(/src=["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1] : null;
    
    scripts.push({
      src,
      content: scriptContent ? scriptContent.substring(0, 2000) : null, // First 2KB of script
      hasContent: !!scriptContent,
      length: scriptContent ? scriptContent.length : 0
    });
    
    // Extract function calls from script content
    if (scriptContent) {
      const functionPatterns = [
        /(\w+)\s*\(/g, // Function calls
        /\.(\w+)\s*\(/g, // Method calls
        /new\s+(\w+)\s*\(/g, // Constructor calls
        /addEventListener\s*\(\s*['"](\w+)['"]/g, // Event listeners
        /fetch\s*\(\s*['"]([^'"]+)['"]/g, // Fetch calls
        /XMLHttpRequest/g, // XHR usage
        /WebSocket/g, // WebSocket usage
        /postMessage/g // PostMessage calls
      ];
      
      functionPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(scriptContent)) !== null) {
          functions.push({
            type: 'function_call',
            name: match[1] || match[0],
            context: 'script',
            line: scriptContent.substring(0, match.index).split('\n').length
          });
        }
      });
    }
  }
  
  // Extract inline event handlers
  const eventHandlerRegex = /on\w+\s*=\s*["'][^"']*["']/gi;
  let eventMatch;
  
  while ((eventMatch = eventHandlerRegex.exec(html)) !== null) {
    functions.push({
      type: 'event_handler',
      handler: eventMatch[0],
      context: 'inline'
    });
  }
  
  return {
    functions: functions.slice(0, 500), // Limit to first 500 functions
    scripts: scripts.slice(0, 50), // Limit to first 50 scripts
    totalFunctions: functions.length,
    totalScripts: scripts.length
  };
}

/**
 * Balanced page instrumentation for comprehensive AI detection
 */
async function balancedAIInstrumentPage(page, queues) {
  const {
    networkQueue,
    responseQueue,
    consoleQueue,
    debugQueue,
    domQueue,
    interactionQueue,
  } = queues;

  // Enhanced CDP session setup with retry logic
  let client;
  let cdpRetries = 3;
  
  while (cdpRetries > 0) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const target = page.target();
      if (!target) {
        throw new Error('No page target available');
      }
      client = await target.createCDPSession();
      break;
    } catch (cdpError) {
      cdpRetries--;
      console.warn(`⚠️  CDP session creation failed (${3 - cdpRetries}/3): ${cdpError.message}`);
      if (cdpRetries === 0) {
        throw new Error(`Failed to create CDP session: ${cdpError.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Enable necessary domains
  const domains = ['Network.enable', 'Runtime.enable', 'DOM.enable'];
  for (const domain of domains) {
    try {
      await client.send(domain);
      console.log(`✅ ${domain} enabled successfully`);
    } catch (err) {
      console.warn(`⚠️  Failed to enable ${domain}: ${err.message}`);
    }
  }

  // Track ALL network requests (including static resources) but filter data within each
  client.on('Network.requestWillBeSent', async (params) => {
    try {
      const url = params.request.url;
      
      // Capture ALL requests but reduce data for static resources
      const isStatic = isStaticResource(url);
      
      // Get post data for non-GET requests
      let postData = params.request.postData || null;
      if (!postData && (params.request.method === 'POST' || params.request.method === 'PUT')) {
        try {
          const req = await client.send('Network.getRequestPostData', { requestId: params.requestId });
          if (req.postData) {
            // Keep full post data but limit to reasonable size
            postData = req.postData.length > 50000 ? 
              req.postData.substring(0, 50000) + '...[truncated]' : 
              req.postData;
          }
        } catch {}
      }
      
      const requestData = {
        event: 'requestWillBeSent',
        requestId: params.requestId,
        url,
        method: params.request.method,
        headers: isStatic ? {} : params.request.headers, // Minimal headers for static resources
        postData: isStatic ? null : postData, // No post data for static resources
        timestamp: Date.now(),
        frameId: params.frameId,
        resourceType: params.type,
        initiator: params.initiator,
        // Enhanced categorization for post-analysis
        isApiCall: /\/api\/|\/v1\/|\/graphql|\.json/.test(url),
        isThirdParty: !url.includes(new URL(page.url()).hostname),
        hasPostData: !!postData,
        postDataSize: postData ? postData.length : 0,
        isStaticResource: isStatic
      };
      
      networkQueue?.enqueue?.(requestData);
      
    } catch (error) {
      console.warn(`⚠️  Error processing network request: ${error.message}`);
    }
  });

  // Track ALL responses with smart content handling
  client.on('Network.responseReceived', async (params) => {
    try {
      const { response, requestId } = params;
      
      // Capture ALL responses but reduce data for static resources
      const isStatic = isStaticResource(response.url, response.mimeType);
      
      let bodyPreview, bodyPreviewTruncated;
      
      // Get response body with smart truncation - skip body for static resources
      if (!isStatic) {
        try {
          const bodyObj = await client.send('Network.getResponseBody', { requestId });
          if (bodyObj && bodyObj.body) {
            const raw = bodyObj.base64Encoded
              ? Buffer.from(bodyObj.body, 'base64')
              : Buffer.from(bodyObj.body, 'utf8');
            
            // Smart truncation based on content type - increased limits for 100MB target
            let maxSize;
            if (isDisplayContent(response.mimeType, response.url)) {
              maxSize = 20000; // 20KB for HTML pages (doubled)
            } else if (response.mimeType.includes('json') || response.mimeType.includes('javascript')) {
              maxSize = 200000; // 200KB for JSON/JS (doubled)
            } else {
              maxSize = 100000; // 100KB for other content (doubled)
            }
            
            bodyPreview = raw.subarray(0, Math.min(raw.length, maxSize)).toString('utf8');
            bodyPreviewTruncated = raw.length > maxSize;
            
            // Add truncation marker
            if (bodyPreviewTruncated) {
              bodyPreview += '\n...[TRUNCATED - Original size: ' + raw.length + ' bytes]';
            }
          }
        } catch {}
      }

      const responseData = {
        event: 'responseReceived',
        requestId,
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: isStatic ? { 'content-type': response.mimeType } : response.headers, // Minimal headers for static
        mimeType: response.mimeType,
        timestamp: Date.now(),
        frameId: params.frameId,
        bodyPreview: isStatic ? null : bodyPreview, // No body for static resources
        bodyPreviewTruncated,
        bodySize: bodyPreview ? bodyPreview.length : 0,
        // Enhanced metadata for analysis
        isApiResponse: /\/api\/|\/v1\/|\/graphql|\.json/.test(response.url),
        isSuccessful: response.status >= 200 && response.status < 300,
        isError: response.status >= 400,
        contentType: response.mimeType,
        isStaticResource: isStatic
      };
      
      responseQueue?.enqueue?.(responseData);

    } catch (error) {
      console.warn(`⚠️  Error processing network response: ${error.message}`);
    }
  });

  // Capture ALL console messages (they're usually small)
  page.on('console', msg => {
    try {
      consoleQueue?.enqueue?.({
        event: 'console',
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        timestamp: Date.now(),
        isError: msg.type() === 'error',
        isWarning: msg.type() === 'warning'
      });
    } catch (error) {
      console.warn(`⚠️  Error processing console message: ${error.message}`);
    }
  });

  // Capture page errors
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

  // Enhanced frame tracking for dynamic iframes
  const frameTracker = new Map();
  const processedFrames = new Set();
  
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
      
      // Clean up after delay
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
      
      // Process new iframe content
      await processFrameContent(client, frame.id, frame.url, domQueue);
      
    } catch (error) {
      console.warn(`⚠️  Error handling frame navigation: ${error.message}`);
    }
  });
  
  // Periodic DOM analysis with function extraction
  const domAnalysisInterval = setInterval(async () => {
    try {
      await analyzeDOMContent(client, domQueue);
      await processAllFrames(page, client, domQueue, frameTracker, processedFrames);
    } catch (error) {
      console.warn(`⚠️  Error in DOM analysis: ${error.message}`);
    }
  }, 10000); // Every 10 seconds

  return {
    client,
    cleanup: () => {
      clearInterval(domAnalysisInterval);
      frameTracker.clear();
      processedFrames.clear();
    },
    getFrameTracker: () => frameTracker,
    getProcessedFrames: () => processedFrames
  };
}

/**
 * Process content of a specific frame
 */
async function processFrameContent(client, frameId, frameUrl, domQueue) {
  try {
    if (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:')) {
      return;
    }

    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
    
    const domAnalysis = extractDOMFunctions(outerHTML);
    
    domQueue?.enqueue?.({
      event: 'frameContent',
      frameId,
      url: frameUrl,
      timestamp: Date.now(),
      htmlSize: outerHTML.length,
      functions: domAnalysis.functions.slice(0, 100), // Limit functions per frame
      scripts: domAnalysis.scripts.slice(0, 20), // Limit scripts per frame
      keyElements: extractKeyElements(outerHTML)
    });

  } catch (error) {
    console.warn(`⚠️  Error processing frame content ${frameId}: ${error.message}`);
  }
}

/**
 * Process all frames periodically to catch dynamic content
 */
async function processAllFrames(page, client, domQueue, frameTracker, processedFrames) {
  try {
    const frames = page.frames();
    
    for (const frame of frames) {
      try {
        const frameId = frame._id;
        const frameUrl = frame.url();
        
        if (processedFrames.has(frameId) || !frameUrl || frameUrl === 'about:blank') {
          continue;
        }
        
        const frameInfo = frameTracker.get(frameId);
        if (frameInfo && !frameInfo.attached) {
          continue;
        }
        
        await processFrameContent(client, frameId, frameUrl, domQueue);
        processedFrames.add(frameId);
        
        // Remove from processed set after time to allow re-processing
        setTimeout(() => {
          processedFrames.delete(frameId);
        }, 30000);
        
      } catch (frameError) {
        if (frameError.message.includes('detached')) {
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
 * Analyze DOM content and extract functions/scripts
 */
async function analyzeDOMContent(client, domQueue) {
  try {
    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
    
    // Extract function calls and scripts
    const domAnalysis = extractDOMFunctions(outerHTML);
    
    // Only store essential DOM data, not full HTML
    domQueue?.enqueue?.({
      event: 'domAnalysis',
      timestamp: Date.now(),
      htmlSize: outerHTML.length,
      functions: domAnalysis.functions,
      scripts: domAnalysis.scripts,
      totalFunctions: domAnalysis.totalFunctions,
      totalScripts: domAnalysis.totalScripts,
      // Store key DOM elements, not full HTML
      keyElements: extractKeyElements(outerHTML)
    });
    
  } catch (error) {
    console.warn(`⚠️  Error analyzing DOM: ${error.message}`);
  }
}

/**
 * Extract key DOM elements that might indicate AI usage
 */
function extractKeyElements(html) {
  const elements = [];
  
  // Look for elements with AI-related attributes or content
  const patterns = [
    /<[^>]*(?:chat|bot|ai|assistant|widget|support)[^>]*>/gi,
    /<[^>]*data-[^>]*(?:chat|bot|ai|assistant)[^>]*>/gi,
    /<[^>]*class="[^"]*(?:chat|bot|ai|assistant|widget)[^"]*"[^>]*>/gi,
    /<[^>]*id="[^"]*(?:chat|bot|ai|assistant|widget)[^"]*"[^>]*>/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null && elements.length < 50) {
      elements.push({
        element: match[0],
        type: 'potential_ai_element'
      });
    }
  });
  
  return elements;
}

module.exports = {
  balancedAIInstrumentPage,
  extractDOMFunctions,
  extractKeyElements,
  isStaticResource,
  isDisplayContent,
  processFrameContent,
  processAllFrames
};
