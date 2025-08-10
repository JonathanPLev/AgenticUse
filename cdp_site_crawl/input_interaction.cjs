// input_interaction.js
async function interactWithAllForms(page, originalUrl, opts = {}) {
  const {
    instrumentPage,
    queues = {},
    openUrlMode = 'original',
    bodyPreviewLimit = 1_000_000,
    bigBodyHardCap = 10_000_000,
    idleAfterOpenMs = 1000,
    finalFreshOriginal = true,   // <- always give back a clean original tab
    closeSubmissionTabs = true,  // <- close temp tabs after traffic settles
  } = opts;

  const browser = page.browser();
  const startUrl = originalUrl || page.url();

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  const isBinary = (ct = '') => /octet-stream|zip|image|pdf|font|video|audio|wasm/i.test(ct);

  async function safePreview(res) {
    if (!res) return {};
    const headers = res.headers?.() ?? {};
    const ct = headers['content-type'] || '';
    const cl = Number(headers['content-length'] || '0');
    if (isBinary(ct) || (Number.isFinite(cl) && cl > bigBodyHardCap)) return {};
    try {
      const buf = await res.buffer();
      if (!buf) return {};
      const truncated = buf.length > bodyPreviewLimit;
      return {
        bodyPreview: buf.subarray(0, Math.min(buf.length, bodyPreviewLimit)).toString('utf8'),
        bodyPreviewTruncated: truncated || undefined
      };
    } catch { return {}; }
  }

  function resolveOpenUrl({ navResp, xhrResp }) {
    if (openUrlMode === 'original') return startUrl;
    if (openUrlMode === 'current')  return page.url();
    return navResp ? navResp.url() : page.url(); // 'final'
  }

  async function openInstrumentedTab(url) {
    const newPage = await browser.newPage();
    if (typeof instrumentPage === 'function') {
      try { await instrumentPage(newPage, queues); } catch (e) {
        console.warn('instrumentPage error:', e.message);
      }
    }
    await newPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await newPage.waitForNetworkIdle({ idleTime: idleAfterOpenMs, timeout: 8000 }); } catch {}
    return newPage;
  }

  async function submitFork(form) {
    let navResp = null, xhrResp = null;
    try {
      const submitBtn = await form.$('button[type=submit], input[type=submit]');
      const navP = page.waitForNavigation({ waitUntil: ['domcontentloaded','networkidle2'], timeout: 15000 }).catch(() => null);
      const xhrP = page.waitForResponse(
        r => {
          const q = r.request();
          return q.frame() === page.mainFrame() && ['POST','PUT','PATCH','DELETE'].includes(q.method());
        }, { timeout: 15000 }
      ).catch(() => null);

      if (submitBtn) await submitBtn.click({ delay: 80 + Math.random()*120 });
      else await form.evaluate(f => f.submit());

      [navResp, xhrResp] = await Promise.all([navP, xhrP]);
    } catch (e) {
      console.warn('submit/wait error:', e.message);
    }

    for (const res of [navResp, xhrResp].filter(Boolean)) {
      try {
        const preview = await safePreview(res);
        queues.responseQueue?.enqueue?.({
          event: 'formSubmissionResponse',
          url: res.url(),
          status: res.status(),
          headers: res.headers?.() ?? {},
          ts: Date.now(),
          ...preview
        });
      } catch {}
    }

    const subTab = await openInstrumentedTab(resolveOpenUrl({ navResp, xhrResp }));
    if (closeSubmissionTabs) { try { await subTab.close(); } catch {} }

    if (!page.isClosed() && page.url() !== startUrl) {
      try { await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
    }
  }

  // Main loop: per-field submit
  const formCount = await page.$$eval('form', fs => fs.length).catch(() => 0);
  console.log(`📝 Will process ${formCount} form(s)`);

  for (let idx = 1; idx <= formCount; idx++) {
    if (page.url() !== startUrl) {
      try { await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
      catch (e) { console.warn(`reload before form #${idx} failed:`, e.message); continue; }
    }
    const form = await page.$(`form:nth-of-type(${idx})`);
    if (!form) { console.warn(`form #${idx} missing, skipping`); continue; }

    const els = await form.$$('input, textarea, select');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      try {
        const tag = (await (await el.getProperty('tagName')).jsonValue()).toLowerCase();
        const type = tag === 'select'
          ? 'select'
          : (await (await el.getProperty('type')).jsonValue() || tag).toLowerCase();

        if (['hidden','submit','reset','button','file'].includes(type)) continue;

        try { await form.evaluate(f => f.reset?.()); } catch {}

        if (type === 'checkbox' || type === 'radio') {
          await el.click({ delay: 60 + Math.random()*80 });
          await submitFork(form);
          continue;
        }
        if (type === 'select') {
          const optVal = await el.$eval('option:not([disabled])', o => o.value);
          await el.select(optVal);
          await submitFork(form);
          continue;
        }

        await el.focus();
        await el.click({ clickCount: 3 }).catch(() => {});
        await new Promise(r => setTimeout(r, 120 + Math.random()*180));
        await el.type('Are you a bot?', { delay: 25 + Math.random()*25 });
        await new Promise(r => setTimeout(r, 120 + Math.random()*180));
        await submitFork(form);

      } catch (e) {
        console.warn(`field #${i+1} error:`, e.message);
      }
    }
  }

  // Always return a fresh tab at originalUrl
  if (finalFreshOriginal) {
    return await openInstrumentedTab(startUrl);
  }
  return page;
}

module.exports = interactWithAllForms;
