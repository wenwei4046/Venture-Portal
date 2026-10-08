// Screenshot the Product List prototype (design_handoff_product_list) states:
//   node shoot-proto-pl.mjs <statesFile.json> [onlyName...]
// statesFile: [{ "name": "pl-sku", "attrs": { "platform": "desktop", "screen": "products", "product-tab": "sku" },
//               "w": 1440, "h": 900, "actions": [{ "click": "text=Sofa" }], "plScroll": 0 }]
// Every state is the desktop Revenue app (desk-style a, a Principal) unless attrs say otherwise.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const protoDir = path.join(here, '../design_handoff_product_list/prototype');
const outDir = path.join(here, '../shots/proto-pl');
fs.mkdirSync(outDir, { recursive: true });

const pwPath = 'C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const exe = 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const states = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = new Set(process.argv.slice(3));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(protoDir, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(protoDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(4600, r));

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const st of states) {
    if (only.size && !only.has(st.name)) continue;
    const all = { platform: 'desktop', 'desk-style': 'a', principal: 'true', screen: 'products', ...st.attrs };
    const attrs = Object.entries(all).map(([k, v]) => `${k}="${v}"`).join(' ');
    const w = st.w || 1440, h = st.h || 900;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body style="margin:0"><x-dc><helmet><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#fff}</style></helmet><dc-import name="RevenueApp" ${attrs} hint-size="${w}px,${h}px"></dc-import></x-dc></body></html>`;
    const file = `_state-${st.name}.html`;
    fs.writeFileSync(path.join(protoDir, file), html);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: st.dpr || 1 });
    await page.goto(`http://localhost:4600/${file}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    for (const a of st.actions || []) {
      if (a.click) await page.locator(a.click).first().click();
      if (a.fill) await page.locator(a.fill[0]).first().fill(a.fill[1]);
      if (a.select) await page.locator(a.select[0]).first().selectOption(a.select[1]);
      if (a.eval) await page.evaluate(a.eval);
      await page.waitForTimeout(a.wait || 500);
    }
    if (st.plScroll != null) {
      await page.evaluate(y => { const m = document.querySelector('.pl-scroll'); if (m) m.scrollTop = y; }, st.plScroll);
      await page.waitForTimeout(400);
    }
    const out = path.join(outDir, `${st.name}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('shot', st.name, '->', out);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
