// instrumentation.js
const { protocolTimeout } = require('puppeteer'); // optional if you set timeouts

async function instrumentPage(page, queues) {
  const {
    networkQueue,
    responseQueue,
    consoleQueue,
    debugQueue,
    domQueue,       // if you have it
  } = queues;

  // --- CDP session (best for bodies & extra metadata) ---
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Debugger.enable');

  // you can keep this if you use it elsewhere
  await client.send('Debugger.setInstrumentationBreakpoint', {
    instrumentation: 'beforeScriptExecution'
  });

  client.on('Debugger.paused', async evt => {
    debugQueue?.enqueue?.({ event: 'paused', details: evt });
    try { await client.send('Debugger.resume'); } catch {}
  });

  // Requests (CDP)
  client.on('Network.requestWillBeSent', async params => {
    let postData = params.request.postData || null;
    try {
      const req = await client.send('Network.getRequestPostData', { requestId: params.requestId });
      if (req.postData) postData = req.postData;
    } catch {}
    networkQueue?.enqueue?.({
      event: 'requestWillBeSent',
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      postData,
      ts: Date.now(),
      frameId: params?.frameId,
      type: params?.type
    });
  });

  // Responses (CDP) — capture up to 1MB text preview
  client.on('Network.responseReceived', async params => {
    const { response, requestId } = params;
    let bodyPreview, bodyPreviewTruncated;

    try {
      const bodyObj = await client.send('Network.getResponseBody', { requestId });
      if (bodyObj) {
        const raw = bodyObj.base64Encoded
          ? Buffer.from(bodyObj.body, 'base64')
          : Buffer.from(bodyObj.body, 'utf8');
        const cap = 1_000_000; // 1 MB
        bodyPreview = raw.subarray(0, Math.min(raw.length, cap)).toString('utf8');
        bodyPreviewTruncated = raw.length > cap || undefined;
      }
    } catch {
      // Some responses/bodies aren’t available (cross-origin, stream, etc.) — ignore
    }

    responseQueue?.enqueue?.({
      event: 'responseReceived',
      requestId,
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      mimeType: response.mimeType,
      ts: Date.now(),
      bodyPreview,
      bodyPreviewTruncated,
    });
  });

  // Puppeteer fallbacks (optional but nice)
  page.on('request', req => {
    try {
      networkQueue?.enqueue?.({
        event: 'request',
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        resourceType: req.resourceType?.(),
        postData: req.postData?.(),
        ts: Date.now(),
        frameUrl: req.frame()?.url?.(),
      });
    } catch {}
  });

  page.on('response', async res => {
    try {
      const headers = res.headers?.() ?? {};
      const ct = headers['content-type'] || '';
      const looksBinary = /octet-stream|zip|image|pdf|font|video|audio|wasm/i.test(ct);

      let bodyPreview, bodyPreviewTruncated;
      if (!looksBinary) {
        try {
          const buf = await res.buffer();
          const cap = 1_000_000;
          bodyPreview = buf.subarray(0, Math.min(buf.length, cap)).toString('utf8');
          bodyPreviewTruncated = buf.length > cap || undefined;
        } catch {}
      }

      responseQueue?.enqueue?.({
        event: 'response',
        url: res.url(),
        status: res.status(),
        headers,
        ts: Date.now(),
        bodyPreview,
        bodyPreviewTruncated,
      });
    } catch {}
  });

  page.on('console', msg => {
    consoleQueue?.enqueue?.({
      event: 'console',
      type: msg.type(),
      text: msg.text(),
      ts: Date.now(),
      location: msg.location?.(),
    });
  });

  // Optional: DOM milestone
  page.on('domcontentloaded', () => {
    domQueue?.enqueue?.({
      event: 'domcontentloaded',
      url: page.url(),
      ts: Date.now(),
    });
  });

  // return the CDP client if your main file wants to add more hooks later
  return client;
}

module.exports = { instrumentPage };
