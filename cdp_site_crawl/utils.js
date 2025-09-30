// utils.js
// Consolidated utilities: helpers.js + static_data_structs.cjs + queue_manager.js
// Reduces 3 files (~12KB) into 1 optimized module

const fs = require('fs');
const path = require('path');

// ===== CONSTANTS & CONFIGURATION =====
const DEFAULT_BATCH_SIZE = 100;

const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 }
];

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0"
];

// ===== DETECTION PATTERNS =====
const chatbotProviders = {
  intercom: /intercom\.io/,
  livechat: /livechatinc\.com/,
  drift: /drift\.com\/api-client\//,
  hubspot: /api\.hubapi\.com\/conversations\//,
  hubspotSocket: /websocket\.hubapi\.com/
};

const genericChatbotDetection = {
  networkPatterns: [
    /chat/i, /widget/i, /support/i, /help/i, /bot/i, /assistant/i,
    /intercom/i, /zendesk/i, /drift/i, /crisp/i, /freshchat/i, /olark/i,
    /livechat/i, /tidio/i, /hubspot/i, /messenger/i, /chatlio/i
  ],
  domPatterns: [
    /chat/i, /widget/i, /launcher/i, /support/i, /help/i, /bot/i,
    /message/i, /conversation/i, /assistant/i, /contact/i
  ],
  textPatterns: [
    /chat with us/i, /need help/i, /contact support/i, /ask a question/i,
    /talk to us/i, /get help/i, /live chat/i, /customer support/i
  ]
};

const chatLaunchers = [
  '.drift-open-chat', '.drift-widget-launcher',
  '.intercom-launcher-frame', 'button.intercom-launcher',
  '#livechat-full-view', '.lc-1j3b8yg.e1kes29v1',
  'button#hs-messages-launcher', '.hubspot-messages-iframe-container button',
  '#tidio-chat-iframe', '.tidio-chat-button',
  '#zopim', '.zopim .zopim-launcher',
  '#crisp-chatbox', '.crisp-client .launcher',
  '.freshchat-launcher', '.olark-launcher'
];

const searchBarSelectors = [
  'input[type="search"]', 'input[type="text"]',
  'input[name*="search"]', 'input[id*="search"]',
  'input[class*=search i]', 'input[placeholder*=search i]',
  'input[aria-label*=search i]', 'form[role="search"]',
  'form.search', '.search-form', '.search-input',
  '#searchbox_input'
];

const helpLaunchers = [
  'button[aria-label*="help" i]', 'button[title*="help" i]',
  'a[aria-label*="help" i]', 'a[title*="help" i]',
  '[class*="help" i]', '[id*="help" i]',
  'button[aria-label*="support" i]', '[class*="support" i]',
  'button[aria-label*="assistant" i]', '[class*="assistant" i]'
];

// ===== UTILITY FUNCTIONS =====
function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

async function scrollWithPauses(page, durationMs = 20000 + Math.random() * 5000, maxSteps = 50) {
  const start = Date.now();
  let steps = 0;

  while (Date.now() - start < durationMs && steps < maxSteps) {
    await page.evaluate(h => window.scrollBy(0, h), 300);
    const delay = 500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    steps++;
  }

  const elapsed = Date.now() - start;
  if (elapsed < durationMs) {
    await page.waitForTimeout(durationMs - elapsed);
  }
}

async function captureFrameDOM(page, domQueue) {
  for (const frame of page.frames()) {
    try {
      const frameUrl = frame.url();
      
      if (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('data:') || frameUrl.startsWith('blob:')) {
        continue;
      }
      
      const html = await frame.content();
      
      domQueue.enqueue({
        frameId: frame._id,
        url: frameUrl,
        html: html,
        originalSize: html.length,
        truncated: false
      });
    } catch (e) {
      console.warn(`DOM capture failed for frame ${frame.url()}: ${e.message}`);
    }
  }
}

// ===== QUEUE CLASSES =====
class QueueManager {
  constructor(maxSize = 10000) {
    this.queue = [];
    this.maxSize = maxSize;
  }

  enqueue(item) {
    this.queue.push(item);
    if (this.queue.length > this.maxSize) {
      this.queue.shift();
    }
  }

  dequeue() { return this.queue.shift(); }
  peek() { return this.queue[0]; }
  size() { return this.queue.length; }
  isEmpty() { return this.queue.length === 0; }
  clear() { this.queue = []; }
  drainAll() { const items = [...this.queue]; this.clear(); return items; }
  getRecent(count = 100) { return this.queue.slice(-count); }
}

class DataQueue {
  constructor(filePath, batchSize = DEFAULT_BATCH_SIZE) {
    this.filePath = filePath;
    this.queue = [];
    this.batchSize = batchSize;
    this.isFlushing = false;
    this.flushPromise = Promise.resolve();
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }

  enqueue(item) {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize && !this.isFlushing) {
      this.flush().catch(console.error);
    }
  }

  async flush() {
    if (this.queue.length === 0 || this.isFlushing) return this.flushPromise;
    
    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      const out = batch.map(x => JSON.stringify(x)).join('\n') + '\n';
      await fs.promises.appendFile(this.filePath, out, { flag: 'a' });
    } catch (error) {
      console.error(`Error writing to ${this.filePath}:`, error);
      this.queue.unshift(...batch);
      throw error;
    } finally {
      this.isFlushing = false;
      if (this.queue.length > 0) {
        return this.flush();
      }
    }
  }
  
  async waitForFlush() {
    while (this.isFlushing || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.queue.length > 0 && !this.isFlushing) {
        await this.flush();
      }
    }
  }
}

module.exports = {
  // Configuration
  viewports,
  userAgents,
  chatbotProviders,
  genericChatbotDetection,
  chatLaunchers,
  searchBarSelectors,
  helpLaunchers,
  
  // Utility functions
  normalizeUrl,
  scrollWithPauses,
  captureFrameDOM,
  
  // Classes
  QueueManager,
  DataQueue
};
