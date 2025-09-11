// optimized_ai_instrumentation.js
// Lightweight instrumentation focused on AI detection with minimal data capture

const { DataQueue } = require('./helpers');

/**
 * AI-focused patterns for filtering relevant data
 */
const AI_PATTERNS = {
  domains: [
    'openai.com', 'api.openai.com', 'anthropic.com', 'claude.ai',
    'cohere.ai', 'huggingface.co', 'replicate.com', 'stability.ai',
    'midjourney.com', 'runwayml.com', 'elevenlabs.io', 'assemblyai.com',
    'deepgram.com', 'speechmatics.com', 'rev.ai', 'otter.ai',
    'jasper.ai', 'copy.ai', 'writesonic.com', 'grammarly.com',
    'notion.so/ai', 'github.com/copilot', 'cursor.sh', 'codeium.com'
  ],
  
  urlPatterns: [
    /\/v1\/chat\/completions/i, /\/v1\/completions/i, /\/generate/i,
    /\/api\/chat/i, /\/api\/completion/i, /\/api\/generate/i,
    /\/anthropic/i, /\/claude/i, /\/gpt/i, /\/openai/i,
    /\/ai\/chat/i, /\/chatbot/i, /\/assistant/i, /\/copilot/i
  ],
  
  libraries: [
    'openai', '@anthropic-ai/sdk', 'langchain', 'llamaindex',
    'transformers', 'huggingface', 'cohere-ai', 'replicate'
  ],
  
  chatbotPatterns: [
    /intercom/i, /zendesk/i, /drift/i, /crisp/i, /freshchat/i,
    /livechat/i, /tidio/i, /hubspot.*chat/i, /messenger/i,
    /chatlio/i, /olark/i, /tawk\.to/i, /widget.*chat/i
  ],
  
  contentKeywords: [
    'chat', 'assistant', 'bot', 'ai', 'gpt', 'claude', 'completion',
    'generate', 'prompt', 'token', 'model', 'inference'
  ]
};

/**
 * Check if a URL is AI-relevant
 */
function isAIRelevantURL(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Check AI domains
  for (const domain of AI_PATTERNS.domains) {
    if (url.includes(domain)) return true;
  }
  
  // Check URL patterns
  for (const pattern of AI_PATTERNS.urlPatterns) {
    if (pattern.test(url)) return true;
  }
  
  // Check chatbot patterns
  for (const pattern of AI_PATTERNS.chatbotPatterns) {
    if (pattern.test(url)) return true;
  }
  
  return false;
}

/**
 * Check if request headers indicate AI usage
 */
function hasAIHeaders(headers) {
  if (!headers || typeof headers !== 'object') return false;
  
  const headerStr = JSON.stringify(headers).toLowerCase();
  return AI_PATTERNS.contentKeywords.some(keyword => 
    headerStr.includes(keyword)
  );
}

/**
 * Extract essential data from request/response for AI detection
 */
function extractEssentialData(data, type = 'request') {
  const essential = {
    timestamp: Date.now(),
    url: data.url,
    type: type
  };
  
  if (type === 'request') {
    essential.method = data.method;
    essential.hasPostData = !!data.postData;
    
    // Only capture post data if it's AI-relevant and small
    if (data.postData && data.postData.length < 10000) {
      const postStr = data.postData.toLowerCase();
      if (AI_PATTERNS.contentKeywords.some(keyword => postStr.includes(keyword))) {
        essential.postDataPreview = data.postData.substring(0, 1000);
        essential.containsAIKeywords = true;
      }
    }
    
    // Only capture relevant headers
    if (data.headers && hasAIHeaders(data.headers)) {
      essential.relevantHeaders = {};
      Object.keys(data.headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('auth') || lowerKey.includes('api') || 
            lowerKey.includes('content-type') || lowerKey.includes('user-agent')) {
          essential.relevantHeaders[key] = data.headers[key];
        }
      });
    }
  } else if (type === 'response') {
    essential.status = data.status;
    essential.mimeType = data.mimeType;
    
    // Only capture response preview if it's small and AI-relevant
    if (data.bodyPreview && data.bodyPreview.length < 5000) {
      const bodyStr = data.bodyPreview.toLowerCase();
      if (AI_PATTERNS.contentKeywords.some(keyword => bodyStr.includes(keyword))) {
        essential.bodyPreview = data.bodyPreview.substring(0, 1000);
        essential.containsAIContent = true;
      }
    }
    
    // Capture relevant response headers
    if (data.headers) {
      essential.relevantHeaders = {};
      Object.keys(data.headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('content-type') || lowerKey.includes('api') ||
            lowerKey.includes('rate-limit') || lowerKey.includes('model')) {
          essential.relevantHeaders[key] = data.headers[key];
        }
      });
    }
  }
  
  return essential;
}

/**
 * Optimized page instrumentation focused on AI detection
 */
async function optimizedAIInstrumentPage(page, queues) {
  const {
    networkQueue,
    responseQueue,
    consoleQueue,
    debugQueue,
    interactionQueue,
  } = queues;

  // Simplified CDP session setup
  let client;
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    const target = page.target();
    if (!target) {
      throw new Error('No page target available');
    }
    client = await target.createCDPSession();
    
    // Enable only essential domains
    await client.send('Network.enable');
    await client.send('Runtime.enable');
    console.log('✅ Optimized AI instrumentation enabled');
  } catch (error) {
    throw new Error(`Failed to create optimized CDP session: ${error.message}`);
  }

  // Track only AI-relevant network requests
  client.on('Network.requestWillBeSent', async (params) => {
    try {
      const url = params.request.url;
      
      // Skip non-AI relevant requests
      if (!isAIRelevantURL(url) && !hasAIHeaders(params.request.headers) && 
          params.request.method === 'GET' && !params.request.postData) {
        return;
      }
      
      // Get post data only for relevant requests
      let postData = params.request.postData || null;
      if (!postData && (params.request.method === 'POST' || params.request.method === 'PUT')) {
        try {
          const req = await client.send('Network.getRequestPostData', { requestId: params.requestId });
          if (req.postData) postData = req.postData;
        } catch {}
      }
      
      const requestData = {
        ...extractEssentialData({
          url,
          method: params.request.method,
          headers: params.request.headers,
          postData
        }, 'request'),
        requestId: params.requestId,
        frameId: params.frameId,
        resourceType: params.type,
        initiator: params.initiator?.type || 'unknown',
        isAIRelevant: isAIRelevantURL(url),
        hasAIHeaders: hasAIHeaders(params.request.headers)
      };
      
      networkQueue?.enqueue?.(requestData);
      
      // Log potential AI interactions
      if (requestData.isAIRelevant || requestData.containsAIKeywords) {
        interactionQueue?.enqueue?.({
          event: 'aiInteractionDetected',
          type: 'network_request',
          ...requestData,
          detectionReason: requestData.isAIRelevant ? 'AI domain/pattern' : 'AI keywords in payload'
        });
      }
      
    } catch (error) {
      console.warn(`⚠️  Error processing AI-relevant request: ${error.message}`);
    }
  });

  // Track only AI-relevant responses
  client.on('Network.responseReceived', async (params) => {
    try {
      const { response, requestId } = params;
      
      // Skip non-AI relevant responses
      if (!isAIRelevantURL(response.url)) {
        return;
      }
      
      let bodyPreview;
      // Only get response body for AI-relevant responses and limit size
      try {
        const bodyObj = await client.send('Network.getResponseBody', { requestId });
        if (bodyObj && bodyObj.body) {
          const raw = bodyObj.base64Encoded
            ? Buffer.from(bodyObj.body, 'base64')
            : Buffer.from(bodyObj.body, 'utf8');
          // Much smaller preview for AI detection
          const cap = 5000; // 5KB instead of 1MB
          bodyPreview = raw.subarray(0, Math.min(raw.length, cap)).toString('utf8');
        }
      } catch {}

      const responseData = {
        ...extractEssentialData({
          url: response.url,
          status: response.status,
          headers: response.headers,
          mimeType: response.mimeType,
          bodyPreview
        }, 'response'),
        requestId,
        frameId: params.frameId,
        isAIRelevant: true
      };
      
      responseQueue?.enqueue?.(responseData);
      
      // Log AI content detection
      if (responseData.containsAIContent) {
        interactionQueue?.enqueue?.({
          event: 'aiContentDetected',
          type: 'network_response',
          ...responseData,
          detectionReason: 'AI keywords in response content'
        });
      }
      
    } catch (error) {
      console.warn(`⚠️  Error processing AI-relevant response: ${error.message}`);
    }
  });

  // Capture only AI-relevant console messages
  page.on('console', msg => {
    try {
      const text = msg.text();
      const isAIRelated = AI_PATTERNS.contentKeywords.some(keyword => 
        text.toLowerCase().includes(keyword)
      ) || AI_PATTERNS.chatbotPatterns.some(pattern => 
        pattern.test(text)
      );
      
      if (isAIRelated || msg.type() === 'error') {
        consoleQueue?.enqueue?.({
          event: 'console',
          type: msg.type(),
          text: text.substring(0, 500), // Limit console message length
          location: msg.location(),
          timestamp: Date.now(),
          isAIRelated,
          isError: msg.type() === 'error'
        });
      }
    } catch (error) {
      console.warn(`⚠️  Error processing console message: ${error.message}`);
    }
  });

  // Capture only critical page errors
  page.on('pageerror', error => {
    try {
      const errorMessage = error.message;
      // Only capture errors that might be related to AI functionality
      const isRelevantError = AI_PATTERNS.contentKeywords.some(keyword => 
        errorMessage.toLowerCase().includes(keyword)
      ) || errorMessage.includes('fetch') || errorMessage.includes('api');
      
      if (isRelevantError) {
        consoleQueue?.enqueue?.({
          event: 'pageerror',
          message: errorMessage.substring(0, 500),
          stack: error.stack ? error.stack.substring(0, 1000) : null,
          timestamp: Date.now(),
          isAIRelated: true
        });
      }
    } catch {}
  });

  // Simplified cleanup
  return {
    client,
    cleanup: () => {
      // Minimal cleanup needed
    }
  };
}

/**
 * Detect AI libraries in page context
 */
async function detectAILibraries(page) {
  try {
    const libraries = await page.evaluate(() => {
      const detected = [];
      
      // Check for common AI libraries in window object
      const checkPatterns = [
        'openai', 'OpenAI', 'anthropic', 'Anthropic', 'cohere', 'Cohere',
        'langchain', 'LangChain', 'huggingface', 'transformers'
      ];
      
      checkPatterns.forEach(pattern => {
        if (window[pattern] || (window.require && window.require.resolve)) {
          try {
            if (window.require && window.require.resolve(pattern)) {
              detected.push(pattern);
            }
          } catch {}
        }
        
        // Check in global scope
        if (typeof window[pattern] !== 'undefined') {
          detected.push(pattern);
        }
      });
      
      // Check script tags for AI library imports
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      scripts.forEach(script => {
        const src = script.src.toLowerCase();
        checkPatterns.forEach(pattern => {
          if (src.includes(pattern.toLowerCase())) {
            detected.push(`${pattern} (script)`);
          }
        });
      });
      
      return detected;
    });
    
    return libraries;
  } catch (error) {
    console.warn(`⚠️  Error detecting AI libraries: ${error.message}`);
    return [];
  }
}

module.exports = {
  optimizedAIInstrumentPage,
  detectAILibraries,
  isAIRelevantURL,
  hasAIHeaders,
  extractEssentialData,
  AI_PATTERNS
};
