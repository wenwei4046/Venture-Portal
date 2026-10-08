// Screenshot prototype states: node shoot-proto.mjs <statesFile.json> [onlyName...]
// statesFile: [{ "name": "today", "attrs": { "platform": "ios", "screen": "today" }, "w": 414, "h": 868,
//               "actions": [ { "click": "text=Akemi" } ], "scrollTo": 0 }]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const protoDir = path.join(here, '../design_handoff_houzs_revenue_app/prototype');
const outDir = path.join(here, '../shots/proto');
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
await new Promise(r => server.listen(4599, r));

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const st of states) {
    if (only.size && !only.has(st.name)) continue;
    const attrs = Object.entries(st.attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    const w = st.w || 414, h = st.h || 868;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body style="margin:0"><x-dc><helmet><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#fff}</style></helmet><dc-import name="RevenueApp" ${attrs} hint-size="${w}px,${h}px"></dc-import></x-dc></body></html>`;
    const file = `_state-${st.name}.html`;
    fs.writeFileSync(path.join(protoDir, file), html);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: st.dpr || 1 });
    await page.goto(`http://localhost:4599/${file}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    for (const a of st.actions || []) {
      if (a.click) await page.locator(a.click).first().click();
      if (a.eval) await page.evaluate(a.eval);
      await page.waitForTimeout(a.wait || 500);
    }
    if (st.scrollTo != null) {
      await page.evaluate(y => { const m = document.querySelector('[data-rv-scroll]'); if (m) m.scrollTop = y; }, st.scrollTo);
      await page.waitForTimeout(400);
    }
    const out = path.join(outDir, `${st.name}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
    if (st.dumpScroll) {
      const sh = await page.evaluate(() => { const m = document.querySelector('[data-rv-scroll]'); return m ? { scrollHeight: m.scrollHeight, clientHeight: m.clientHeight } : null; });
      console.log(st.name, 'scroll', JSON.stringify(sh));
    }
    console.log('shot', st.name, '->', out);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
