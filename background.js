// Background script
const pathQueues = {};
window.debuggerAttached = false;
const port = 3000; // Set the port for the server
const batchSend = true;
const batchSize = 1000;
let batchSendingStarted = false;
const pauseBetweenSends = 500; // in milliseconds
const pauseBetweenBatches = 1000; // in milliseconds
const debuggerStore = {};   // Stores Debugger API data
const webRequestStore = {}; // Stores WebRequest API data
const paths = ['iframe', 'networkRequestWillBeSent', 'chromeWebRequest', 'requestMap', 'postMessageSent', 'postMessageReceived', 'script']; // , 'topics'];

if (typeof window.debugMode === 'undefined') {
    window.debugMode = false;
}
function log(text) {
    if (window.debugMode) {
        console.log(text);
    }
}

// Extension installed
chrome.runtime.onInstalled.addListener(function() {
    console.log("Iframe Tracker Extension installed");
});

// Defining class to handle queuing and sending data in batches 
class DataQueue {
    constructor(path) {
        this.path = path;
        this.queue = [];
        this.batchSize = batchSize;
        this.isSending = false;
    }
    enqueue(dataItem) {
        this.queue.push(dataItem);
    }
    getBatch() {
        return this.queue.splice(0, this.batchSize);
    }
    hasItems() {
        return this.queue.length > 0;
    }
    getQueueLength() {
        return this.queue.length;
    }
}

// Initialize queues for each path
paths.forEach(path => {
    pathQueues[path] = new DataQueue(path);
});

function enqueueData(path, data) {
    if (!pathQueues[path]) {
        console.error(`No queue for path: ${path}`);
        return;
    }
    pathQueues[path].enqueue(data);
    console.log("Enqueing queue length:", pathQueues[path].getQueueLength());
}

async function sendBatchForPath(path) {
    if (pathQueues[path].isSending) {
        return;
    }
    if (pathQueues[path].hasItems()) {
        pathQueues[path].isSending = true;
        const dataBatch = pathQueues[path].getBatch();
        if (dataBatch.length === 0) {
            pathQueues[path].isSending = false;
            return;
        }
        try {
            console.log(typeof dataBatch);
            const response = await fetch(`http://localhost:${port}/${path}`, {
                method: 'POST',
                body: JSON.stringify(dataBatch),
                mode: 'cors',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': "application/json;charset=UTF-8"
                }
            });
            if (!response.ok) {
                throw new Error('Network response was not Ok!');
            }
        } catch (error) {
            console.error(`Error sending data for path ${path}:`, error);
        } finally {
            pathQueues[path].isSending = false;
        }
    }
}

async function sendBatches() {
    console.log(`sendBatches: Size of batch ${paths.length}`);
    for (const path of paths) {
        await sendBatchForPath(path);
        await new Promise(resolve => setTimeout(resolve, pauseBetweenSends));
    }
}

// Calling sendBatches() periodically
function startSendingBatches() {
    if (batchSendingStarted) return;
    batchSendingStarted = true;
    function periodicBatchSend() {
        sendBatches().then(() => {
            setTimeout(periodicBatchSend, pauseBetweenBatches);
        }).catch(error => {
            console.error('Error during periodic batch send:', error);
            setTimeout(periodicBatchSend, pauseBetweenBatches);
        });
    }
    setTimeout(periodicBatchSend, pauseBetweenBatches);
}


// Initiating batch sending when the extension loads
startSendingBatches();


// Collecting data to send in batch or individually to localhost server
function sendDataToMyServer(path, data) {
    return new Promise((resolve, reject) => {
        log(path, data);
        fetch(`http://localhost:${port}/${path}`, {
            method: "POST",
            body: JSON.stringify(data),
            mode: 'cors',
            headers: {
                'Access-Control-Allow-Origin': '*',
                "Content-Type": "application/json;charset=UTF-8"
            }
        }).then(res => {
            if (res.ok) {
                log(`${data.messageType} data sent to server.`);
                resolve(res);
            } else {
                throw new Error(`Server responded with status: ${res.status}`);
            }
        }).catch(err => {
            console.error(`Error in sending ${data.messageType}:`, err);
            reject(err);
        });
    });
}


// Adding chrome.runtime.onMessage.addListener()
chrome.runtime.onMessage.addListener(function(details, sender, sendResponse) {
    const validMessageTypes = ['iframe', 'postMessageSent', 'postMessageReceived']; // , 'topics'];
    console.log(`${details.messageType}: `, details);
    if (!validMessageTypes.includes(details.messageType)) {
        console.warn("Received unexpected messageType:", details.messageType);
        return;
    }
    if (batchSend === true) {
        enqueueData(details.messageType, details);
    } else {
        sendDataToMyServer(details.messageType, details).catch(error => {
            console.error('Error sending data to server:', error);
        });
    }
});


// Inject JS inside an iframe at different stages of loading
function handleIframeLoading(details) {
    console.log("Inside iframe loading ...");
    const tabId = details.tabId;
    const documentId = details.documentId;
    const documentLifecycle = details.documentLifecycle;
    const frameId = details.frameId;
    const frameType = details.frameType;
    const parentDocumentId = details.parentDocumentId;
    const parentFrameId = details.parentFrameId;
    const processId = details.processId;
    const timeStamp = details.timeStamp;
    const url = details.url;

    chrome.tabs.get(tabId, (tab) => {
        const pageURL = tab.url;
        setTimeout(() => {
            chrome.tabs.executeScript(
                tabId,
                { frameId: frameId, file: "scripts/content.js", matchAboutBlank: true },
                function(result) {
                    console.log(`Tab ID: ${tabId} | Frame ID: ${frameId}`);
                    chrome.tabs.sendMessage(tabId, { 
                        tabId: tabId, 
                        documentId: documentId,
                        documentLifecycle: documentLifecycle,
                        frameId: frameId, 
                        frameType: frameType,
                        parentDocumentId: parentDocumentId, 
                        parentFrameId: parentFrameId,
                        processId: processId,
                        timeStamp: timeStamp,
                        url: url, // iframe URL
                        pageURL: pageURL // Tab URL
                    });
                }
            );
        }, 5);
    });
}


// Inject JS inside an iframe before loading to initialize the frame ID and page URL
function handleIframeInitialization(details) {
    console.log("Under iframe initialization ...");
    const tabId = details.tabId;
    const documentId = details.documentId;
    const frameId = details.frameId;
    const parentDocumentId = details.parentDocumentId;
    const parentFrameId = details.parentFrameId;
    const processId = details.processId;
    const timeStamp = details.timeStamp;
    const url = details.url;

    chrome.tabs.get(tabId, (tab) => {
        const pageURL = tab.url;
        // setTimeout(() => {
        chrome.tabs.executeScript(
            tabId,
            { frameId: frameId, file: "scripts/initialize.js", matchAboutBlank: true },
            function(result) {
                // console.log(`Tab ID: ${tabId} | Frame ID: ${frameId}`);
                chrome.tabs.sendMessage(tabId, { 
                    tabId: tabId, 
                    documentId: documentId,
                    documentLifecycle: documentLifecycle,
                    frameId: frameId, 
                    frameType: frameType,
                    parentDocumentId: parentDocumentId, 
                    parentFrameId: parentFrameId,
                    processId: processId,
                    timeStamp: timeStamp,
                    url: url, // iframe URL
                    pageURL: pageURL // Tab URL
                });
            }
        );
        // }, 5);
    });
}


// OnBeforeNavigated Event is fired just before iframe navigations related to its loading starts
chrome.webNavigation.onBeforeNavigate.addListener(handleIframeInitialization);


// onCommitted is fired before any of its children's onBeforeNavigate in case of nested iframes
// chrome.webNavigation.onCommitted.addListener(handleIframeLoading);


// OnDOMContentLoaded is fired after OnCommitted and before OnCompleted
// chrome.webNavigation.onDOMContentLoaded.addListener(handleIframeLoading);


// OnCompleted Event is fired for frame after all its children's OnCompleted in case of nested iframes
chrome.webNavigation.onCompleted.addListener(handleIframeLoading);


// OnErrorOccurred is fired if error occurs during any point in time of iframe loading
// chrome.webNavigation.onErrorOccurred.addListener(handleIframeLoading);


// OnReferenceFragmentUpdated is fired if the reference fragment of a frame is changed any time any time after onDOMContentLoaded or onCompleted
// chrome.webNavigation.onReferenceFragmentUpdated.addListener(function(details) {
//     if (details.frameId > 0) {
//         console.log("Frame onReferenceFragmentUpdated:", details.frameId);
//     }
// });


// Monitoring Network Requests and sent cookies

function processGetCookieHeader(getCookieString) {
    const cookiesArray = getCookieString.split(';').map(cookie => cookie.trim());
    const cookies = {};
    cookiesArray.forEach(cookie => {
      const [name, value] = cookie.split('=');
      cookies[name.trim()] = value ? value.trim() : '';
    });
    return cookies;
  }
  
function decodeRawBody(rawBody) {
    if (!rawBody) return "";
    try {
        return new TextDecoder('utf-8').decode(new Uint8Array(rawBody));
    } catch (e) {
        return String.fromCharCode.apply(null, new Uint8Array(rawBody));
    }
}
  
const requestStore = {};        // Merges webRequest and CDP data per requestId
const extraInfoStore = {};      // Temporarily stores CDP extra info events
const attachedTabs = new Set(); // Tracks tabs with debugger attached


// --- Tab Handling ---

// CDP: Attaching debugger to a tab if not already attached.
function attachDebuggerToTab(tabId) {
    if (attachedTabs.has(tabId)) return;
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
    if (!chrome.runtime.lastError) {
        chrome.debugger.sendCommand({ tabId: tabId }, "Network.enable");
        chrome.debugger.sendCommand({ tabId: tabId }, "Debugger.enable");
        attachedTabs.add(tabId);
    }
    });
}
  
// CDP: Detaching debugger when a tab is closed.
chrome.tabs.onRemoved.addListener(tabId => {
    if (attachedTabs.has(tabId)) {
        chrome.debugger.detach({ tabId: tabId }, () => {
            attachedTabs.delete(tabId);
        });
    }
});
  
// CDP: Attaching debugger when a new tab is created.
chrome.tabs.onCreated.addListener(tab => {
    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        attachDebuggerToTab(tab.id);
    }
});
  
// CDP: Attaching debugger on tab update (e.g. navigation).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        attachDebuggerToTab(tabId);
    }
});
  
// ======= Event Listeners for Capturing Network Traffic =======

// 1. Chrome Debugger API: Capture detailed network events.
// CDP: This will send data with messageType "networkRequestWillBeSent".
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
        if (!params.request || !params.request.url) return;
        // To use mapping_table in optimized_analysis.py to map Network.requestWillBeSent to WebRequest tables
        // Join Key: (tabId, documentId, url, (timestamp))
        // In edge cases where the same URL is requested multiple times in the same frame almost simultaneously, you might need to 
        // incorporate an additional discriminator (for example, the millisecond timestamp or WebRequest’s incremental requestId) 
        // into the key. But given that we’re logging all timestamps, the offline join process can handle such cases by looking at 
        // time deltas or simply yielding two separate mappings with the same composite key (the analysis script can then 
        // differentiate by requestId or timing).
        let mappingEntry = {
            messageType: "requestMap",
            tabId: source.tabId,
            documentId: params.frameId,             // Using Debugger's frameId (GUID) as document context
            url: params.request.url,
            debuggerId: params.requestId,           // Debugger API requestId
            debuggerWallTime: params.wallTime,      // Timestamp from Debugger event (seconds since epoch)
            webRequestId: null,                     // Placeholder for WebRequest API requestId
            webFrameId: null,                          // Numeric frameId not applicable here
            webParentFrameId: null,                    // Not available from Debugger event
            webRequestTimeStamp: null               // Placeholder for WebRequest event timestamp
        };
        console.log("networkRequestWillBeSent mappingEntry:", mappingEntry);
        if (batchSend) {
            enqueueData("requestMap", mappingEntry);
        } else {
            sendDataToMyServer("requestMap", mappingEntry).catch(error => {
                console.error('Error sending requestMap data:', error);
            });
        }
        const data = {
            messageType: "networkRequestWillBeSent",
            requestId: params.requestId,
            httpRequest: params.request.url,
            scriptURL: params.initiator?.url || undefined,
            scriptLineNumber: params.initiator?.lineNumber,
            scriptColumnNumber: params.initiator?.columnNumber,
            scriptType: params.initiator?.type || undefined,
            frameId: params.frameId,
            documentId: params.frameId,            // Added for mapping consistency
            tabId: source.tabId,
            documentURL: params.documentURL,
            timestamp: params.wallTime,
            tabURL: params.documentURL,
            timestamp: params.wallTime,            // Debugger’s wallTime (seconds since epoch)
            requestType: params.type,
            redirectHasExtraInfo: params.redirectHasExtraInfo || false
        };
        console.log("networkRequestWillBeSent data:", data);
        if (batchSend) {
            enqueueData("networkRequestWillBeSent", data);
        } else {
            sendDataToMyServer("networkRequestWillBeSent", data).catch(error => {
                console.error('Error sending networkRequestWillBeSent data:', error);
            });
        }
    } else if (method === "Debugger.scriptParsed") {
        const data = {
            messageType: "script",
            scriptId: params.scriptId,
            scriptURL: params.url?.trim() || (document.currentScript ? document.currentScript.src : "inline_script"),
            scriptType: params.type || (document.currentScript ? "inline" : "unknown"),
            frameId: params.frameId !== undefined ? params.frameId : (window.frameElement ? window.frameElement.id : null),
            documentId: params.frameId,            // Added for mapping consistency
            tabId: source.tabId,
            startLine: params.startLine,
            startColumn: params.startColumn,
            endLine: params.endLine,
            endColumn: params.endColumn,
            isContentScript: params.isContentScript || false,
            isInlineScript: params.isInlineScript || false,
            isModule: params.isModule || false,
            contextId: params.executionContextId
        };
        console.log("script data:", data);
        if (batchSend) {
            enqueueData("script", data);
        } else {
            sendDataToMyServer("script", data).catch(error => {
                console.error('Error sending script data:', error);
            });
        }
    }
});

// 2. chrome.webRequest API: Capture network events via webRequest.
// This sends data with messageType "chromeWebRequest".

// onBeforeRequest: capture request body and basic info.
chrome.webRequest.onBeforeRequest.addListener(details => {
    if (details.tabId < 0) return;
    let payload = "";
    if (details.method === "POST" && details.requestBody) {
        if (details.requestBody.formData) {
            payload = Object.keys(details.requestBody.formData)
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(details.requestBody.formData[key])}`)
                .join('&');
        } else if (details.requestBody.raw) {
            payload = decodeRawBody(details.requestBody.raw[0].bytes);
        }
    }
    let mappingEntry = {
        messageType: "requestMap",
        tabId: details.tabId,
        documentId: details.documentId || details.frameId,  // Prefer documentId if available
        url: details.url,
        debuggerId: null,                      // Placeholder for Debugger API requestId
        debuggerWallTime: null,                // Placeholder for Debugger event timestamp
        webRequestId: details.requestId,       // WebRequest API requestId
        webFrameId: details.frameId,              // Numeric frameId from WebRequest
        webParentFrameId: details.parentFrameId,  // Parent frame id from WebRequest
        webRequestTimeStamp: details.timeStamp // Timestamp from WebRequest event (ms since epoch)
    };
    console.log("onBeforeRequest mappingEntry:", mappingEntry);
    if (batchSend) {
        enqueueData("requestMap", mappingEntry);
    } else {
        sendDataToMyServer("requestMap", mappingEntry).catch(error => {
            console.error('Error sending requestMap data:', error);
        });
    }
    const data = {
        messageType: "chromeWebRequest",
        method: details.method,
        url: details.url,
        requestHeaders: "",
        cookies: "",
        requestBody: payload,
        frameId: details.frameId,
        documentId: details.documentId || details.frameId,  // Prefer documentId; fallback to frameId
        parentFrameId: details.parentFrameId,
        tabId: details.tabId,
        timestamp: details.timeStamp                        // WebRequest’s timestamp (ms since epoch)
    };
    console.log("onBeforeRequest data:", data);
    if (batchSend) {
        enqueueData("chromeWebRequest", data);
    } else {
        sendDataToMyServer("chromeWebRequest", data).catch(error => {
            console.error('Error sending chromeWebRequest data (onBeforeRequest):', error);
        });
    }
}, { urls: ["<all_urls>"] }, ["requestBody", "extraHeaders"]);

// onSendHeaders: capture request headers and cookies.
chrome.webRequest.onSendHeaders.addListener(details => {
    if (details.tabId < 0) return;
    const cookieHeader = details.requestHeaders.find(header => header.name.toLowerCase() === "cookie");
    const cookies = cookieHeader ? processGetCookieHeader(cookieHeader.value) : undefined;
    const data = {
        messageType: "chromeWebRequest",
        method: details.method,
        url: details.url,
        requestHeaders: JSON.stringify(details.requestHeaders),
        cookies: JSON.stringify(cookies),
        requestBody: "",
        frameId: details.frameId,
        parentFrameId: details.parentFrameId,
        tabId: details.tabId
    };
    console.log("onSendHeaders data:", data);
    if (batchSend) {
        enqueueData("chromeWebRequest", data);
    } else {
        sendDataToMyServer("chromeWebRequest", data).catch(error => {
            console.error('Error sending chromeWebRequest data (onSendHeaders):', error);
        });
    }
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);



// Listen for clicks on the extension icon to get frames for the active tab
chrome.browserAction.onClicked.addListener(function(tab) {
    console.log(`Extension icon clicked on Tab: ${tab.id}`);
    // getAllFrames(tab.id); // Pass tab.id as an argument
});
