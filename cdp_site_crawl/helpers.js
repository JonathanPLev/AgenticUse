// helpers.js
const fs = require('fs');
const path = require('path');

const DEFAULT_BATCH_SIZE = 100;

async function captureFrame(frame) {
  try {
    // use evaluate when same-origin
    const html = await frame.evaluate(() => document.documentElement.outerHTML);
    domQueue.enqueue({
      frameId: frame._id,           // puppeteer’s internal id
      url:     frame.url(),
      html,
      ts:      Date.now(),
    });
  } catch (err) {
    // fallback for cross-origin frames (DOMSnapshot is heavier but works)
    const snapshot = await client.send('DOMSnapshot.captureSnapshot', {
      includeDOM: true,
      includePaintOrder: false,
      includeDOMRects: false,
      computedStyles: []
    });
    domQueue.enqueue({
      frameId: frame._id,
      url:     frame.url(),
      snapshot,
      ts:      Date.now(),
    });
  }
}

// 2) Helper to walk all known frames
async function captureAllFrames() {
  for (const frame of page.frames()) {
    await captureFrame(frame);
  }
}

function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

class DataQueue {
  /**
   * @param {string} filePath  Absolute path where log lines will be appended.
   * @param {number} [batchSize=DEFAULT_BATCH_SIZE]
   */
  constructor(filePath, batchSize = DEFAULT_BATCH_SIZE) {
    this.filePath = filePath;
    this.queue = [];
    this.batchSize = batchSize;
    this.isFlushing = false;
    this.flushPromise = Promise.resolve();
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create empty file if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }

  enqueue(item) {
    this.queue.push(item);
    // Auto-flush if we've reached batch size
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
      // Put the batch back in the queue for retry
      this.queue.unshift(...batch);
      throw error;
    } finally {
      this.isFlushing = false;
      
      // If more items were added while we were writing, flush again
      if (this.queue.length > 0) {
        return this.flush();
      }
    }
  }
  
  // Wait for all pending writes to complete
  async waitForFlush() {
    while (this.isFlushing || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.queue.length > 0 && !this.isFlushing) {
        await this.flush();
      }
    }
  }
}

/**
 * Scroll with random pauses until either
 *   • SCROLL_DURATION_MS has elapsed
 *   • MAX_SCROLL_STEPS iterations done
 *
 * @param {import('puppeteer').Page} page
 * @param {number} [durationMs=20000]
 * @param {number} [maxSteps=50]
 */
async function scrollWithPauses(page,
                                durationMs = 20000 + Math.random() * 5000,
                                maxSteps = 50) {
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

/**
 * Capture outerHTML for *every* frame in the page.
 *
 * @param {import('puppeteer').Page} page
 * @param {DataQueue} domQueue
 */
async function captureFrameDOM(page, domQueue) {
  for (const frame of page.frames()) {
    try {
      // Puppeteer’s frame.content() returns the full serialized HTML
      const html = await frame.content();
      domQueue.enqueue({
        frameId: frame._id /* Puppeteer’s internal frame id */,
        url:     frame.url(),
        html
      });
    } catch (e) {
      console.warn(`DOM capture failed for frame ${frame.url()}: ${e.message}`);
    }
  }
}

module.exports = {
  normalizeUrl,
  DataQueue,
  scrollWithPauses,
  captureFrameDOM,
  captureAllFrames,
  captureFrame
};