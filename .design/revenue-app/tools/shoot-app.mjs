// Screenshot the rebuilt app's design preview: node shoot-app.mjs <states.json> [onlyName...]
// states: [{ "name": "today", "url": "/member/preview?app=proto&device=ios", "w": 414, "h": 868,
//            "actions": [{ "click": "role=button[name='Notifications']" }], "scrollTo": 0 }]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '../shots/app');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.APP_BASE || 'http://localhost:3100';
const pwPath = 'C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const exe = 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const states = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = new Set(process.argv.slice(3));

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const st of states) {
    if (only.size && !only.has(st.name)) continue;
    if (!st.url) continue;
    const w = st.w || 414, h = st.h || 868;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: st.dpr || 1 });
    page.on('pageerror', e => console.log('pageerror', st.name, e.message));
    await page.goto(base + st.url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.addStyleTag({ content: 'html,body{background:#fff!important} nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    for (const a of st.appActions || []) {
      if (a.click) await page.locator(a.click).first().click();
      if (a.eval) await page.evaluate(a.eval);
      await page.waitForTimeout(a.wait || 600);
    }
    if (st.scrollTo != null) {
      await page.evaluate(y => { const m = document.querySelector('main'); if (m) m.scrollTop = y; }, st.scrollTo);
      await page.waitForTimeout(400);
    }
    const out = path.join(outDir, `${st.name}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('shot', st.name);
    await page.close();
  }
} finally {
  await browser.close();
}
