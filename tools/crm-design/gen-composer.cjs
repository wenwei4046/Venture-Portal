// Generates the salesperson chat's composer (the owner's Claude Design handoff "Typing bar UI mobile chat design",
// 2026-10-14 — docs/design/chat-composer) into src/components/member/crm/sales/SalesComposer.tsx: the prototype's
// composer stack and toast VERBATIM — the One pill typing bar, the Sticker panel, the Attach panel, the strip under them —
// bound to one view model whose names are the prototype's own (sales/vm/composer.ts; sales/ChatComposer.tsx gives it).
// Its press styles (style-active) become sales/composer-press.module.css. What the app does differently is below, each
// with its reason; every patch must match once. Run from the repo: node tools/crm-design/gen-composer.cjs
const fs = require("fs"), path = require("path");
const dc = require("./dc2jsx.cjs");
const P = require("./composer-proto.cjs");
const scaleType = require("./type-scale.cjs");
const repo = path.resolve(__dirname, "../..");
const out = path.join(repo, "src/components/member/crm/sales");

// ── Left out of the app ──
let html = P.stack();
html = P.drop(html, '<sc-if value="{{ p.kb }}">', "sc-if", 1, "the prototype draws a keyboard; on the phone it is the phone's own");
// The owner, 2026-10-14: "这2个分页就不用上线先" — the GIF and Sticker tabs wait for real GIFs (a provider) and real
// sticker artwork; the prototype's are drawn placeholders WhatsApp cannot deliver. Emoji is the panel's only tab.
html = P.drop(html, '<sc-if value="{{ p.isGif }}"', "sc-if", 1, "the GIF tab is not live yet (the owner, 2026-10-14)");
html = P.drop(html, '<sc-if value="{{ p.isStk }}"', "sc-if", 2, "the Sticker tab (its grid, its Add sticker button) is not live yet (the owner, 2026-10-14)");
html = P.drop(html, '<input type="file"', "input", 1, "Create sticker's picker belongs to the Sticker tab");
html = P.drop(html, '<sc-if value="{{ p.barLabels }}"', "sc-if", 1, "the category bar is the design's default style, icons (bottomBar: icons)");

dc.opts.auto = "CP";
let body = dc.convert(html + "\n" + P.toast(), ["p"]);

// ── What the app does differently (each must match once) ──
// The mic is held to record (hold to record, release to send; released on the bin, thrown away — the owner, 2026-10-14):
// while it records, the pill's place holds the CRM's recording row (gen-sales, 2026-10-13) — the bin, the clock — at the
// bar's height (46) and the main button stays the very element under the finger (it shows Send), so the press that started
// the recording is the press that ends it. The bin is white over the wallpaper.
const RECORD = [
  '{!!(p.recOn) && (<>',
  '            <span ref={p.trashRef} onClick={p.recCancel} title="Cancel" style={{ flex: "none", width: "46px", height: "46px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid rgb(235 221 210)", background: "#fff", display: "grid", placeItems: "center", color: "#A3371A", cursor: "pointer" }}>',
  '              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>',
  '            </span>',
  '            <span style={{ flex: "1", minWidth: "0", height: "46px", boxSizing: "border-box", borderRadius: "23px", background: "#FBF1EC", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", fontSize: "15px", fontWeight: "600", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>',
  '              <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "#D93025", animation: "fadeIn 700ms ease-in-out infinite alternate" }}></span>{p.recTime} · Recording…',
  '            </span>',
  '          </>)}',
  '          {!(p.recOn) && (',
].join("\n");
const ABOVE = [
  // The CRM's own rows above the reply box (the 3b design, as SalesChat drew them until 2026-10-14), now floating over the
  // wallpaper with the bar: the message being replied to, and the "/" quick replies while one is typed.
  '{!!(p.replyText) && (<>',
  '        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", margin: "8px 12px 0", padding: "8px 8px 8px 12px", borderRadius: "12px", background: "#F5EBE3" }}>',
  '          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>',
  '            <strong style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{p.replyWho}</strong>',
  '            <span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.replyText}</span>',
  '          </div>',
  '          <span onClick={p.cancelReply} title="Cancel reply" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>',
  '            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M6 18 18 6"></path></svg>',
  '          </span>',
  '        </div>',
  '      </>)}',
  '      {!!(p.slashOpen) && (<>',
  '        <div style={{ flex: "none", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none", margin: "8px 12px 0", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", boxShadow: "0 6px 18px rgba(63,43,34,.10)" }}>',
  '          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px" }}>',
  '            <span style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>Quick replies</span>',
  // Edit opens the chat's quick-replies page — Mine's; the Team side's chat has none (its composer passes no qrEdit).
  '            {!!(p.qrEdit) && (<span onClick={p.qrEdit} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Edit</span>)}',
  '          </div>',
  '          {(p.slashList).map((q, q_i) => (<Fragment key={q_i}>',
  '            <div onClick={q.pick} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "10px 14px", borderTop: q.rule, cursor: "pointer" }} className={H.hov3}>',
  '              <span style={{ fontSize: "13px", fontWeight: "650", color: "#4E2F20" }}>/{q.title}</span>',
  '              <span style={{ fontSize: "14px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.text}</span>',
  '            </div>',
  '          </Fragment>))}',
  '          {!!(p.slashEmpty) && (<>',
  '            <p style={{ margin: "0", padding: "10px 14px 14px", fontSize: "14px", color: "#806B60" }}>No quick reply matches “{p.slashQ}”.</p>',
  '          </>)}',
  '        </div>',
  '      </>)}',
  // After WhatsApp's 24 h (Messenger's window), approved templates only: the bar's place holds the CRM's template button.
  '      {!!(p.chatCold) && (<>',
  '        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px 10px" }}>',
  '          <span onClick={p.openTpl} style={{ flex: "1", height: "48px", borderRadius: "24px", background: "#3E5C7A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4V5Zm4 4h8M8 12h5"></path></svg>Send template message</span>',
  '        </div>',
  '      </>)}',
  '      ',
].join("\n");
const PILL = '<span style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "flex-end", minHeight: "46px", boxSizing: "border-box", padding: "0 4px", borderRadius: "23px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.14)" }}>';

const PATCHES = [
  // The stack is measured (the message list pads itself by it) and found by its marker; its strip reaches the phone's
  // bottom edge — the CRM keeps the home indicator's inset as padding below the chat (crm.module.css › .app).
  ['<div style={{ position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "3", display: "flex", flexDirection: "column" }}>',
    '<div data-composer="" style={{ position: "absolute", left: "0", right: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", zIndex: "3", display: "flex", flexDirection: "column" }}>',
    "the stack spans the home-indicator inset below the chat, as the prototype's spans its 26px strip"],
  ['{!!(p.isA) && (<>', ABOVE + '{!!(p.isA) && (<>', "the reply / quick-reply rows above the bar, and in the bar's place a cold chat's template button"],
  [PILL, RECORD + PILL, "while the mic is held the pill's place holds the recording row (the bin, the clock)"],
  ['</span>\n          <span onClick={p.mainAct} title={p.mainTitle}', '</span>)}\n          <span onClick={p.mainAct} title={p.mainTitle}',
    "the pill's end, where the recording row's alternative closes — the main button after it stays the same element"],
  ['<span onClick={p.toggleSticker} title="Sticker" style={{', '<span onClick={p.toggleSticker} onMouseDown={p.keep} title="Sticker" style={{',
    "pressing it must not take the phone's keyboard down before the panel is in its place (the swap does that itself)"],
  ['<textarea value={p.draft} onChange={p.onDraft} onFocus={p.focus} onClick={p.focus} placeholder="Reply to Lim…" rows={1} style={{',
    '<textarea ref={p.taRef} data-draft="1" value={p.draft} onChange={p.onDraft} onFocus={p.focus} onBlur={p.blur} onClick={p.focus} placeholder={p.placeholder} rows={1} style={{',
    "the customer's own first name; the keyboard is the phone's (focus / blur); swipe-to-reply finds the box by data-draft"],
  ['<span onClick={p.toggleAttach} title="Attach" style={{', '<span onClick={p.toggleAttach} onMouseDown={p.keep} title="Attach" style={{',
    "as the sticker toggle: the attach panel takes the keyboard's place in one step"],
  ['<span onClick={p.mainAct} title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", cursor: "pointer", boxShadow: "0 3px 9px rgba(189,74,25,.18)" }}>',
    '<span onClick={p.mainAct} onMouseDown={p.keep} onPointerDown={p.mainDown} onContextMenu={p.noMenu} title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", cursor: "pointer", boxShadow: "0 3px 9px rgba(189,74,25,.18)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>',
    "Send keeps the keyboard up; the mic is held to record (the phone's long-press menu and text selection stay away)"],
  ['<div style={{ height: "280px", boxSizing: "border-box", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -6px 20px rgba(63,43,34,.08),0 -1px 0 #EFE4DA", display: "flex", flexDirection: "column", animation: "sheetUp 240ms cubic-bezier(.2,.8,.2,1)" }}>',
    '<div data-panel="" style={{ height: p.panelH, boxSizing: "border-box", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -6px 20px rgba(63,43,34,.08),0 -1px 0 #EFE4DA", display: "flex", flexDirection: "column", animation: "cmpUp 240ms cubic-bezier(.2,.8,.2,1)" }}>',
    "the panel is the keyboard's last height (280 until one is measured); the prototype's sheetUp is the CRM's cmpUp (the CRM's own sheetUp slides a sheet 100%, and a pull on a sheetUp closes it — shared/swipe-close.ts)"],
  ['<div style={{ height: "280px", boxSizing: "border-box", padding: "24px 12px 16px", background: "#FBF7F3", borderTop: "1px solid #EBDDD2", animation: "fadeIn 160ms ease-out" }}>',
    '<div data-panel="" style={{ height: p.panelH, boxSizing: "border-box", padding: "24px 12px 16px", background: "#FBF7F3", borderTop: "1px solid #EBDDD2", animation: "fadeIn 160ms ease-out" }}>',
    "the panel is the keyboard's last height (280 until one is measured)"],
  [/<div style=\{\{ height: "26px", display: "grid", placeItems: "center", background: p\.homeBg \}\}>\s*<span style=\{\{ width: "134px", height: "5px", borderRadius: "3px", background: "#3F2B22" \}\}>\s*<\/span>\s*<\/div>/,
    '<div style={{ height: "var(--safe-bottom, 0px)", background: p.homeBg }}></div>',
    "the strip is the phone's home-indicator inset (0 on most Androids), coloured as the prototype's; the phone draws its own indicator"],
  ['<div style={{ position: "absolute", left: "16px", right: "16px", bottom: "100px", zIndex: "6",',
    '<div data-composer-toast="" style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6",',
    "the prototype's 100px counts its 26px home strip (here the chat ends above the phone's inset); marked for less motion"],
];
for (const [from, to, why] of PATCHES) {
  if (!why) throw new Error(`composer patch without a reason: ${from}`);
  const n = typeof from === "string" ? body.split(from).length - 1 : (body.match(new RegExp(from.source, "g")) || []).length;
  if (n !== 1) throw new Error(`SalesComposer: patch matched ${n} times: ${from}`);
  body = body.replace(from, to);
}
body = scaleType(body);

const code = `"use client";

// GENERATED from docs/design/chat-composer/prototypes/Chat Composer.dc.html (the chat composer handoff, 2026-10-14) by
// tools/crm-design/gen-composer.cjs — markup and styles exactly as designed. Behaviour lives in ./ChatComposer.tsx and
// ./vm/composer.ts. To change the look, change the design (or the generator's patches) and regenerate; never edit this file.
import { Fragment } from "react";
import H from "../crm.module.css";
import CP from "./composer-press.module.css";
import type { ComposerVM } from "./vm/composer";

/** The chat's composer: the One pill typing bar (or the recording row / a cold chat's template button), the Sticker
 *  panel (Emoji), the Attach panel and the strip under them; the composer's toast. */
export default function SalesComposer({ p }: { p: ComposerVM }) {
  return (<>${body}</>);
}
`;
fs.writeFileSync(path.join(out, "SalesComposer.tsx"), code);
fs.writeFileSync(path.join(out, "composer-press.module.css"),
  "/* GENERATED by tools/crm-design/gen-composer.cjs from the chat composer design's style-active (a key's press). Do not edit. */\n" + dc.autoCss());
// The binding surface: every p.<name> the markup reads (vm/composer.ts › ComposerVM must give each).
const names = [...new Set([...body.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].sort();
fs.writeFileSync(path.join(__dirname, "composer-bindings.txt"), names.join("\n") + "\n");
console.log("SalesComposer", code.length, "bindings", names.length);
