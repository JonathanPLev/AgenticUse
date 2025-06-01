window.website = '';
window.webpageurl = '';
const pathQueues = {};
window.debuggerAttached = false;
const port = 8000;
const batchSend = true;
const batchSize = 1000;
let batchSendingStarted = false;
const pauseBetweenSends = 100; // in milliseconds
const pauseBetweenBatches = 500; // in milliseconds
const paths = ['request', 'requestHeaders', 'requestInfo', 'response', 'responseHeaders', 'storage', 'eventGet', 'eventSet', 'eventRemove', 'script', 'element', 'property', 'fingerprinting'];

if (typeof window.debugMode === 'undefined') {
    window.debugMode = false;
}
function log(text) {
    if (window.debugMode) {
        console.log(text);
    }
}

function loadConfig() {
    const url = chrome.runtime.getURL('../config.json');
    fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log('Config loaded:', data);
            window.website = data.website;
            window.webpageurl = data.webpageurl;
        })
        .catch(error => console.error('Error loading the configuration:', error));
}
loadConfig();
console.log(window.website, window.webpageurl);

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
                    'Content-Type': 'application/json'
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
                "Content-Type": "application/json"
            }
        }).then(res => {
            if (res.ok) {
                log(`${data.function} data sent to server.`);
                resolve(res);
            } else {
                throw new Error(`Server responded with status: ${res.status}`);
            }
        }).catch(err => {
            console.error(`Error in sending ${data.function}:`, err);
            reject(err);
        });
    });
}

// Listening to messages from content script for receiving the intercepted data from injected script
chrome.runtime.onMessage.addListener((message, sender) => {
    log("Message from Content Script:", message.path, message.data, sender);
    if (batchSend === true) {
        enqueueData(message.path, message.data);
    } else {
        sendDataToMyServer(message.path, message.data).catch(error => {
            console.error('Error sending data to server:', error);
        });
    }
});


// Processing the Set-Cookie header
function processSetCookieHeader(setCookieString) {
    const cookieAttributes = setCookieString.split(';').reduce((attrs, attr) => { // Splitting the Set-Cookie string into individual cookie attributes
        let [name, value] = attr.split('=');
        name = name.trim();
        if (value) value = value.trim();
        if (!attrs.name) { // Assuming the first key-value pair is the cookie name and value
            attrs.name = name;
            attrs.value = value;
        } else {
            attrs[name.toLowerCase()] = value || true; // Converting attribute name to lowercase for consistency
        }
        return attrs;
    }, {});
    return cookieAttributes;
}

function sendProcessedCookies(requestId, website, webpage, responseURL, setCookieStrings) {
    setCookieStrings.forEach(cookieString => {
        const cookieAttributes = processSetCookieHeader(cookieString);
        const path = "storage";
        const data = {
            "function": "HTTPCookieSetter",
            "website": website,
            "topLevelURL": webpage,
            "requestId": requestId,
            "responseURL": responseURL,
            "cookieName": cookieAttributes.name,
            "cookieValue": cookieAttributes.value,
            "domain": cookieAttributes.domain,
            "path": cookieAttributes.path,
            "expires": cookieAttributes.expires,
            "httpOnly": 'httponly' in cookieAttributes,
            "secure": 'secure' in cookieAttributes,
            "sameSite": cookieAttributes.samesite,
            "rawStr": cookieString
        };
        if (batchSend === true) {
            enqueueData(path, data);
        } else {
            sendDataToMyServer(path, data);
        }
    });
}

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
    let decodedString;
    try {
        const decoder = new TextDecoder('utf-8');
        decodedString = decoder.decode(new Uint8Array(rawBody));
    } catch (e) {
        decodedString = String.fromCharCode.apply(null, new Uint8Array(rawBody));
    }
    return decodedString;
}

chrome.webRequest.onBeforeRequest.addListener(function (details) {
    if (details.tabId < 0) {
        // log("The request is not associated with a tab. It is a background script request.");
        return;
    }
    chrome.tabs.get(details.tabId, function (tab) {
        if (chrome.runtime.lastError) {
            log("Tab is closed:", chrome.runtime.lastError.message);
            return;
        }
        const webpageurl = new URL(tab.url);
        const domain = webpageurl.hostname;
        const frameUrl = details.frameUrl || webpageurl;
        let payload;
        if (details.method === "POST" && details.requestBody) {
            if (details.requestBody.formData) {
                payload = Object.keys(details.requestBody.formData).map(key => {
                    return encodeURIComponent(key) + '=' + encodeURIComponent(details.requestBody.formData[key]);
                }).join('&');
            } else if (details.requestBody.raw) {
                // Processing the raw encoded data
                rawBody = details.requestBody.raw[0].bytes;
                if (rawBody) {
                    payload = decodeRawBody(rawBody);
                }
            }
        }
        if (domain === "newtab" || domain == "undefined") { return; }
        const path = "request";
        const data = {
            "function": "onBeforeRequest",
            "website": domain,
            "webpageURL": webpageurl,
            "method": details.method,
            "requestId": details.requestId,
            "httpRequest": details.url,
            "type": details.type,
            "frameId": details.frameId,
            "frameUrl": frameUrl,
            "parentFrameId": details.parentFrameId,
            "requestBody": payload
        };
        if (batchSend === true) {
            enqueueData(path, data);
        } else {
            sendDataToMyServer(path, data);
        }
    });
}, {urls: ["<all_urls>"]}, ["requestBody", "extraHeaders"]);

chrome.webRequest.onHeadersReceived.addListener(function(details) {
    if (details.tabId < 0) {
        // log("The request is not associated with a tab. It is a background script request.");
        return;
    }
    chrome.tabs.get(details.tabId, function(tab) {
        const webpageurl = window.webpageurl;
        const domain = window.website;
        const frameUrl = details.frameUrl || webpageurl;
        if (domain === "newtab" || domain == "undefined") { return; }
        
        const setCookieHeaders = details.responseHeaders.filter(header => 
            header.name.toLowerCase() === 'set-cookie'
        ).map(header => header.value);
        if (setCookieHeaders.length) {
            sendProcessedCookies(details.requestId, domain, tab.url, details.url, setCookieHeaders);
        }
        const path = "responseHeaders";
        const data = {
            "function": "onHeadersReceived",
            "website": domain,
            "webpageURL": webpageurl,
            "requestId": details.requestId,
            "statusCode": details.statusCode,
            "statusText": details.statusLine,
            "responseURL": details.url,
            "headers": details.responseHeaders.map(header => ({
                name: header.name,
                value: header.value
            })),
            "frameId": details.frameId,
            "frameUrl": frameUrl,
            "parentFrameId": details.parentFrameId,
        };
        if (batchSend === true) {
            enqueueData(path, data);
        } else {
            sendDataToMyServer(path, data);
        }
    });
}, {urls: ["<all_urls>"]}, ["responseHeaders", "extraHeaders"]);

chrome.webRequest.onSendHeaders.addListener(function (details) {
    if (details.tabId < 0) {
        // log("The request is not associated with a tab. It is a background script request.");
        return;
    }
    const cookieHeader = details.requestHeaders.find(header => header.name.toLowerCase() === "cookie");
    const cookies = cookieHeader ? cookieHeader.value : null;
    let cookieDetails = {};
    if (cookies) {
        cookieDetails = processGetCookieHeader(cookies);
    }
    chrome.tabs.get(details.tabId, function(tab) {
        const webpageurl = window.webpageurl;
        const domain = window.website;
        const frameUrl = details.frameUrl || webpageurl;
        if (domain === "newtab" || domain == "undefined") { return; }
        if (Object.keys(cookieDetails).length > 0) {
            Object.entries(cookieDetails).forEach(([name, value]) => {
                const path = "storage";
                const data = {
                    "function": "HTTPCookieGetter",
                    "website": domain,
                    "webpageURL": webpageurl,
                    "requestId": details.requestId,
                    "requestURL": details.url,
                    "frameId": details.frameId,
                    "frameUrl": frameUrl,
                    "parentFrameId": details.parentFrameId,
                    "cookieName": name,
                    "cookieValue": value
                };
                if (batchSend === true) {
                    enqueueData(path, data);
                } else {
                    sendDataToMyServer(path, data);
                }
            });
        }
        const path = "requestHeaders";
        const data = {
            "function": "onSendHeaders",
            "website": domain,
            "webpageURL": webpageurl,
            "requestId": details.requestId,
            "url": details.url,
            "method": details.method,
            "type": details.type,
            "requestHeaders": details.requestHeaders,
            "frameId": details.frameId,
            "frameUrl": frameUrl,
            "parentFrameId": details.parentFrameId,
        };
        if (batchSend === true) {
            enqueueData(path, data);
        } else {
            sendDataToMyServer(path, data);
        }
    });
}, {urls: ["<all_urls>"]}, ["requestHeaders", "extraHeaders"]);


// CDP: Listening for and capturing Network events via CDP
function onEvent(debugId, message, params) {
    let path, data;
    switch (message) {
        case "Network.requestWillBeSent":
            if (!params.request.url.includes('localhost')) {
                path = "request";
                data = {
                    "function": "Network.requestWillBeSent",
                    "website": window.website,
                    "httpRequest": params.request.url,
                    "requestId": params.requestId,
                    "topLevelURL": 0,
                    "frameURL": params.documentURL,
                    "resourceType": params.type,
                    "header": params.request.headers,
                    "timestamp": params.timestamp,
                    "frameId": params.frameId,
                    "callStack": params.initiator
                };
                if (batchSend === true) {
                    enqueueData(path, data);
                } else {
                    sendDataToMyServer(path, data);
                }
            }
            break;
        case "Network.requestWillBeSentExtraInfo":
            path = "requestInfo";
            data = {
                "function": "Network.requestWillBeSentExtraInfo",
                "website": window.website,
                "requestId": params.requestId,
                "cookies": params.associatedCookies,
                "headers": params.headers,
                "connectTiming": params.connectTiming,
                "clientSecurityState": params.clientSecurityState
            };
            if (batchSend === true) {
                enqueueData(path, data);
            } else {
                sendDataToMyServer(path, data);
            }
            break;
        case "Network.responseReceived":
            chrome.debugger.sendCommand({ tabId: debugId.tabId }, "Network.getResponseBody", { requestId: params.requestId }, function(response) {
                if (chrome.runtime.lastError || !response) {
                    // Avoiding processing if there's an error or response is undefined
                    log("Error getting response body:", chrome.runtime.lastError?.message || "No response data");
                    return;
                }
                path = "response";
                data = {
                    "function": "Network.responseReceived",
                    "website": window.website, 
                    "requestId": params.requestId,
                    "body": response.body,
                    "base64EncodedFlag": response.base64Encoded,
                    "response": params.response,
                    "resourceType": params.type
                };
                if (batchSend === true) {
                    enqueueData(path, data);
                } else {
                    sendDataToMyServer(path, data);
                }
            });
            break;
        case "Debugger.scriptParsed":
            path = "script";
            data = {
                "function": "Debugger.scriptParsed",
                "website": window.website,
                "scriptId": params.scriptId,
                "url": params.url
            };
            if (batchSend === true) {
                enqueueData(path, data);
            } else {
                sendDataToMyServer(path, data);
            }
            break;
    }
}

// CDP: Entering debugging mode for the active tab
function attachDebuggerToTab(tabId) {
    chrome.debugger.attach({tabId: tabId}, "1.0", () => {
        if (!chrome.runtime.lastError) {
            chrome.debugger.sendCommand({tabId: tabId}, "Network.enable");
            chrome.debugger.sendCommand({tabId: tabId}, "Debugger.enable");
            chrome.debugger.onEvent.addListener(onEvent);
        }
    });
}

// CDP: Activating debugger on the newly active tab
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (!tab.url.startsWith('chrome://')) {
            attachDebuggerToTab(activeInfo.tabId);
        }
    });
});

// CDP: Updating debugger attachment for updated tabs (e.g., navigating to a new URL)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active && !tab.url.startsWith('chrome://')) {
        if (window.website === "") {
            window.webpageurl = new URL(tab.url);
            window.website = window.webpageurl.hostname;
        }
        log(tabId, window.website, window.webpageurl);
        injectScriptInsideFrames(tabId, 0, window.website)
        attachDebuggerToTab(tabId);
    }
});


// Function to preload the script content of inject.js
let cachedScriptContent = '';
function preloadScriptContent() {
    const scriptUrl = chrome.runtime.getURL('scripts/inject.js');
    fetch(scriptUrl)
        .then(response => response.text())
        .then(code => {
            cachedScriptContent = code;
            log('Script content preloaded successfully');
        })
        .catch(error => console.error('Error loading inject.js:', error));
}
// Calling this function when the background script is loaded to cache the script content
preloadScriptContent();

function injectScriptInsideFrames(tabId, frameId, domain) {
    if (!cachedScriptContent) {
        console.error('Script content is not loaded yet');
        return;
    }
    const scriptContent = `window.currentCrawlDomain = ${JSON.stringify(domain)};\n${cachedScriptContent}`;
    chrome.tabs.sendMessage(tabId, {
        type: 'injectScript',
        frameId: frameId,
        scriptContent: scriptContent
    });
}
// Injecting inject.js inside each iframe
// OnBeforeNavigated Event is fired just before iframe navigations related to its loading starts
chrome.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId >= 0) {
        chrome.tabs.get(details.tabId, tab => {
            const domain = new URL(tab.url).hostname;
            injectScriptInsideFrames(details.tabId, details.frameId, domain);
        });
    }
});

// Listen for clicks on the extension icon to display the message
chrome.browserAction.onClicked.addListener(function(tab) {
    console.log(`Extension icon clicked on Tab: ${tab.id}`);
});