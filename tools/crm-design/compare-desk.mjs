/**
 * The CRM desktop against its prototype, pixel by pixel (CRM Desktop rev 1, 2026-10-13).
 *
 * For each frame of docs/design/crm-desktop-rev1/prototypes/CRM Desktop rev 1.dc.html (its <dc-import> props), it
 * renders the PROTOTYPE (a copy of prototypes/ with one page per frame, served here) and the APP
 * (/member/preview?app=<app>&<same props>), screenshots both at the frame's size in headless Chrome, and compares
 * every pixel in the browser itself. Writes <out>/<frame>-proto.png, -app.png, -diff.png (differences in red) and
 * report.json; prints one line per frame.
 *
 *   npm run dev                       (the app at http://localhost:3000)
 *   node tools/crm-design/compare-desk.mjs <outDir> [frames,comma,separated] [app=desk-proto]
 *
 * A difference under 0.5 of a channel step is antialiasing noise and not counted (threshold below).
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const [out, only, appArg] = process.argv.slice(2);
if (!out) { console.error("usage: node tools/crm-design/compare-desk.mjs <outDir> [frames] [app]"); process.exit(1); }
const APP = appArg ?? "desk-proto";
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../..");
const protoDir = join(repo, "docs/design_handoff_crm_desktop_v2/prototypes");
const canvas = readFileSync(join(protoDir, "CRM Desktop rev 1.dc.html"), "utf8");
const frames = [...canvas.matchAll(/<div id="([0-9a-z]+)"[\s\S]*?(<dc-import [^>]*>)/g)].map(m => {
  const props = Object.fromEntries([...m[2].matchAll(/([a-z-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]).filter(([k]) => k !== "name" && k !== "hint-size")
    .map(([k, v]) => [k, v === "{{ true }}" ? "true" : v === "{{ false }}" ? "false" : v]));
  // v2 (2026-10-15): every frame is drawn by CrmFrame v2 — the canvas still names rev 1's for Steps 1–4, whose pages v2
  // keeps. The salesperson's desktop (variant rs) is not built.
  return { id: m[1], tag: m[2].replace(/name="CrmFrame"/, 'name="CrmFrame v2"'), props, w: Number(props.w ?? 1440) };
}).filter(f => f.props.variant !== "rs").filter(f => !only || only.split(",").includes(f.id));

// The prototype, one page per frame: the canvas's own <dc-import>, on the canvas's ground.
const harness = mkdtempSync(join(tmpdir(), "crm-proto-"));
cpSync(protoDir, harness, { recursive: true });
for (const f of frames) {
  writeFileSync(join(harness, `${f.id}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body style="margin:0;background:#EFE8E2"><style>a{color:#BD4A19;} a:hover{color:#A3371A;}</style>
<x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"></helmet>${f.tag.replace(/toast="\{\{ true \}\}"/, 'toast="{{ true }}"')}</dc-import></x-dc></body></html>`);
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const p = join(harness, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(harness) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p));
}).listen(3410);

const port = 9336;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "crmcmp-"))}`, "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function shot(url, w, h, ready) {
  await send("Emulation.setDeviceMetricsOverride", { width: w + 80, height: h + 80, deviceScaleFactor: 1, mobile: false });
  // v2 keeps its place in localStorage (refresh returns to it), keyed by the frame's props: each shot starts clean.
  await send("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "local_storage,session_storage" });
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) { await sleep(250); if (await js(ready)) break; }
  await js("document.fonts.ready.then(() => true)"); await sleep(800);
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  return r.result.data;
}
// Compared in the page: both images on canvases, every pixel; red where they differ.
const DIFF = `async (a, b) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
  const [A, B] = await Promise.all([load(a), load(b)]); const w = A.width, h = A.height;
  const ctx = i => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(i, 0, 0); return x; };
  const da = ctx(A).getImageData(0, 0, w, h).data, db = ctx(B).getImageData(0, 0, w, h).data;
  const oc = document.createElement("canvas"); oc.width = w; oc.height = h; const ox = oc.getContext("2d"); ox.drawImage(A, 0, 0); ox.fillStyle = "rgba(255,255,255,.75)"; ox.fillRect(0, 0, w, h);
  const od = ox.getImageData(0, 0, w, h); let n = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]);
    if (d > 24) { n++; od.data[i] = 220; od.data[i+1] = 30; od.data[i+2] = 30; od.data[i+3] = 255; const p = i / 4, x = p % w, y = (p / w) | 0; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; } }
  ox.putImageData(od, 0, 0);
  return { n, pct: n / (w * h) * 100, box: n ? [minX, minY, maxX, maxY] : null, img: oc.toDataURL("image/png").split(",")[1] };
}`;

const report = [];
try {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(t => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  await send("Page.enable"); await send("Runtime.enable");
  for (const f of frames) {
    const h = f.w === 1440 ? 900 : 800;
    const proto = await shot(`http://localhost:3410/${f.id}.html`, f.w, h, "!!document.querySelector('aside, header')");
    const q = new URLSearchParams({ app: APP, ...f.props }).toString();
    const app = await shot(`${process.env.CRM_BASE ?? "http://localhost:3000"}/member/preview?${q}`, f.w, h, "!!document.querySelector('aside, header')");
    writeFileSync(join(out, `${f.id}-proto.png`), Buffer.from(proto, "base64"));
    writeFileSync(join(out, `${f.id}-app.png`), Buffer.from(app, "base64"));
    await send("Page.navigate", { url: "about:blank" }); await sleep(200);
    const d = await js(`(${DIFF})(${JSON.stringify(proto)}, ${JSON.stringify(app)})`);
    writeFileSync(join(out, `${f.id}-diff.png`), Buffer.from(d.img, "base64"));
    report.push({ frame: f.id, props: f.props, differentPixels: d.n, percent: +d.pct.toFixed(4), box: d.box });
    console.log(`${d.n === 0 ? "SAME" : "DIFF"}  ${f.id.padEnd(3)} ${String(d.n).padStart(8)} px  ${d.pct.toFixed(3)}%  ${d.box ? "in " + d.box.join(",") : ""}`);
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
} finally { ws?.close(); chrome.kill(); server.close(); }
