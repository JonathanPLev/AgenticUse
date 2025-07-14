// All helper functions and classes are centralized here
const fs = require('fs');
const path = require('path');

function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

class DataQueue {
  constructor(filename, batchSize = BATCH_SIZE) {
    this.filename = filename;
    this.queue = [];
    this.batchSize = batchSize;
  }
  enqueue(item) {
    this.queue.push(item);
  }
  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.batchSize);
    const out = batch.map(x => JSON.stringify(x)).join('\n') + '\n';
    fs.appendFileSync(path.join(OUTPUT_DIR, this.filename), out);
  }
}

// Scroll for a fixed duration or until max steps
async function scrollWithPauses(page) {
  const start = Date.now();
  let steps = 0;
  while ((Date.now() - start) < SCROLL_DURATION_MS && steps < MAX_SCROLL_STEPS) {
    await page.evaluate(h => window.scrollBy(0, h), 300);

    // <-- replace both waitForTimeout/page.waitFor calls with this:
    await new Promise(resolve => setTimeout(
      resolve,
      500 + Math.random() * 1000
    ));

    steps++;
  }
  const elapsed = Date.now() - start;
  if (elapsed < SCROLL_DURATION_MS) {
    await new Promise(resolve => setTimeout(
      resolve,
      SCROLL_DURATION_MS - elapsed
    ));
  }
}

// Recursively walk frame tree and capture each frame's HTML
async function captureFrameDOM(client, frameTree, domQueue) {
  try {
    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const { outerHTML } = await client.send('DOM.getOuterHTML', { nodeId: root.nodeId });
    domQueue.enqueue({ frameId: frameTree.frame.id, url: frameTree.frame.url, html: outerHTML });
  } catch (e) {
    console.warn('DOM capture failed for frame', frameTree.frame.id, e.message);
  }
  if (frameTree.childFrames) {
    for (const child of frameTree.childFrames) {
      await captureFrameDOM(client, child, domQueue);
    }
  }
}

module.exports = {
  normalizeUrl,
  DataQueue,
  scrollWithPauses,
  captureFrameDOM
}