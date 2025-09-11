// function_tracker.js
// Advanced JavaScript function tracking system with stack traces and parameter monitoring

/**
 * Comprehensive function tracking system that:
 * 1. Overwrites JavaScript functions to capture stack traces
 * 2. Tracks parameters, return values, and execution context
 * 3. Monitors event listeners and their triggers
 * 4. Links function calls to network requests
 * 5. Captures function source code and metadata
 */

class FunctionTracker {
  constructor(page, functionTrackingQueue, networkQueue) {
    this.page = page;
    this.functionTrackingQueue = functionTrackingQueue;
    this.networkQueue = networkQueue;
    this.trackedFunctions = new Map();
    this.networkRequestMap = new Map();
    this.eventListenerMap = new Map();
    this.functionCallId = 0;
  }

  /**
   * Initialize function tracking by injecting tracking code into the page
   */
  async initialize() {
    try {
      // Inject the function tracking script into the page
      await this.page.evaluateOnNewDocument(() => {
        // Initialize comprehensive function tracker
        window.__functionTracker = {
          callId: 0,
          calls: [],
          eventListeners: [],
          functionToRequestMap: new Map(),
          activeNetworkRequests: new Map(), // requestId -> {url, method, timestamp}
          hijackedFunctions: new Set(), // Track what we've already hijacked
          originalFunctions: new Map(), // Store original function references
          variableCapture: {
            maxDepth: 3, // How deep to serialize objects
            maxArrayLength: 10, // Max array elements to capture
            maxStringLength: 1000 // Max string length to capture
          }
        };

        // Helper function to get stack trace
        window.__getStackTrace = function() {
          const stack = new Error().stack;
          return stack ? stack.split('\n').slice(2) : [];
        };

        // Enhanced deep variable serialization
        window.__serializeValue = function(value, depth = 0, maxDepth = 3) {
          const config = window.__functionTracker.variableCapture;
          
          if (depth > maxDepth) return { type: 'max_depth_reached', depth };
          if (value === null) return { type: 'null', value: null };
          if (value === undefined) return { type: 'undefined', value: undefined };
          
          const type = typeof value;
          
          try {
            if (type === 'function') {
              return {
                type: 'function',
                name: value.name || 'anonymous',
                source: value.toString().substring(0, config.maxStringLength),
                prototype: value.prototype ? Object.getOwnPropertyNames(value.prototype) : [],
                properties: Object.getOwnPropertyNames(value).slice(0, 10)
              };
            }
            
            if (type === 'object') {
              if (Array.isArray(value)) {
                return {
                  type: 'array',
                  length: value.length,
                  elements: value.slice(0, config.maxArrayLength).map(el => 
                    window.__serializeValue(el, depth + 1, maxDepth)
                  )
                };
              }

              if (value instanceof Date) {
                return { type: 'date', value: value.toISOString() };
              }
              
              if (value instanceof Error) {
                return {
                  type: 'error',
                  name: value.name,
                  message: value.message,
                  stack: value.stack
                };
              }
              
              // Regular object - capture properties recursively
              const obj = {
                type: 'object',
                constructor: value.constructor ? value.constructor.name : 'Object',
                properties: {}
              };
              
              const keys = Object.getOwnPropertyNames(value).slice(0, 20);
              for (const key of keys) {
                try {
                  obj.properties[key] = window.__serializeValue(value[key], depth + 1, maxDepth);
                } catch (e) {
                  obj.properties[key] = { type: 'error', message: e.message };
                }
              }
              
              return obj;
            }
            
            if (type === 'string') {
              return {
                type: 'string',
                value: value.substring(0, config.maxStringLength),
                length: value.length,
                truncated: value.length > config.maxStringLength
              };
            }
            
            return {
              type: type,
              value: value
            };
          } catch (e) {
            return {
              type: 'serialization_error',
              error: e.message
            };
          }
        };
        
        // Function to serialize parameters with full data capture
        window.__serializeParams = function(params) {
          return params.map((param, index) => ({
            paramIndex: index,
            ...window.__serializeValue(param)
          }));
        };

        // Enhanced function hijacking with stack trace capture
        window.__wrapFunction = function(obj, funcName, originalFunc) {
          return function(...args) {
            const callId = ++window.__functionTracker.callId;
            const serializedParams = window.__serializeParams(args);
            
            // HIJACK: Throw error to capture complete stack trace with variable context
            let completeStackTrace = [];
            let callChainData = [];
            let variableContext = {};
            
            try {
              throw new Error('STACK_TRACE_CAPTURE');
            } catch (e) {
              completeStackTrace = e.stack.split('\n');
              
              // Parse stack trace and attempt to capture variable context
              callChainData = completeStackTrace.slice(1).map((line, index) => {
                const match = line.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || 
                             line.match(/at\s+(.*):(.*):(\d+):(\d+)/) ||
                             line.match(/at\s+(.*)/); 
                
                const frameData = {
                  level: index,
                  functionName: match ? (match[1] || 'anonymous') : 'unknown',
                  fileName: match ? (match[2] || 'unknown') : 'unknown',
                  lineNumber: match ? (parseInt(match[3]) || 0) : 0,
                  columnNumber: match ? (parseInt(match[4]) || 0) : 0,
                  rawLine: line.trim(),
                  variables: {}
                };
                
                // Attempt to capture local variables (limited by JS security)
                try {
                  // Capture arguments object if available
                  if (typeof arguments !== 'undefined') {
                    frameData.variables.arguments = window.__serializeValue(arguments, 0, 2);
                  }
                  
                  // Capture 'this' context
                  if (this !== undefined && this !== null) {
                    frameData.variables.thisContext = window.__serializeValue(this, 0, 1);
                  }
                  
                  // Try to capture some global context
                  if (typeof window !== 'undefined' && index === 0) {
                    frameData.variables.globalContext = {
                      url: window.location?.href,
                      userAgent: navigator?.userAgent?.substring(0, 100),
                      timestamp: Date.now()
                    };
                  }
                } catch (varError) {
                  frameData.variables.captureError = varError.message;
                }
                
                return frameData;
              }).filter(item => !item.functionName.includes('__wrapFunction') && 
                              !item.functionName.includes('__serializeValue')); // Remove our wrappers
            }
            
            // Log function call with complete stack trace data
            const callInfo = {
              callId,
              functionName: funcName,
              objectName: obj.constructor ? obj.constructor.name : 'unknown',
              parameters: serializedParams,
              completeStackTrace: completeStackTrace, // Full raw stack
              callChain: callChainData, // Parsed call hierarchy
              calledFrom: callChainData[0] || { functionName: 'unknown' },
              callDepth: callChainData.length,
              url: window.location.href,
              timestamp: Date.now(),
              triggeredNetworkRequests: [],
              dataFlow: {
                inputData: serializedParams,
                executionContext: {
                  thisValue: window.__serializeValue(this, 0, 2),
                  arguments: {
                    count: args.length,
                    values: serializedParams
                  },
                  scope: typeof window !== 'undefined' ? 'window' : 'unknown',
                  localVariables: variableContext
                },
                callChainVariables: callChainData.map(frame => ({
                  level: frame.level,
                  functionName: frame.functionName,
                  variables: frame.variables
                }))
              }
            };

            window.__functionTracker.calls.push(callInfo);

            try {
              // Track network requests that happen during this function call
              const requestsBefore = new Set(window.__functionTracker.activeNetworkRequests.keys());
              
              // Call original function
              const result = originalFunc.apply(this, args);
              
              // Capture data flow output
              callInfo.dataFlow.outputData = {
                type: typeof result,
                value: String(result),
                isPromise: result && typeof result.then === 'function'
              };
              
              // Check for new network requests triggered by this function
              setTimeout(() => {
                const requestsAfter = new Set(window.__functionTracker.activeNetworkRequests.keys());
                const newRequests = [...requestsAfter].filter(id => !requestsBefore.has(id));
                if (newRequests.length > 0) {
                  callInfo.triggeredNetworkRequests = newRequests;
                  callInfo.dataFlow.networkActivity = {
                    requestCount: newRequests.length,
                    requestIds: newRequests
                  };
                  // Map these requests back to this function call
                  newRequests.forEach(requestId => {
                    window.__functionTracker.functionToRequestMap.set(requestId, callId);
                  });
                }
              }, 100);
              
              return result;
            } catch (error) {
              callInfo.success = false;
              callInfo.error = error.message;
              callInfo.errorStack = error.stack;
              
              // Capture error context with stack trace
              callInfo.dataFlow.errorContext = {
                errorType: error.constructor.name,
                errorMessage: error.message,
                errorStack: error.stack,
                thrownAt: Date.now(),
                functionState: {
                  parameters: serializedParams,
                  callChain: callChainData
                }
              };
              
              throw error;
            }
          };
        };

        // Comprehensive function hijacking for ALL functions
        const hijackAllFunctions = function() {
          // Track what we've already hijacked to avoid infinite loops
          const hijacked = window.__functionTracker.hijackedFunctions;
          const originals = window.__functionTracker.originalFunctions;
          
          // Hijack function constructor to catch dynamically created functions
          if (!hijacked.has('Function.constructor')) {
            const originalFunction = window.Function;
            window.Function = function(...args) {
              const func = originalFunction.apply(this, args);
              const wrappedFunc = window.__wrapFunction(window, 'dynamic_function', func);
              hijacked.add(`dynamic_${Date.now()}`);
              return wrappedFunc;
            };
            hijacked.add('Function.constructor');
          }
          
          // Hijack eval to catch eval'd functions
          if (!hijacked.has('eval') && typeof window.eval === 'function') {
            originals.set('eval', window.eval);
            window.eval = window.__wrapFunction(window, 'eval', originals.get('eval'));
            hijacked.add('eval');
          }
          
          // Comprehensive global object hijacking
          const globalTargets = [
            { obj: window, name: 'window', deep: false },
            { obj: document, name: 'document', deep: true },
            { obj: XMLHttpRequest.prototype, name: 'XMLHttpRequest.prototype', deep: true },
            { obj: EventTarget.prototype, name: 'EventTarget.prototype', deep: true },
            { obj: Element.prototype, name: 'Element.prototype', deep: true },
            { obj: Node.prototype, name: 'Node.prototype', deep: true },
            { obj: HTMLElement.prototype, name: 'HTMLElement.prototype', deep: true },
            { obj: Array.prototype, name: 'Array.prototype', deep: true },
            { obj: Object.prototype, name: 'Object.prototype', deep: false }, // Be careful with Object.prototype
            { obj: Promise.prototype, name: 'Promise.prototype', deep: true }
          ];

          // Hijack fetch separately (it's a function, not a method)
          if (!hijacked.has('fetch') && typeof window.fetch === 'function') {
            originals.set('fetch', window.fetch);
            window.fetch = window.__wrapFunction(window, 'fetch', originals.get('fetch'));
            hijacked.add('fetch');
          }

          globalTargets.forEach(({ obj, name, deep }) => {
            if (!obj) return;
            
            try {
              const props = deep ? 
                [...Object.getOwnPropertyNames(obj), ...Object.getOwnPropertyNames(Object.getPrototypeOf(obj) || {})] :
                Object.getOwnPropertyNames(obj);
              
              props.forEach(prop => {
                const hijackKey = `${name}.${prop}`;
                if (hijacked.has(hijackKey)) return;
                
                try {
                  const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
                  if (descriptor && typeof descriptor.value === 'function' && descriptor.configurable) {
                    const originalFunc = descriptor.value;
                    originals.set(hijackKey, originalFunc);
                    const wrappedFunc = window.__wrapFunction(obj, hijackKey, originalFunc);
                    
                    Object.defineProperty(obj, prop, {
                      ...descriptor,
                      value: wrappedFunc
                    });
                    
                    hijacked.add(hijackKey);
                  }
                } catch (e) {
                  // Skip properties that can't be hijacked (non-configurable, etc.)
                }
              });
            } catch (e) {
              // Skip objects that can't be introspected
            }
          });
          
          // Hijack setTimeout, setInterval, requestAnimationFrame
          ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback'].forEach(funcName => {
            if (!hijacked.has(funcName) && typeof window[funcName] === 'function') {
              originals.set(funcName, window[funcName]);
              window[funcName] = window.__wrapFunction(window, funcName, originals.get(funcName));
              hijacked.add(funcName);
            }
          });
        };

        // Initialize comprehensive hijacking
        hijackAllFunctions();
        
        // Monitor for new functions being added to the global scope
        const observeNewFunctions = function() {
          // Re-hijack periodically to catch dynamically added functions
          setInterval(hijackAllFunctions, 2000);
          
          // Use MutationObserver to detect script additions
          if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'SCRIPT') {
                      // New script added, re-hijack after a delay
                      setTimeout(hijackAllFunctions, 100);
                    }
                  });
                }
              });
            });
            
            observer.observe(document, {
              childList: true,
              subtree: true
            });
          }
        };
        
        // Start observing
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', observeNewFunctions);
        } else {
          observeNewFunctions();
        }

        // Track event listeners with data flow focus
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          const listenerId = ++window.__functionTracker.callId;
          
          // Wrap the listener function with comprehensive tracking
          const wrappedListener = function(event) {
            const eventCallId = ++window.__functionTracker.callId;
            
            // Capture complete event context and variables
            let eventStackTrace = [];
            let eventVariables = {};
            
            try {
              throw new Error('EVENT_STACK_CAPTURE');
            } catch (e) {
              eventStackTrace = e.stack.split('\n').slice(1);
              
              // Capture event-specific variables
              eventVariables = {
                eventObject: window.__serializeValue(event, 0, 2),
                thisContext: window.__serializeValue(this, 0, 1),
                listenerFunction: window.__serializeValue(listener, 0, 1),
                globalState: {
                  url: window.location?.href,
                  timestamp: Date.now(),
                  documentReadyState: document?.readyState
                }
              };
            }
            
            // Log event listener execution with complete data flow
            const eventInfo = {
              callId: eventCallId,
              listenerId: listenerId,
              eventType: type,
              target: this.tagName || this.constructor.name,
              eventData: window.__serializeValue({
                type: event.type,
                target: event.target,
                currentTarget: event.currentTarget,
                timestamp: event.timeStamp || Date.now(),
                coordinates: event.clientX !== undefined ? { x: event.clientX, y: event.clientY } : null,
                key: event.key || null,
                button: event.button !== undefined ? event.button : null,
                detail: event.detail,
                bubbles: event.bubbles,
                cancelable: event.cancelable
              }, 0, 2),
              completeStackTrace: eventStackTrace,
              eventVariables: eventVariables,
              stackTrace: window.__getStackTrace().slice(0, 5),
              url: window.location.href,
              timestamp: Date.now(),
              triggeredNetworkRequests: [],
              dataFlow: {
                inputEvent: eventVariables.eventObject,
                executionContext: eventVariables.thisContext,
                listenerDetails: eventVariables.listenerFunction
              }
            };

            window.__functionTracker.eventListeners.push(eventInfo);

            try {
              // Track network requests triggered by this event
              const requestsBefore = new Set(window.__functionTracker.activeNetworkRequests.keys());
              
              const result = listener.call(this, event);
              
              // Capture return value
              eventInfo.dataFlow.outputData = window.__serializeValue(result, 0, 1);
              
              // Check for new network requests triggered by this event
              setTimeout(() => {
                const requestsAfter = new Set(window.__functionTracker.activeNetworkRequests.keys());
                const newRequests = [...requestsAfter].filter(id => !requestsBefore.has(id));
                if (newRequests.length > 0) {
                  eventInfo.triggeredNetworkRequests = newRequests;
                  eventInfo.dataFlow.networkActivity = {
                    requestCount: newRequests.length,
                    requestIds: newRequests
                  };
                  newRequests.forEach(requestId => {
                    window.__functionTracker.functionToRequestMap.set(requestId, eventCallId);
                  });
                }
              }, 100);
              
              return result;
            } catch (error) {
              eventInfo.error = error.message;
              eventInfo.errorStack = error.stack;
              eventInfo.dataFlow.errorContext = {
                errorType: error.constructor.name,
                errorMessage: error.message,
                errorStack: error.stack,
                eventState: eventVariables
              };
              throw error;
            }
          };

          // Store listener info
          window.__functionTracker.eventListeners.push({
            callId: listenerId,
            type: type,
            target: this.tagName || this.constructor.name,
            listener: listener.name || 'anonymous',
            options: options,
            timestamp: Date.now()
          });

          return originalAddEventListener.call(this, type, wrappedListener, options);
        };
      });
    } catch (error) {
      console.error('❌ Error initializing function tracker:', error.message);
    }
  }

  /**
   * Track commonly used JavaScript functions
   */
  async trackCommonFunctions() {
    await this.page.evaluate(() => {
      // Track fetch API with network request correlation
      if (window.fetch) {
        const originalFetch = window.fetch;
        window.__functionTracker.originalFunctions.set('fetch', originalFetch);
        window.fetch = function(...args) {
          const callId = ++window.__functionTracker.callId;
          const url = args[0];
          const options = args[1] || {};
          
          // Create a unique request identifier
          const requestId = 'fetch_' + callId + '_' + Date.now();
          
          // Track this as an active request
          window.__functionTracker.activeNetworkRequests.set(requestId, {
            type: 'fetch',
            url: url,
            method: options.method || 'GET',
            callId: callId,
            timestamp: Date.now()
          });
          
          const result = originalFetch.apply(this, args);
          
          // Track the promise resolution
          if (result && typeof result.then === 'function') {
            result.then(
              (response) => {
                // Update request info with response
                const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
                if (requestInfo) {
                  requestInfo.status = response.status;
                  requestInfo.statusText = response.statusText;
                  requestInfo.completed = Date.now();
                }
              },
              (error) => {
                // Update request info with error
                const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
                if (requestInfo) {
                  requestInfo.error = error.message;
                  requestInfo.completed = Date.now();
                }
              }
            );
          }
          
          return result;
        };
      }

      // Track XMLHttpRequest with network request correlation
      if (window.XMLHttpRequest) {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        
        window.__functionTracker.originalFunctions.set('XMLHttpRequest.open', originalOpen);
        window.__functionTracker.originalFunctions.set('XMLHttpRequest.send', originalSend);
        
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          const callId = ++window.__functionTracker.callId;
          const requestId = 'xhr_' + callId + '_' + Date.now();
          
          // Store request ID on the XHR object
          this._requestId = requestId;
          
          // Track this as an active request
          window.__functionTracker.activeNetworkRequests.set(requestId, {
            type: 'XMLHttpRequest',
            method: method,
            url: url,
            callId: callId,
            timestamp: Date.now()
          });
          
          return originalOpen.call(this, method, url, async, user, password);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
          const requestId = this._requestId;
          const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
          
          if (requestInfo) {
            requestInfo.data = data;
            requestInfo.sent = Date.now();
          }
          
          // Add event listeners to track completion
          this.addEventListener('loadend', () => {
            if (requestInfo) {
              requestInfo.status = this.status;
              requestInfo.statusText = this.statusText;
              requestInfo.responseURL = this.responseURL;
              requestInfo.completed = Date.now();
            }
          });
          
          return originalSend.call(this, data);
        };
      }

      // Track common DOM methods
      const domMethods = [
        'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
        'createElement', 'appendChild', 'removeChild', 'insertBefore'
      ];

      domMethods.forEach(method => {
        if (document[method]) {
          const original = document[method];
          window.__functionTracker.originalFunctions.set(`document.${method}`, original);
          document[method] = window.__wrapFunction(document, `document.${method}`, original);
        }
      });

      // Track console methods
      const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'];
      consoleMethods.forEach(method => {
        if (console[method]) {
          const original = console[method];
          window.__functionTracker.originalFunctions.set(`console.${method}`, original);
          console[method] = window.__wrapFunction(console, `console.${method}`, original);
        }
      });

      // Track setTimeout and setInterval
      if (window.setTimeout) {
        const originalSetTimeout = window.setTimeout;
        window.__functionTracker.originalFunctions.set('setTimeout', originalSetTimeout);
        window.setTimeout = window.__wrapFunction(window, 'setTimeout', originalSetTimeout);
      }

      if (window.setInterval) {
        const originalSetInterval = window.setInterval;
        window.__functionTracker.originalFunctions.set('setInterval', originalSetInterval);
        window.setInterval = window.__wrapFunction(window, 'setInterval', originalSetInterval);
      }
    });
  }

  /**
   * Set up periodic collection of tracking data
   */
  async setupPeriodicCollection() {
    // Collect data every 5 seconds
    const collectData = async () => {
      try {
        const trackingData = await this.page.evaluate(() => {
          const data = {
            functionCalls: window.__functionTracker.calls.splice(0),
            eventListeners: window.__functionTracker.eventListeners.splice(0),
            timestamp: Date.now(),
            url: window.location.href
          };
          return data;
        });

        // Log collected data
        if (trackingData.functionCalls.length > 0 || trackingData.eventListeners.length > 0) {
          this.functionTrackingQueue.enqueue({
            event: 'functionTrackingData',
            data: trackingData,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.warn('⚠️  Error collecting function tracking data:', error.message);
      }
    };

    // Start periodic collection
    this.collectionInterval = setInterval(collectData, 5000);
    
    // Also collect on page navigation
    this.page.on('framenavigated', collectData);
  }

  /**
   * Track specific functions by name or pattern
   */
  async trackSpecificFunction(functionPath, options = {}) {
    const { captureSource = true, captureParams = true, captureReturn = true } = options;
    
    await this.page.evaluate((path, opts) => {
      try {
        // Navigate to the function using the path (e.g., 'window.myFunction' or 'document.getElementById')
        const pathParts = path.split('.');
        let obj = window;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          obj = obj[pathParts[i]];
          if (!obj) return false;
        }
        
        const funcName = pathParts[pathParts.length - 1];
        const originalFunc = obj[funcName];
        
        if (typeof originalFunc !== 'function') {
          console.warn(`${path} is not a function`);
          return false;
        }

        // Store original function
        window.__functionTracker.originalFunctions.set(path, originalFunc);
        
        // Replace with wrapped version
        obj[funcName] = window.__wrapFunction(obj, path, originalFunc);
        
        return true;
      } catch (error) {
        console.error(`Failed to track function ${path}:`, error.message);
        return false;
      }
    }, functionPath, options);
  }

  /**
   * Link function calls with network requests
   */
  linkWithNetworkRequests(networkRequestData) {
    // Store network request data for correlation
    this.networkRequestMap.set(networkRequestData.requestId, {
      ...networkRequestData,
      timestamp: Date.now()
    });
  }

  /**
   * Get comprehensive tracking report
   */
  async getTrackingReport() {
    try {
      const finalData = await this.page.evaluate(() => {
        return {
          functionCalls: window.__functionTracker.calls,
          eventListeners: window.__functionTracker.eventListeners,
          trackedFunctions: Array.from(window.__functionTracker.originalFunctions.keys()),
          totalCalls: window.__functionTracker.callId,
          url: window.location.href,
          timestamp: Date.now()
        };
      });

      return {
        ...finalData,
        networkRequests: Array.from(this.networkRequestMap.values()),
        summary: {
          totalFunctionCalls: finalData.functionCalls.length,
          totalEventListeners: finalData.eventListeners.length,
          totalNetworkRequests: this.networkRequestMap.size,
          trackedFunctionCount: finalData.trackedFunctions.length
        }
      };
    } catch (error) {
      console.error('❌ Error generating tracking report:', error.message);
      return null;
    }
  }

  /**
   * Cleanup tracking resources
   */
  cleanup() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
  }
}

module.exports = { FunctionTracker };
