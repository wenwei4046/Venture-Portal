/**
 * The 4a redesign's prototype frames as PNGs (2026-10-18, docs/design_handoff_crm_redesign): every
 * `[data-screen-label]` frame of `CRM Phone.dc.html` and `CRM Desktop.dc.html`, at its own size, so the app's
 * screens can be laid beside them. Serve the handoff folder first (any static server), then
 *   PROTO_BASE=http://localhost:4600 node tools/crm-design/capture-4a.mjs <outDir> [phone|desktop]
 * Needs Google Chrome (CHROME=<path> for another Chromium) and Node 22+ (its WebSocket).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = process.argv[2];
if (!out) { console.error("usage: node tools/crm-design/capture-4a.mjs <outDir> [phone|desktop]"); process.exit(1); }
const only = process.argv[3];
const base = process.env.PROTO_BASE ?? "http://localhost:4600";
const port = 9337;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "crm4a-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch { /* not up yet */ }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  await send("Page.enable");
  for (const [file, dir, scale] of [["CRM Phone.dc.html", "phone", 2], ["CRM Desktop.dc.html", "desktop", 1]]) {
    if (only && only !== dir) continue;
    mkdirSync(join(out, dir), { recursive: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: scale, mobile: false });
    await send("Page.navigate", { url: `${base}/${encodeURIComponent(file)}` });
    await sleep(4000);
    await js("document.fonts.ready.then(() => true)");
    // Each labelled block holds its title row and then the frame itself (the fixed-size box).
    const frames = await js(`[...document.querySelectorAll('[data-screen-label]')].map(e => {
      const f = e.lastElementChild; const r = f.getBoundingClientRect();
      return { label: e.getAttribute('data-screen-label'), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    })`);
    for (const f of frames) {
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
        clip: { x: f.x, y: f.y, width: f.w, height: f.h, scale: 1 } });
      const name = f.label.replace(/[^\w]+/g, "-").replace(/-+$/, "");
      writeFileSync(join(out, dir, `${name}.png`), Buffer.from(shot.result.data, "base64"));
      console.log(dir, name, `${Math.round(f.w)}x${Math.round(f.h)}`);
    }
  }
} finally {
  try { ws?.close(); } catch { /* closed */ }
  chrome.kill();
}
