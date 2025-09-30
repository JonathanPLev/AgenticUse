// instrumentation-core.js
// Consolidated instrumentation: enhanced_instrumentation_optimized.js + function_tracker.js + enhanced_network_tracer.js + streaming_response_processor.js
// Reduces 4 files (~95KB) into 1 optimized module

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { QueueManager, DataQueue } = require('./utils.js');

// ===== STREAMING RESPONSE PROCESSOR =====
class StreamingResponseProcessor {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.responseStreams = new Map();
    this.responseMetadata = new Map();
    this.responseBuffers = new Map();
  }

  generateResponseFilename(requestId, url, mimeType) {
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    const extension = this.getExtensionFromMimeType(mimeType);
    return `response_${requestId}_${urlHash}${extension}`;
  }

  getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'application/json': '.json', 'text/html': '.html', 'text/css': '.css',
      'application/javascript': '.js', 'text/javascript': '.js',
      'application/xml': '.xml', 'text/xml': '.xml', 'text/plain': '.txt',
      'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
      'image/gif': '.gif', 'image/svg+xml': '.svg'
    };
    return mimeMap[mimeType] || '.bin';
  }

  bufferResponseData(requestId, data, dataLength) {
    if (!this.responseBuffers.has(requestId)) {
      this.responseBuffers.set(requestId, []);
    }
    this.responseBuffers.get(requestId).push(data);
  }

  async finalizeResponse(requestId, url, mimeType, headers) {
    const buffers = this.responseBuffers.get(requestId);
    if (!buffers || buffers.length === 0) return null;

    try {
      const filename = this.generateResponseFilename(requestId, url, mimeType);
      const filepath = path.join(this.outputDir, filename);
      
      const combinedBuffer = Buffer.concat(buffers.map(b => Buffer.from(b, 'base64')));
      await fs.promises.writeFile(filepath, combinedBuffer);
      
      this.responseBuffers.delete(requestId);
      return { filename, size: combinedBuffer.length, filepath };
    } catch (error) {
      console.error(`Error finalizing response ${requestId}:`, error);
      return null;
    }
  }
}

// ===== ENHANCED NETWORK TRACER =====
class EnhancedNetworkTracer {
  constructor(page, networkQueue) {
    this.page = page;
    this.networkQueue = networkQueue;
    this.requestCorrelations = new Map();
    this.functionSourceCache = new Map();
  }

  async initialize() {
    await this.page.evaluateOnNewDocument(() => {
      window.__networkTracer = {
        correlations: new Map(),
        requestId: 0,
        
        captureStackTrace: function() {
          try {
            throw new Error('Stack trace capture');
          } catch (e) {
            return { stack: e.stack, timestamp: Date.now(), url: window.location.href };
          }
        },
        
        extractFunctionSource: function(stackTrace) {
          const sources = [];
          const lines = stackTrace.split('\n');
          for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const line = lines[i].trim();
            if (line && !line.includes('chrome-extension://')) {
              sources.push(line);
            }
          }
          return sources;
        }
      };

      // Override fetch
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const trace = window.__networkTracer.captureStackTrace();
        const correlationId = ++window.__networkTracer.requestId;
        window.__networkTracer.correlations.set(correlationId, {
          type: 'fetch',
          args: args.map(arg => typeof arg === 'string' ? arg : '[object]'),
          stackTrace: trace,
          functionSources: window.__networkTracer.extractFunctionSource(trace.stack)
        });
        return originalFetch.apply(this, args);
      };

      // Override XMLHttpRequest
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const trace = window.__networkTracer.captureStackTrace();
        const correlationId = ++window.__networkTracer.requestId;
        
        const originalOpen = xhr.open;
        xhr.open = function(method, url, ...args) {
          window.__networkTracer.correlations.set(correlationId, {
            type: 'xhr',
            method,
            url,
            stackTrace: trace,
            functionSources: window.__networkTracer.extractFunctionSource(trace.stack)
          });
          return originalOpen.apply(this, [method, url, ...args]);
        };
        return xhr;
      };
    });
  }

  async getCorrelations() {
    try {
      return await this.page.evaluate(() => {
        if (!window.__networkTracer) return [];
        return Array.from(window.__networkTracer.correlations.entries());
      });
    } catch (error) {
      return [];
    }
  }
}

// ===== FUNCTION TRACKER =====
class FunctionTracker {
  constructor(page, functionTrackingQueue, networkQueue) {
    this.page = page;
    this.functionTrackingQueue = functionTrackingQueue;
    this.networkQueue = networkQueue;
    this.trackedFunctions = new Map();
    this.functionCallId = 0;
  }

  async initialize() {
    try {
      await this.page.evaluateOnNewDocument(() => {
        window.__functionTracker = {
          calls: [],
          callId: 0,
          maxCalls: 10000,
          
          wrapFunction: function(obj, funcName, originalFunc) {
            if (typeof originalFunc !== 'function') return originalFunc;
            
            return function(...args) {
              const callId = ++window.__functionTracker.callId;
              const startTime = performance.now();
              
              try {
                throw new Error('Stack capture');
              } catch (e) {
                const stackTrace = e.stack;
                const callInfo = {
                  id: callId,
                  functionName: funcName,
                  objectName: obj.constructor?.name || 'Unknown',
                  timestamp: Date.now(),
                  startTime,
                  args: args.length,
                  stackTrace: stackTrace.split('\n').slice(0, 5).join('\n')
                };
                
                if (window.__functionTracker.calls.length < window.__functionTracker.maxCalls) {
                  window.__functionTracker.calls.push(callInfo);
                }
              }
              
              try {
                const result = originalFunc.apply(this, args);
                return result;
              } catch (error) {
                throw error;
              }
            };
          },
          
          instrumentObject: function(obj, objName) {
            if (!obj || typeof obj !== 'object') return;
            
            const propertiesToWrap = Object.getOwnPropertyNames(obj).concat(
              Object.getOwnPropertyNames(Object.getPrototypeOf(obj) || {})
            );
            
            for (const prop of propertiesToWrap) {
              try {
                if (typeof obj[prop] === 'function' && prop !== 'constructor') {
                  const original = obj[prop];
                  obj[prop] = window.__functionTracker.wrapFunction(obj, `${objName}.${prop}`, original);
                }
              } catch (e) {
                // Skip properties that can't be wrapped
              }
            }
          }
        };

        // Auto-instrument common objects
        if (typeof window.fetch === 'function') {
          window.__functionTracker.instrumentObject(window, 'window');
        }
        if (typeof document !== 'undefined') {
          window.__functionTracker.instrumentObject(document, 'document');
        }
      });
    } catch (error) {
      console.error('Function tracker initialization failed:', error);
    }
  }

  async getFunctionCalls() {
    try {
      return await this.page.evaluate(() => {
        return window.__functionTracker?.calls || [];
      });
    } catch (error) {
      return [];
    }
  }
}

// ===== MAIN INSTRUMENTATION CLASS =====
function createCleanUrlSlug(url) {
  try {
    let cleanUrl = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0];
    
    return cleanUrl
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .substring(0, 100);
  } catch (error) {
    return url.replace(/[^a-zA-Z0-9\-_.]/g, '_').substring(0, 50);
  }
}

async function enhancedInstrumentPage(page, originalUrl, opts = {}) {
  const {
    outputDir = 'data',
    enableFunctionTracking = true,
    enableNetworkTracing = true,
    enableResponseStreaming = true,
    flushInterval = 5000
  } = opts;

  const urlSlug = createCleanUrlSlug(originalUrl);
  const siteDir = path.join(outputDir, urlSlug);
  
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
  }

  // Initialize queues
  const queues = {
    network: new DataQueue(path.join(siteDir, 'network.log')),
    dom: new DataQueue(path.join(siteDir, 'dom.log')),
    console: new DataQueue(path.join(siteDir, 'console.log')),
    debug: new DataQueue(path.join(siteDir, 'debug.log')),
    functionTracking: new DataQueue(path.join(siteDir, 'function_calls.log')),
    responses: new DataQueue(path.join(siteDir, 'responses.log')),
    interactions: new DataQueue(path.join(siteDir, 'interactions.log'))
  };

  // Initialize components
  const responseProcessor = enableResponseStreaming ? new StreamingResponseProcessor(siteDir) : null;
  const networkTracer = enableNetworkTracing ? new EnhancedNetworkTracer(page, queues.network) : null;
  const functionTracker = enableFunctionTracking ? new FunctionTracker(page, queues.functionTracking, queues.network) : null;

  // Initialize trackers
  if (networkTracer) await networkTracer.initialize();
  if (functionTracker) await functionTracker.initialize();

  // Get CDP client
  const client = await page.target().createCDPSession();
  
  // Enable CDP domains with retry logic
  const enableDomain = async (domain, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await client.send(`${domain}.enable`);
        return true;
      } catch (error) {
        if (i === retries - 1) {
          console.warn(`Failed to enable ${domain} after ${retries} attempts:`, error.message);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  };

  await Promise.all([
    enableDomain('Network'),
    enableDomain('Page'),
    enableDomain('Console'),
    enableDomain('Runtime')
  ]);

  // Network event handlers
  client.on('Network.requestWillBeSent', (params) => {
    queues.network.enqueue({
      type: 'requestWillBeSent',
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      timestamp: params.timestamp,
      wallTime: params.wallTime
    });
  });

  client.on('Network.responseReceived', (params) => {
    queues.network.enqueue({
      type: 'responseReceived',
      requestId: params.requestId,
      url: params.response.url,
      status: params.response.status,
      headers: params.response.headers,
      mimeType: params.response.mimeType,
      timestamp: params.timestamp
    });
  });

  client.on('Network.dataReceived', (params) => {
    if (responseProcessor) {
      responseProcessor.bufferResponseData(params.requestId, params.data, params.dataLength);
    }
  });

  client.on('Network.loadingFinished', async (params) => {
    if (responseProcessor) {
      try {
        const response = await client.send('Network.getResponseBody', { requestId: params.requestId });
        const result = await responseProcessor.finalizeResponse(
          params.requestId,
          params.requestId, // URL will be resolved from previous events
          'application/octet-stream',
          {}
        );
        if (result) {
          queues.responses.enqueue({
            requestId: params.requestId,
            filename: result.filename,
            size: result.size,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        // Response body not available or already consumed
      }
    }
  });

  // Console event handlers
  client.on('Console.messageAdded', (params) => {
    queues.console.enqueue({
      level: params.message.level,
      text: params.message.text,
      url: params.message.url,
      line: params.message.line,
      timestamp: Date.now()
    });
  });

  client.on('Runtime.consoleAPICalled', (params) => {
    queues.console.enqueue({
      type: 'consoleAPI',
      level: params.type,
      args: params.args.map(arg => arg.value || arg.description || '[object]'),
      timestamp: params.timestamp,
      executionContextId: params.executionContextId
    });
  });

  // Periodic data collection
  const dataCollectionInterval = setInterval(async () => {
    try {
      // Collect function calls
      if (functionTracker) {
        const calls = await functionTracker.getFunctionCalls();
        calls.forEach(call => queues.functionTracking.enqueue(call));
      }

      // Collect network correlations
      if (networkTracer) {
        const correlations = await networkTracer.getCorrelations();
        correlations.forEach(([id, data]) => {
          queues.debug.enqueue({
            type: 'networkCorrelation',
            correlationId: id,
            data,
            timestamp: Date.now()
          });
        });
      }

      // Flush all queues
      await Promise.all(Object.values(queues).map(queue => queue.flush()));
    } catch (error) {
      console.error('Data collection error:', error);
    }
  }, flushInterval);

  // Return instrumentation interface
  return {
    queues,
    responseProcessor,
    networkTracer,
    functionTracker,
    client,
    
    async cleanup() {
      clearInterval(dataCollectionInterval);
      await Promise.all(Object.values(queues).map(queue => queue.waitForFlush()));
      try {
        await client.detach();
      } catch (error) {
        // CDP session may already be closed
      }
    },
    
    async captureSnapshot() {
      const snapshot = {
        timestamp: Date.now(),
        url: page.url(),
        functionCalls: functionTracker ? await functionTracker.getFunctionCalls() : [],
        networkCorrelations: networkTracer ? await networkTracer.getCorrelations() : []
      };
      queues.debug.enqueue({ type: 'snapshot', data: snapshot });
      return snapshot;
    }
  };
}

module.exports = {
  enhancedInstrumentPage,
  FunctionTracker,
  EnhancedNetworkTracer,
  StreamingResponseProcessor
};
