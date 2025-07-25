// test_extension_load.js
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

(async () => {
  // ─── Fix __dirname in ESM ─────────────────────────────────────────────────────
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);

  // ─── Point at the folder containing manifest.json ─────────────────────────────
  const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
  console.log('🔍 Loading extension from:', extensionDir);
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
    console.error('✋ manifest.json missing in:', fs.readdirSync(extensionDir));
    process.exit(1);
  }

  // ─── Launch Puppeteer with your local Chrome and extension flags ────────────────
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',  
    headless: false,   // must be headful
    ignoreDefaultArgs: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      'about:blank'
    ],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    userDataDir: path.join(__dirname, 'tmp_profile')
  });

  // ─── Dump the actual Chrome flags so you can confirm they’re applied ───────────
  const proc = browser.process();
  console.log('\n🐚 Spawn args:\n', proc.spawnargs.join(' '));

  // ─── Hit a real page (to kick off MV3 service-worker / content-scripts) ─────────
  const page = await browser.newPage();
  await page.goto('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ─── List all targets—look for chrome-extension:// entries ─────────────────────
  console.log('\n🔌 All targets after navigation:');
  (await browser.targets()).forEach(t => console.log(` • [${t.type()}] ${t.url()}`));

  const loaded = (await browser.targets()).some(t => t.url().startsWith('chrome-extension://'));
  if (loaded) console.log('\n✅ Consent‑O‑Matic loaded!');
  else console.error('\n❌ Consent‑O‑Matic did NOT load!');

  await browser.close();
})();
