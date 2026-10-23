/**
 * The CRM desktop against the redesign v2 handoff (2026-10-23, docs/design_handoff_crm_redesign_v3): screenshots a
 * frame of `CRM Desktop.dc.html` and the app's same page, both at the frame's size, in headless Chrome, so the two can
 * be compared side by side (the demo data differ, so this is not a pixel diff).
 *
 *   dev server on CRM_BASE (default http://localhost:3107)
 *   node tools/crm-design/shots-v2.mjs <outDir> <frame>[,<frame>…]        e.g. p03,p05
 *
 * Each frame writes <out>/<frame>-proto.png and, when APP has a scene for it, <out>/<frame>-app.png.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [out, list] = process.argv.slice(2);
if (!out || !list) { console.error("usage: node tools/crm-design/shots-v2.mjs <outDir> <frame,frame>"); process.exit(1); }
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../..");
const dir = join(repo, "docs/design_handoff_crm_redesign_v3");
const BASE = process.env.CRM_BASE ?? "http://localhost:3107";
// PHONE=1: the phone frames of CRM Phone.dc.html (ids sM01 … sT04b, 430 × 932) against the app in its iPhone frame; CRM_AS picks Mine (rs) or Team (hod).
const PHONE = process.env.PHONE === "1";
const phoneUrl = (f) => `${BASE}/member/preview?app=proto&role=principal&device=ios&page=account&view=crm&crmAs=${f.startsWith("T") ? "hod" : "rs"}`;
const APP_URL = PHONE ? phoneUrl("M")
  : `${BASE}/member/preview?app=proto&role=principal&device=desktop&page=account&view=crm&crmAs=hod`;
// The app's way to each frame: clicks by exact visible text (the CRM nav, then the page's own tabs).
const APP = {
  p01: [["Insight"]], p01b: [["Insight"], ["Ads performance"]], p02: [["Inbox"], ["Lim Wei Jie"]], p02b: [["Inbox"], ["Lim Wei Jie"], ["Audit log"]], p03: [["Contacts"]], p04: [["Calendar"]],
  p05: [["Ads Performance"]], p06: [["Assignment"]], p06b: [["Assignment"], ["Leads by ad"]], p06c: [["Assignment"], ["Active members"]],
  p07: [["Showrooms"]], p08: [["Customer form"]], p09: [["Channels"]], p10: [["Settings"]], p11: [["Audit log"]],
  p12: [["Reports"]], p12b: [["Reports"], ["Lead sources & status"]], p12c: [["Reports"], ["Salespeople"]], p12c2: [["Reports"], ["Salespeople"], ["Farah Aziz"]], "app-newchat": [["Inbox"], ["New chat"]], "app-addcust": [["Contacts"], ["Add customer"]], "app-splitfold": [["Assignment"], ["Collapse"]], p06b2: [["Assignment"], ["Leads by ad"], ["Farah Aziz"]],
};

/** The phone app's way to each frame: taps by visible text or aria-label. Filled in frame by frame. */
const PHONE_APP = {
  M01: [], M04: [["Lim Wei Jie"]], M09: [["Contacts"]], M10: [["Calendar"]], M11: [["Insight"]], M12: [["Profile"]], M13: [["Profile"], ["Notifications"]],
  T01: [], T02: [["Inbox"]], T03: [["Assignment"]], T05: [["Calendar"]], T06: [["Profile"]], T07: [["Profile"], ["Showrooms"]],
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const p = join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(dir) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p));
}).listen(3411);

const port = 9337;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "crmv2-"))}`, "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function click(text) {
  const c = await js(`(() => { const all = [...document.body.querySelectorAll("*")].filter(e => e.offsetParent !== null && e.children.length < 12 && ((e.innerText || "").trim() === ${JSON.stringify(text)} || e.getAttribute("aria-label") === ${JSON.stringify(text)}));
    const vis = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; }); const el = vis.find(e => e.getBoundingClientRect().left >= 72) || vis.at(0) || all.at(0); if (!el) return null; el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!c) { console.log("  not found:", text); return; }
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await sleep(900);
}
async function capture(clip) {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  return Buffer.from(r.result.data, "base64");
}

try {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(t => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  await send("Page.enable"); await send("Runtime.enable");
  for (const f of list.split(",")) {
    // An app-only scene (no frame in the prototype, e.g. a sheet the design does not draw): the app at 1440 × 900 alone.
    let box = PHONE ? { x: 0, y: 0, width: 430, height: 932 } : { x: 0, y: 0, width: 1440, height: 900 };
    const fid = PHONE ? `s${f}` : f;
    if (!f.startsWith("app-")) {
    // The prototype: the canvas with every other frame hidden; the frame's own box captured.
    await send("Emulation.setDeviceMetricsOverride", { width: 2000, height: 1300, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: PHONE ? "http://127.0.0.1:3411/CRM%20Phone.dc.html" : "http://127.0.0.1:3411/CRM%20Desktop.dc.html" });
    for (let i = 0; i < 60; i++) { await sleep(250); if (await js(`!!document.getElementById(${JSON.stringify(fid)})`)) break; }
    await js("document.fonts.ready.then(() => true)"); await sleep(600);
    box = await js(`(() => { const all = [...document.querySelectorAll('[data-screen-label]')]; all.forEach(e => e.style.display = e.id === ${JSON.stringify(fid)} ? 'flex' : 'none');
      const sec = document.querySelector('section'); if (sec) { sec.style.padding = '0'; sec.firstElementChild.style.display = 'none'; sec.children[1].style.display = 'block'; }
      const fr = document.getElementById(${JSON.stringify(fid)}); fr.firstElementChild.style.display = 'none'; const b = fr.children[1]; b.style.borderRadius = '0'; b.style.boxShadow = 'none';
      window.scrollTo(0, 0); const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    await sleep(300);
    writeFileSync(join(out, `${f}-proto.png`), await capture(box));
    // The frame as rendered (its inline styles are the spec): <out>/<frame>.html.
    writeFileSync(join(out, `${f}.html`), await js(`document.getElementById(${JSON.stringify(fid)}).children[1].outerHTML`));
    }
    const steps = PHONE ? (PHONE_APP[f] ?? null) : APP[f];
    if (steps) {
      await send("Emulation.setDeviceMetricsOverride", { width: box.width, height: box.height, deviceScaleFactor: 1, mobile: PHONE });
      await send("Page.navigate", { url: PHONE ? phoneUrl(f) : APP_URL });
      for (let i = 0; i < 80; i++) { await sleep(250); if (await js(`[...document.querySelectorAll('*')].some(e => e.offsetParent !== null && (e.innerText || '').trim() === ${JSON.stringify(PHONE ? (f.startsWith("T") ? "Assignment" : "Inbox") : "Audit log")})`)) break; }
      await js("document.fonts.ready.then(() => true)"); await sleep(800);
      for (const [t] of steps) await click(t);
      writeFileSync(join(out, `${f}-app.png`), await capture({ x: 0, y: 0, width: box.width, height: box.height }));
    }
    console.log("shot", f, `${box.width}x${box.height}`);
  }
} finally { ws?.close(); chrome.kill(); server.close(); }
