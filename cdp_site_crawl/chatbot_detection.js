async function chatbotDetector(page, url){
    page.on('request', req => {
        for (const [name, re] of Object.entries(chatbotProviders)) {
        if (re.test(req.url())) {
            console.log(`🕵️  Detected provider call: ${name}`);
        }
        }
    });

    // 6) detect chatbot presence
    const chatFound = await detectChatPresence(page);
    console.log('🔎 Chat detected on page?', chatFound);

    if (!chatFound) {
        console.log('No chatbot keywords found—exiting.');
        await browser.close();
        return;
    }

    // 7) open the chat widget
    const opened = await openChatLauncher(page);
    if (!opened) {
        console.warn('⚠️ Unable to open chat launcher—exiting.');
        await browser.close();
        return;
    }

    // 8) interact: send query and await response
    await interactWithChat(page, query);

    await browser.close();


    // ————— Helpers —————

    async function simulateHuman(page) {
    await page.mouse.move(100, 50, { steps: 8 });
    await page.mouse.move(200, 150, { steps: 12 });
    await sleep(300 + Math.random() * 400);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight/2));
    await sleep(300 + Math.random() * 400);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(300 + Math.random() * 400);
    }

    async function detectChatPresence(page) {
    // main‐frame text + scripts
    const [inText, inScripts] = await Promise.all([
        page.evaluate(keys =>
        document.body.innerText.toLowerCase().includes(keys.join('|')),
        chatbotKeywords
        ),
        page.evaluate(keys =>
        Array.from(document.querySelectorAll('script, iframe'))
            .some(n => (n.src||'').toLowerCase().includes(keys.join('|'))),
        chatbotKeywords
        ),
    ]);
    if (inText || inScripts) return true;

    // also each iframe
    for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        try {
        const txt = await f.evaluate(() => document.body.innerText.toLowerCase());
        if (chatbotKeywords.some(k => txt.includes(k))) return true;
        // ALSO check scripts/srcs in this iframe
        const scriptOrIframeSrc = await f.evaluate(keys =>
            Array.from(document.querySelectorAll('script, iframe'))
            .some(n => (n.src||'').toLowerCase().includes(keys.join('|'))),
            chatbotKeywords
        );
        if (scriptOrIframeSrc) return true;
        } catch {}
    }
    return false;
    }

    async function openChatLauncher(page) {
    for (const sel of chatLaunchers) {
        // try main page
        try {
        const btn = await page.waitForSelector(sel, { timeout: 2000, visible: true });
        await btn.click({ delay: 150 + Math.random() * 150 });
        console.log(`✅ Clicked launcher: ${sel}`);
        return true;
        } catch {}
        // try in each iframe
        for (const f of page.frames()) {
        try {
            const btn = await f.waitForSelector(sel, { timeout: 2000, visible: true });
            await btn.click({ delay: 150 + Math.random() * 150 });
            console.log(`✅ Clicked in frame ${f.url()}: ${sel}`);
            return true;
        } catch {}
        }
    }
    return false;
    }

    async function interactWithChat(page, query) {
    const chatInputs = [
        'textarea.chat-input',
        'input.chat-input',
        'textarea#intercom-chat-input',
        'textarea.drift-input',
        '#livechat-message-input',
    ];
    const responseSelectors = [
        '.chat-bubble.bot:last-child',
        '.intercom-chat-message--agent:last-child',
        '.drift-widget-message:last-child',
        '.lc-chat__message--operator:last-child',
    ];

    // 1) find the input
    let frameForInput = null, inputSel = null;
    for (const f of [page, ...page.frames()]) {
        for (const sel of chatInputs) {
        try {
            await f.waitForSelector(sel, { timeout: 2000 });
            frameForInput = f;
            inputSel = sel;
            break;
        } catch {}
        }
        if (frameForInput) break;
    }

    if (!frameForInput) {
        console.warn('⚠️ No chat input found.');
        return;
    }

    // 2) type & send
    const handle = await frameForInput.$(inputSel);
    await handle.focus();
    await frameForInput.keyboard.type(query, { delay: 50 });
    await frameForInput.keyboard.press('Enter');
    console.log(`📤 Sent query: "${query}"`);

    // 3) wait up to 20s for a response
    const start = Date.now();
    while (Date.now() - start < 20000) {
        for (const f of [frameForInput, ...page.frames()]) {
        for (const sel of responseSelectors) {
            const el = await f.$(sel);
            if (el) {
            const text = await f.$eval(sel, el => el.innerText.trim());
            console.log(`🤖 Bot replied: "${text}"`);
            return;
            }
        }
        }
        await sleep(500);
    }

    console.warn('⚠️ No bot response detected within 20s.');
    }

    function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
    }
}