/**
 * The CRM as it stands, captured for a redesign in Claude Design (2026-10-17 — the owner: "帮我做交接包，我想要重新设计
 * UI … 用 claude design", the phone CRM and the desktop CRM). Every screen as a PNG and as a standalone HTML snapshot
 * (the markup as drawn, the CSS rules it uses inlined, no scripts), on the preview's demo data:
 *   phone-mine/   the salesperson's CRM on a phone (430 × 932, @2x)
 *   phone-team/   the Control panel on a phone (the Principal)
 *   desktop/      the Control panel on a computer (1440 × 900)
 *   html/         the snapshots, named as the PNGs
 *
 *   npm run dev            (or any dev server; CRM_BASE=http://localhost:3107)
 *   node tools/crm-design/capture-redesign.mjs docs/design/crm-redesign
 *
 * Needs Google Chrome (CHROME=<path> for another Chromium) and Node 22+ (its WebSocket).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = process.argv[2];
if (!out) { console.error("usage: node tools/crm-design/capture-redesign.mjs <outDir>"); process.exit(1); }
for (const d of ["phone-mine", "phone-team", "desktop", "html"]) mkdirSync(join(out, d), { recursive: true });
const base = (process.env.CRM_BASE ?? "http://localhost:3000") + "/member/preview?app=proto&page=account&view=crm";
const port = 9336;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "crmredesign-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
let W = 1440, H = 900;
async function open(url, w, h, mobile, ready) {
  W = w; H = h;
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) { await sleep(500); if (await js(ready.startsWith("js:") ? ready.slice(3) : `!!document.querySelector(${JSON.stringify(ready)})`)) break; }
  await sleep(2000);
}
/** Click the visible element whose own text is `text` (inside `within`, else anywhere). */
const tap = async (text, within = "body") => {
  const ok = await js(`(() => {
    const root = ${within === "nav" ? "[...document.querySelectorAll('nav')].reverse().find(n => n.offsetParent !== null && /Contacts|Assignment/.test(n.innerText))" : within === "lastAside" ? "[...document.querySelectorAll('aside')].find(x => x.innerText.includes('Audit log'))" : `document.querySelector(${JSON.stringify(within)})`} ?? document.body;
    const all = [...root.querySelectorAll('button, a, [role=button], span, div, strong, li, label')];
    const el = all.filter(e => e.offsetParent !== null && (e.innerText || '').trim() === ${JSON.stringify(text)}).pop();
    if (!el) return false; el.click(); return true; })()`);
  if (!ok) console.log("  not found:", text);
  await sleep(1100);
  return ok;
};
const png = async path => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(r.result.data, "base64")); };
// A standalone page: what is on screen, with every stylesheet rule it uses inlined. No scripts.
const SNAP = `(() => {
  const root = document.querySelector("[data-revenue-app]") ?? document.body;
  const used = sel => { try { return root.matches(sel) || !!root.querySelector(sel) || /^(:root|html|body)/.test(sel); } catch { return false; } };
  const strip = sel => sel.replace(/::?(before|after|placeholder|-webkit-[a-z-]+|hover|focus-visible|focus-within|focus|active|disabled)/g, "");
  const keep = rules => [...rules].map(r => {
    if (r.selectorText !== undefined) return used(strip(r.selectorText)) ? r.cssText : "";
    if (r.cssRules && r.conditionText !== undefined) {
      const inner = keep(r.cssRules), kind = r.constructor.name.replace(/^CSS/, "").replace(/Rule$/, "").toLowerCase();
      return inner ? "@" + kind + " " + r.conditionText + " {" + inner + "}" : "";
    }
    if (r.constructor.name === "CSSKeyframesRule" || r.constructor.name === "CSSFontFaceRule") return r.cssText;
    return "";
  }).filter(Boolean).join("\\n");
  const css = [...document.styleSheets].map(s => { try { return keep(s.cssRules); } catch { return ""; } }).join("\\n");
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, nextjs-portal").forEach(n => n.remove());
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=' + innerWidth + '">'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@500;600;700;800&display=swap">'
    + '<style>body{margin:0;font-family:Inter,sans-serif;}</style><style>' + css + '</style></head><body>' + clone.outerHTML + '</body></html>';
})()`;
async function shot(dir, name, title) {
  // The dev server's own badge (the round N) is no part of the design.
  await js("document.querySelectorAll('nextjs-portal').forEach(n => n.style.display = 'none')");
  await png(join(out, dir, `${name}.png`));
  writeFileSync(join(out, "html", `${dir}--${name}.html`), await js(SNAP) ?? "");
  console.log(dir, name, "·", title);
}

try {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(t => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  await send("Page.enable"); await send("Runtime.enable");

  const only = process.env.ONLY;
  if (!only || only === "phone") {
  // ── Phone · Mine (a salesperson) ──
  const mine = `${base}&device=ios&crmAs=a1`;
  await open(mine, 430, 932, true, "[data-revenue-app] h1");
  await shot("phone-mine", "01-inbox", "Inbox");
  // The CRM's inbox (the Revenue app's screens stay drawn behind it): its first row's name.
  await js("[...document.querySelectorAll('[data-inbox-row]')].find(r => r.offsetParent !== null)?.querySelector('strong')?.click()"); await sleep(1500);
  await shot("phone-mine", "02-chat", "A chat");
  await js("document.querySelector('[data-composer] [title=Attach]')?.click()"); await sleep(900);
  await shot("phone-mine", "03-chat-attach", "A chat · Attach");
  await js("document.querySelector('[data-composer] [title=Attach]')?.click()"); await sleep(400);
  await js("document.querySelector('[data-composer] [title=Sticker]')?.click()"); await sleep(900);
  await shot("phone-mine", "04-chat-emoji", "A chat · Emoji panel");
  await open(mine, 430, 932, true, "[data-revenue-app] h1");
  for (const [n, t] of [["05-contacts", "Contacts"], ["06-calendar", "Calendar"], ["07-insight", "Insight"], ["08-profile", "Profile"]]) {
    await tap(t, "nav"); await shot("phone-mine", n, t);
  }
  await tap("Notifications"); await shot("phone-mine", "09-notifications", "Profile › Notifications");

  // ── Phone · Team (the Principal's Control panel) ──
  const team = `${base}&device=ios&crmAs=boss`;
  await open(team, 430, 932, true, "[data-revenue-app] h1");
  await shot("phone-team", "01-insight", "Insight");
  await tap("Inbox", "nav"); await shot("phone-team", "02-inbox-board", "Inbox · the board");
  await tap("Assignment", "nav"); await shot("phone-team", "03-assignment", "Assignment");
  await tap("Ads to teams"); await shot("phone-team", "04-ads-to-teams", "Assignment › Ads to teams");
  await js("[...document.querySelectorAll('strong, span')].find(e => e.offsetParent && /·/.test(e.innerText) && e.closest('[style*=cursor]'))?.click()"); await sleep(1100);
  await shot("phone-team", "05-ad-editor", "Ads to teams › an ad's split");
  await open(team, 430, 932, true, "[data-revenue-app] h1");
  await tap("Calendar", "nav"); await shot("phone-team", "06-calendar", "Calendar");
  await tap("Profile", "nav"); await shot("phone-team", "07-profile", "Profile");
  await tap("Showrooms"); await shot("phone-team", "08-showrooms", "Profile › Showrooms");

  }
  if (!only || only === "desktop") {
  // ── Desktop · the Control panel ──
  const desk = `${base}&device=desktop&role=principal&crmAs=boss`;
  // The CRM's own sidebar (the Revenue app's comes first): wait until it is drawn.
  await open(desk, 1440, 900, false, "js:document.querySelectorAll('aside').length > 1 && [...document.querySelectorAll('aside')].pop().innerText.includes('Audit log')");
  const pages = [["01-insight", "Insight"], ["02-inbox", "Inbox"], ["04-contacts", "Contacts"], ["06-calendar", "Calendar"], ["07-ads-performance", "Ads Performance"],
    ["08-assignment", "Assignment"], ["09-showrooms", "Showrooms"], ["10-customer-form", "Customer form"], ["11-channels", "Channels"], ["12-settings", "Settings"], ["13-audit-log", "Audit log"]];
  // PAGES=Settings,Audit log takes only those (a full pass takes minutes).
  const want = process.env.PAGES ? process.env.PAGES.split(",") : null;
  for (const [n, t] of pages.filter(([, t]) => !want || want.includes(t))) {
    await tap(t, "lastAside"); await shot("desktop", n, t);
    if (process.env.EVAL) console.log(JSON.stringify(await js(process.env.EVAL)));
    if (t === "Inbox") {
      await js("[...document.querySelectorAll('[data-revenue-app] [style*=cursor]')].find(e => e.offsetParent && /Lim Wei Jie|Chong Li Na|Tan Mei Ling/.test(e.innerText) && e.innerText.length < 260)?.click()"); await sleep(1500);
      await shot("desktop", "03-inbox-chat", "Inbox · a chat open");
    }
    if (t === "Contacts") {
      await js("[...document.querySelectorAll('[data-revenue-app] button[title=\"Show in the rail\"]')][0]?.click()"); await sleep(1200);
      await shot("desktop", "05-contacts-customer", "Contacts · a customer in the rail");
    }
  }
  }
} finally { ws?.close(); chrome.kill(); }
