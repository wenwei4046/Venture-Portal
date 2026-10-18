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
  '              <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "#D93025", animation: "fadeIn 700ms ease-in-out infinite alternate" }}></span>{p.recTime}',
  // Slide left to cancel (the owner, 2026-10-15: "make it for move to left to cancel"): the hint follows the finger and
  // turns red near the line.
  '              <span style={{ flex: "1", minWidth: "0", textAlign: "right", transform: p.recSlide, color: p.recHintC, fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden" }}>‹ Slide to cancel</span>',
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
  // Settings › Suggest a template off (2026-10-18): no button — the line says the chat waits for the customer.
  '          {!!(p.tplOn) && (<span onClick={p.openTpl} style={{ flex: "1", height: "48px", borderRadius: "24px", background: "#BD4A19", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4V5Zm4 4h8M8 12h5"></path></svg>Send template message</span>)}',
  '          {!!(p.tplOff) && (<span style={{ flex: "1", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "13px", color: "#806B60" }}>The reply window is shut · the chat opens again when the customer writes</span>)}',
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
  ['<span onClick={p.camera} title="Camera" style={{', '<span onClick={p.camera} onMouseDown={p.keep} title="Camera" style={{',
    "the camera keeps the reply box's focus through the press (the owner, 2026-10-15: \"the camera cant open when I press\" — the keyboard going down moved the bar under the finger and the tap was lost)"],
  ['{!!(p.noDraft) && (<>', '{(<>',
    "Attach and Camera stay while typing (the owner, 2026-10-15: \"我的聊天室，原本有的功能都不見了\" — the prototype hid both once a word was typed; the chat before it always had them)"],
  ['<span onClick={p.toggleAttach} title="Attach" style={{', '<span onClick={p.toggleAttach} onMouseDown={p.keep} title="Attach" style={{',
    "as the sticker toggle: the attach panel takes the keyboard's place in one step"],
  ['<span onClick={p.mainAct} title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", cursor: "pointer", boxShadow: "0 3px 9px rgba(189,74,25,.18)" }}>',
    '<span onClick={p.mainAct} onMouseDown={p.keep} onPointerDown={p.mainDown} onContextMenu={p.noMenu} title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", cursor: "pointer", boxShadow: "0 3px 9px rgba(189,74,25,.18)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>',
    "Send keeps the keyboard up; the mic is held to record (the phone's long-press menu and text selection stay away)"],
  ['<div style={{ height: "280px", boxSizing: "border-box", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -6px 20px rgba(63,43,34,.08),0 -1px 0 #EFE4DA", display: "flex", flexDirection: "column", animation: "sheetUp 240ms cubic-bezier(.2,.8,.2,1)" }}>',
    '<div data-panel="" style={{ height: p.panelH, boxSizing: "border-box", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -6px 20px rgba(63,43,34,.08),0 -1px 0 #EFE4DA", display: "flex", flexDirection: "column", animation: "cmpUp 240ms cubic-bezier(.2,.8,.2,1)" }}>',
    "the panel is the keyboard's last height (280 until one is measured); the prototype's sheetUp is the CRM's cmpUp (the CRM's own sheetUp slides a sheet 100%, and a pull on a sheetUp closes it — shared/swipe-close.ts)"],
  ['<div style={{ height: "280px", boxSizing: "border-box", padding: "24px 12px 16px", background: "#FBF7F3", borderTop: "1px solid #EBDDD2", animation: "fadeIn 160ms ease-out" }}>',
    '<div data-attach="" style={{ position: "absolute", left: "10px", right: "10px", bottom: "calc(100% + 8px)", boxSizing: "border-box", padding: "18px 12px 14px", background: "#FBF7F3", borderRadius: "20px", boxShadow: "0 10px 30px rgba(63,43,34,.18),0 0 0 1px #EBDDD2", animation: "fadeIn 160ms ease-out" }}>',
    "Attach is a card floating over the chat above the bar, only as tall as its tiles (the owner, 2026-10-15: \"點 attach 下面很大空白\", \"when press attach, it jump up the chat\"): at the keyboard's height it left a blank under one row of tiles and pushed the bar and the chat up; absolutely placed, the stack (and so the list's padding) does not grow"],
  [/<div style=\{\{ height: "26px", display: "grid", placeItems: "center", background: p\.homeBg \}\}>\s*<span style=\{\{ width: "134px", height: "5px", borderRadius: "3px", background: "#3F2B22" \}\}>\s*<\/span>\s*<\/div>/,
    '<div style={{ height: "var(--safe-bottom, 0px)", background: p.homeBg }}></div>',
    "the strip is the phone's home-indicator inset (0 on most Androids), coloured as the prototype's; the phone draws its own indicator"],
  ['<div style={{ position: "absolute", left: "16px", right: "16px", bottom: "100px", zIndex: "6",',
    '<div data-composer-toast="" style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6",',
    "the prototype's 100px counts its 26px home strip (here the chat ends above the phone's inset); marked for less motion"],
];
// The bar's icons a step bigger, as WhatsApp's (the owner, 2026-10-15, WhatsApp's bar beside ours: "icon 可以放大一些，這樣
// 氣泡看起來就比較和諧"): Sticker 21 → 25, Attach 22 → 25, Camera 23 → 26, the main button's 20 → 24 — after the patches
// above, which give these spans their handlers.
const ICONS = [
  [/(title="Sticker" style=\{\{[^\n]*\n\s*<svg width=")21(" height=")21(")/, "$125$225$3", "Sticker 25"],
  [/(title="Attach" style=\{\{[^\n]*\n\s*<svg width=")22(" height=")22(")/, "$125$225$3", "Attach 25"],
  [/(title="Camera" style=\{\{[^\n]*\n\s*<svg width=")23(" height=")23(")/, "$126$226$3", "Camera 26"],
  [/(title=\{p\.mainTitle\} style=\{\{[^\n]*\n\s*<svg width=")20(" height=")20(")/, "$124$224$3", "the main button 24"],
];
for (const [from, to, why] of PATCHES) {
  if (!why) throw new Error(`composer patch without a reason: ${from}`);
  const n = typeof from === "string" ? body.split(from).length - 1 : (body.match(new RegExp(from.source, "g")) || []).length;
  if (n !== 1) throw new Error(`SalesComposer: patch matched ${n} times: ${from}`);
  body = body.replace(from, to);
}
for (const [from, to, why] of ICONS) {
  const n = (body.match(new RegExp(from.source, "g")) || []).length;
  if (n !== 1) throw new Error(`SalesComposer: icon size (${why}) matched ${n} times`);
  body = body.replace(from, to);
}
// The 4a redesign's frames M04–M08 (2026-10-18, docs/design_handoff_crm_redesign — that folder wins on size): the bar's
// pill and the round buttons beside it are 52 px (the composer handoff's 46), the recording row with them.
const SIZES_4A = [
  ['width: "46px", height: "46px", boxSizing: "border-box", borderRadius: "50%"', 'width: "52px", height: "52px", boxSizing: "border-box", borderRadius: "50%"', "the recording row's bin"],
  ['minWidth: "0", height: "46px", boxSizing: "border-box", borderRadius: "23px"', 'minWidth: "0", height: "52px", boxSizing: "border-box", borderRadius: "26px"', "the recording row"],
  ['alignItems: "flex-end", minHeight: "46px", boxSizing: "border-box", padding: "0 4px", borderRadius: "23px"', 'alignItems: "flex-end", minHeight: "52px", boxSizing: "border-box", padding: "0 4px", borderRadius: "26px"', "the pill"],
  ['title="Sticker" style={{ flex: "none", width: "38px", height: "46px"', 'title="Sticker" style={{ flex: "none", width: "38px", height: "52px"', "Sticker's height"],
  ['title="Attach" style={{ flex: "none", width: "40px", height: "46px"', 'title="Attach" style={{ flex: "none", width: "40px", height: "52px"', "Attach's height"],
  ['title="Camera" style={{ flex: "none", width: "40px", height: "46px"', 'title="Camera" style={{ flex: "none", width: "40px", height: "52px"', "Camera's height"],
  ['maxHeight: "154px", boxSizing: "border-box", margin: "0", padding: "12px 2px"', 'maxHeight: "154px", boxSizing: "border-box", margin: "0", padding: "15px 2px"', "the reply box centred in 52 px"],
  ['title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px"', 'title={p.mainTitle} style={{ flex: "none", width: "52px", height: "52px"', "the main button"],
];
for (const [from, to, why] of SIZES_4A) {
  const n = body.split(from).length - 1;
  if (n !== 1) throw new Error(`SalesComposer: 4a size (${why}) matched ${n} times`);
  body = body.replace(from, to);
}
body = require("./palette-4a.cjs")(body, "SalesComposer");
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
  "/* GENERATED by tools/crm-design/gen-composer.cjs from the chat composer design's style-active (a key's press). Do not edit. */\n" + require("./palette-4a.cjs")(dc.autoCss(), "composer-press"));
// The binding surface: every p.<name> the markup reads (vm/composer.ts › ComposerVM must give each).
const names = [...new Set([...body.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].sort();
fs.writeFileSync(path.join(__dirname, "composer-bindings.txt"), names.join("\n") + "\n");
console.log("SalesComposer", code.length, "bindings", names.length);
