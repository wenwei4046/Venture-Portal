// Measure the same elements on the Product List prototype and on the live app, then diff them.
//   node measure-pl.mjs proto <states.json> > proto.json
//   APP_BASE=http://localhost:3210 LOGIN_PASSWORD=… node measure-pl.mjs live <states.json> > live.json
//   node measure-pl.mjs diff proto.json live.json
// states: [{ "name", "proto": { attrs, actions }, "live": { path, actions }, "texts": ["SKU Master", …] }]
// An element is found by its visible text: the deepest element whose whole text is exactly that, then
// climbed while its parent says the same — the top of that chain is the box (a button around a span).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, a1, a2] = process.argv.slice(2);

const PROPS_TEXT = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'lineHeight', 'textTransform', 'textDecorationLine'];
const PROPS_BOX = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor', 'borderLeftWidth', 'borderTopLeftRadius', 'backgroundColor', 'boxShadow', 'opacity'];

function dumpFn(texts) {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('body *')].filter(el => !el.closest('svg') && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');
  const out = {};
  for (const key of texts) {
    // "Sofa#2" = the second element saying "Sofa", in document order.
    const m = /^(.*)#(\d+)$/.exec(key);
    const t = m ? m[1] : key, nth = m ? Number(m[2]) : 1;
    const cands = all.filter(el => {
      if (norm(el.textContent) !== t) return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const leaves = cands.filter(el => !cands.some(o => o !== el && el.contains(o)));
    // A wrapper chain saying the same thing is one element: keep each chain's deepest only.
    const deepest = leaves[nth - 1];
    if (!deepest) { out[key] = null; continue; }
    const t2 = t;
    let top = deepest;
    while (top.parentElement && norm(top.parentElement.textContent) === t2 && top.parentElement !== document.body) top = top.parentElement;
    const cs = getComputedStyle(deepest), bs = getComputedStyle(top);
    const r = top.getBoundingClientRect();
    const rec = { tag: top.tagName.toLowerCase(), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.x), y: Math.round(r.y) };
    for (const p of window.__PT) rec[p] = cs[p];
    for (const p of window.__PB) rec['box.' + p] = bs[p];
    rec.fontFamily = (rec.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    out[key] = rec;
  }
  return out;
}

async function runProto(states) {
  const protoDir = path.join(here, '../design_handoff_product_list/prototype');
  const pw = await import(pathToFileURL('C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs').href);
  const exe = 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
  const server = http.createServer((req, res) => {
    const p = path.join(protoDir, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(protoDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(4602, r));
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const result = {};
  try {
    for (const st of states) {
      const attrs0 = { platform: 'desktop', 'desk-style': 'a', principal: 'true', screen: 'products', ...(st.proto?.attrs || {}) };
      const attrs = Object.entries(attrs0).map(([k, v]) => `${k}="${v}"`).join(' ');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body style="margin:0"><x-dc><helmet><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#fff}</style></helmet><dc-import name="RevenueApp" ${attrs} hint-size="1440px,900px"></dc-import></x-dc></body></html>`;
      const file = `_measure-${st.name}.html`;
      fs.writeFileSync(path.join(protoDir, file), html);
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://localhost:4602/${file}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      for (const a of st.proto?.actions || []) {
        if (a.click) await page.locator(a.click).first().click();
        if (a.fill) await page.locator(a.fill[0]).first().fill(a.fill[1]);
        await page.waitForTimeout(a.wait || 500);
      }
      await page.evaluate(([pt, pb]) => { window.__PT = pt; window.__PB = pb; }, [PROPS_TEXT, PROPS_BOX]);
      result[st.name] = await page.evaluate(dumpFn, st.texts);
      await page.close();
      fs.unlinkSync(path.join(protoDir, file));
    }
  } finally { await browser.close(); server.close(); }
  return result;
}

async function runLive(states) {
  const base = process.env.APP_BASE || 'http://localhost:3210';
  const pw = await import(pathToFileURL('C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs').href);
  const exe = 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
  const stateFile = path.join(here, '../.auth-principal.json');
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true });
  const result = {};
  try {
    if (!fs.existsSync(stateFile) || Date.now() - fs.statSync(stateFile).mtimeMs > 50 * 60_000) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 120000 });
      await page.fill('input[name=email]', process.env.LOGIN_EMAIL || 'principal@venture.my');
      await page.fill('input[name=password]', process.env.LOGIN_PASSWORD);
      await page.keyboard.press('Enter');
      await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 120000 });
      await ctx.storageState({ path: stateFile });
      await ctx.close();
    }
    for (const st of states) {
      const ctx = await browser.newContext({ storageState: stateFile, viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(base + st.live.path, { waitUntil: 'networkidle', timeout: 180000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.waitForTimeout(st.live.settle || 3000);
      for (const a of st.live.actions || []) {
        if (a.click) await page.locator(a.click).first().click();
        if (a.fill) await page.locator(a.fill[0]).first().fill(a.fill[1]);
        await page.waitForTimeout(a.wait || 800);
      }
      await page.evaluate(([pt, pb]) => { window.__PT = pt; window.__PB = pb; }, [PROPS_TEXT, PROPS_BOX]);
      result[st.name] = await page.evaluate(dumpFn, st.texts);
      await ctx.close();
    }
  } finally { await browser.close(); }
  return result;
}

function diff(protoFile, liveFile) {
  const P = JSON.parse(fs.readFileSync(protoFile, 'utf8')), L = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
  let n = 0;
  for (const [state, texts] of Object.entries(P)) {
    for (const [t, p] of Object.entries(texts)) {
      const l = L[state]?.[t];
      if (!p || !l) { if (p || l) { console.log(`${state} · "${t}": ${p ? 'missing on live' : 'missing on prototype'}`); n++; } continue; }
      const bad = [];
      for (const k of Object.keys(p)) {
        if (k === 'x' || k === 'y') continue;
        // A border colour says nothing while that border is 0 wide (Tailwind's reset colours them all).
        if (k === 'box.borderTopColor' && p['box.borderTopWidth'] === '0px' && l['box.borderTopWidth'] === '0px') continue;
        if (k === 'box.borderBottomColor' && p['box.borderBottomWidth'] === '0px' && l['box.borderBottomWidth'] === '0px') continue;
        if (k === 'w' || k === 'h') { if (Math.abs(p[k] - l[k]) > 0.6) bad.push(`${k} ${p[k]}→${l[k]}`); continue; }
        if (String(p[k]) !== String(l[k])) bad.push(`${k} ${p[k]}→${l[k]}`);
      }
      if (bad.length) { console.log(`${state} · "${t}" <${p.tag}/${l.tag}>: ${bad.join('; ')}`); n++; }
    }
  }
  console.log(`\n${n} element(s) differ`);
}

if (mode === 'diff') diff(a1, a2);
else {
  const states = JSON.parse(fs.readFileSync(path.resolve(a1), 'utf8')).filter(s => !a2 || s.name === a2);
  const res = mode === 'proto' ? await runProto(states) : await runLive(states);
  process.stdout.write(JSON.stringify(res, null, 1));
}
