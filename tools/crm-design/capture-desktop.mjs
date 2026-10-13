/**
 * The CRM on a computer, captured for design work (2026-10-12): every desktop CRM screen as a 1440 × 900 screenshot
 * (desktop/NN-name.png) and a standalone HTML snapshot (html/NN-name.html — the markup as drawn, with the CSS rules it
 * uses inlined, no scripts), plus the salesperson CRM on a phone (rs-phone/) for reference. What
 * docs/design/crm-desktop/ hands to Claude Design; run it again after the screens change.
 *
 *   npm run dev            (the preview at http://localhost:3000, demo data)
 *   node tools/crm-design/capture-desktop.mjs docs/design/crm-desktop [WIDTHxHEIGHT]
 *
 * Needs Google Chrome (CHROME=<path> to use another Chromium) and Node 22+ (its WebSocket).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = process.argv[2];
if (!out) { console.error("usage: node tools/crm-design/capture-desktop.mjs <outDir> [1440x900]"); process.exit(1); }
const [W, H] = (process.argv[3] ?? "1440x900").split("x").map(Number);
mkdirSync(join(out, "desktop"), { recursive: true });
mkdirSync(join(out, "html"), { recursive: true });
mkdirSync(join(out, "rs-phone"), { recursive: true });
const base = (process.env.CRM_BASE ?? "http://localhost:3000") + "/member/preview?app=proto&role=principal&page=account&view=crm";
const port = 9335;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "crmcap-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function open(url, w, h, mobile, ready) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Page.navigate", { url });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await js(`!!document.querySelector(${JSON.stringify(ready)})`)) break; }
  await sleep(1500);
}
const click = async (sel, text) => { const ok = await js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => (e.innerText || "").trim().startsWith(${JSON.stringify(text)}) && e.offsetParent); if (!el) return false; el.click(); return true; })()`); if (!ok) console.log("  not found:", sel, text); await sleep(800); };
const png = async path => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(r.result.data, "base64")); };
// A standalone page: the CRM's markup as drawn, with every stylesheet the page uses inlined. No scripts.
const SNAP = `(() => {
  const root = document.querySelector("[data-crm-desk]")?.closest("[class*=screen]") ?? document.body;
  // Only the rules something on screen uses (and the at-rules around them, keyframes and fonts).
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
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1440">'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">'
    + '<style>body{margin:0;font-family:Inter,sans-serif;container:rv / inline-size;}</style><style>' + css + '</style></head><body>'
    + '<div data-revenue-app="" style="height:900px;container:rv / inline-size">' + clone.outerHTML + '</div></body></html>';
})()`;
async function desk(name, title) {
  await png(join(out, "desktop", `${name}.png`));
  writeFileSync(join(out, "html", `${name}.html`), (await js(SNAP)).replace(/width=1440/, `width=${W}`).replace(/height:900px/, `height:${H}px`));
  console.log("desktop", name, title);
}

try {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(t => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  await send("Page.enable"); await send("Runtime.enable");

  // ── The desktop Control panel (Principal) ──
  await open(`${base}&device=desktop&crmAs=boss`, W, H, false, "[data-crm-desk] h1");
  await desk("01-insight", "Insight");
  await js("[...document.querySelectorAll('[data-crm-desk] tbody tr')].find(r => r.innerText.includes('Team Kelvin'))?.click()"); await sleep(700);
  await click("[data-crm-desk] button", "Compare with previous period");
  await desk("02-insight-team-open-compare", "Insight · a team open, comparing");
  await js("[...document.querySelectorAll('[data-crm-desk] button')].find(b => b.innerText.includes('Awaiting reply'))?.click()"); await sleep(900);
  await desk("03-insight-awaiting-reply", "Insight · Awaiting reply in the pane");
  await click("[data-crm-desk] nav button", "Inbox");
  await desk("04-inbox-empty-pane", "Inbox · nothing open");
  await js("document.querySelector('[aria-label=Chats] button[class*=row]')?.click()"); await sleep(900);
  await desk("05-inbox-chat", "Inbox · a chat open");
  await click("[data-crm-desk] button", "Board");
  await desk("06-inbox-board", "Inbox · Board");
  await click("[data-crm-desk] button", "Chats");
  await click("[data-crm-desk] button", "Contacts");
  await desk("07-inbox-contacts", "Inbox · Contacts sheet");
  await click("[data-crm-desk] nav button", "Assignment");
  await desk("08-assign-organic", "Assignment · Organic Leads");
  await click("[data-crm-desk] button", "Ads to teams");
  await desk("09-assign-ads", "Assignment · Ads to teams");
  await click("[data-crm-desk] button", "Awaiting reply");
  await desk("10-assign-awaiting", "Assignment · Awaiting reply");
  await click("[data-crm-desk] button", "Full time lead allocation");
  await desk("11-assign-fulltime", "Assignment · Full time lead allocation");
  await click("[data-crm-desk] nav button", "Calendar");
  await desk("12-calendar", "Calendar");
  await js("document.querySelector('[data-crm-desk] button[class*=visit]')?.click()"); await sleep(900);
  await desk("13-calendar-customer-info", "Calendar · Customer info");
  await click("[data-crm-desk] nav button", "Settings");
  await desk("14-settings", "Settings · nothing open");
  for (const [n, t] of [["15-settings-work-type", "Member work type"], ["16-settings-showrooms", "Showrooms"], ["17-settings-templates", "Cold lead templates"], ["18-settings-ads-performance", "Ads Performance"], ["19-settings-notifications", "Notifications"]]) {
    await click("[data-crm-desk] button", t); await desk(n, t);
  }
  // The Director: Team | Mine in the head.
  await open(`${base}&device=desktop&crmAs=hod`, W, H, false, "[data-crm-desk] h1");
  await desk("20-director-insight", "Director · Team | Mine");

  // ── The salesperson CRM on a phone (reference for the RS desktop) ──
  await open(`${base}&device=ios`, 430, 932, true, "[data-revenue-app] h1");
  const rs = async (n) => { await png(join(out, "rs-phone", `${n}.png`)); console.log("rs", n); };
  await rs("01-inbox");
  await js("[...document.querySelectorAll('[data-revenue-app] strong, [data-revenue-app] b, [data-revenue-app] span')].filter(e => e.innerText.trim() === 'Lim Wei Jie').pop()?.click()"); await sleep(900); await rs("02-chat");
  await open(`${base}&device=ios`, 430, 932, true, "[data-revenue-app] h1");
  for (const [n, t] of [["03-contacts", "Contacts"], ["04-calendar", "Calendar"], ["05-insight", "Insight"], ["06-profile", "Profile"]]) {
    await js(`[...document.querySelectorAll('nav span, nav div, nav button')].find(e => e.innerText.trim() === ${JSON.stringify(t)})?.click()`); await sleep(900); await rs(n);
  }
} finally { ws?.close(); chrome.kill(); }
