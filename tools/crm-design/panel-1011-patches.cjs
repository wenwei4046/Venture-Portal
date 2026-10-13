const { PICK_SHEET } = require("./pick-sheet.cjs");
const { EMOJI_PANEL } = require("./emoji-panel.cjs");
// Live-data patches on the rev 1011 Control panel markup (each must match exactly once). Kept short on purpose: the
// markup is the prototype's; a patch is only where the live app must differ, and says why.
module.exports = [
  // §2.1 chat top spacing: the list's max(16px, env(safe-area-inset-top)) is not repeated — .app already pads by the inset
  // (crm.module.css, the safe-areas MUST), so 16 px is what max() gives inside it, and an iPhone's inset is not added twice.
  [', paddingTop: "max(16px, env(safe-area-inset-top))", background: v.chromeBg,', ", background: v.chromeBg,"],
  // Live messages carry long links (a visit card's Google Maps / Waze, user 2026-10-11): they wrap inside the bubble, as
  // the RS chat's do (SalesChat › whiteSpace pre-wrap, overflowWrap anywhere); the prototype's samples had none.
  // …and a visit sent to the customer is the visit card, the salesperson chat's own markup (SalesChat › m.ev), its text
  // hidden (user 2026-10-11: the booking showed as text with the map links).
  ['<p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>',
    '{!!(m.ev) && (<>' +
    '<div onClick={m.ev.go} style={{ width: "248px", maxWidth: "100%", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden", textAlign: "left", cursor: "pointer" }}>' +
    '<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px" }}>' +
    '<span style={{ flex: "none", width: "54px", padding: "6px 0", borderRadius: "12px", background: m.ev.bg, color: m.ev.fg, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.1" }}>' +
    '<small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.wk}</small>' +
    '<strong style={{ fontSize: "24px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.ev.dn}</strong>' +
    '<small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.mon}</small>' +
    '</span>' +
    '<span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>' +
    '<span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: m.ev.bg, color: m.ev.fg, fontSize: "10px", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase" }}>{m.ev.kind}</span>' +
    '<strong style={{ fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.title}</strong>' +
    '<span style={{ fontSize: "17px", fontWeight: "700", color: "#3F2B22", textDecoration: m.ev.deco, fontVariantNumeric: "tabular-nums" }}>{m.ev.time}</span>' +
    '</span>' +
    '</div>' +
    '<div style={{ display: "flex", gap: "10px", padding: "11px 12px", borderTop: "1px solid #EBDDD2", background: "#FBF7F3" }}>' +
    '<svg style={{ flex: "none", marginTop: "1px", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">' +
    '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path>' +
    '</svg>' +
    '<span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>' +
    '<strong style={{ fontSize: "14px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.room}</strong>' +
    '{!!(m.ev.addr) && (<><span style={{ fontSize: "13px", color: "#806B60", lineHeight: "1.35" }}>{m.ev.addr}</span></>)}' +
    '</span>' +
    '</div>' +
    '</div>' +
    '</>)}' +
    '<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>'],
  ['border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45" }}>{m.text}',
    'border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}'],
  // Full time grid: a long title ("Revenue Specialist") is cut with … like the name above it, not run under the day boxes
  // (user 2026-10-11) — on a phone the name column is ~100 px.
  ['<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap" }}>{p.sub}</small>',
    '<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</small>'],
  // (Round 2, 2026-10-13: Team | Mine sits at the right end of its own top row on every page, Inbox included, at the
  // prototype's 14 px a side — the 2026-10-11 patches that put it in Inbox's title row and narrowed it are gone, as the
  // top bar no longer holds "‹ Back to Revenue app" beside it. rev 1011 §8.)
  // 2026-10-13: a photo, video or voice note shows as itself in the chat's bubble (as the salesperson's), a file opens;
  // a message being sent shows a small clock, and the ticks go blue only once read.
  ['<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>',
    "{!!(m.img) && (<a href={m.img} target=\"_blank\" rel=\"noreferrer\" style={{ display: \"block\", margin: \"-2px -4px 4px\" }}><img src={m.img} alt=\"Photo\" style={{ display: \"block\", width: \"100%\", maxWidth: \"240px\", maxHeight: \"300px\", objectFit: \"cover\", borderRadius: \"12px\" }} /></a>)}{!!(m.vid) && (<video src={m.vid} controls playsInline preload=\"metadata\" style={{ display: \"block\", width: \"240px\", maxWidth: \"100%\", margin: \"-2px -4px 4px\", borderRadius: \"12px\", background: \"#000\" }} />)}{!!(m.aud) && (<audio src={m.aud} controls preload=\"metadata\" style={{ display: \"block\", width: \"240px\", maxWidth: \"100%\", height: \"40px\", margin: \"0 0 2px\" }} />)}{!!(m.file) && (<a href={m.file} target=\"_blank\" rel=\"noreferrer\" style={{ display: \"inline-block\", marginBottom: \"2px\", fontSize: \"13px\", fontWeight: \"650\", color: \"#BD4A19\" }}>Open file</a>)}" + '<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>'],
  [/(\{m\.time\}\{!!\(m\.mine\) && \(<>\s*<svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke=)"#2F8FD8"( strokeWidth="1\.6" strokeLinecap="round" strokeLinejoin="round">\s*<path d=)"M1 6l3 3 6-7M7 8\.5l\.5\.5 6-7"/,
    '$1{m.tickC}$2{m.tickPath}'],
  // …and with nothing typed the round button records a voice note; while recording the composer is the recording bar.
  ['<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px" }}>\n              <span onClick={v.ld.lx.attach}',
    "{!!(v.ld.lx.rec) && (<div style={{ flex: \"none\", display: \"flex\", alignItems: \"center\", gap: \"6px\" }}>\n              <span onClick={v.ld.lx.rec?.cancel} title=\"Cancel\" style={{ flex: \"none\", width: \"44px\", height: \"44px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid #EBDDD2\", display: \"grid\", placeItems: \"center\", color: \"#A3371A\", cursor: \"pointer\" }}><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\"><path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"></path></svg></span>\n              <span style={{ flex: \"1\", minWidth: \"0\", height: \"44px\", boxSizing: \"border-box\", borderRadius: \"22px\", background: \"#FBF1EC\", display: \"flex\", alignItems: \"center\", gap: \"10px\", padding: \"0 16px\", fontSize: \"15px\", fontWeight: \"600\", color: \"#3F2B22\", fontVariantNumeric: \"tabular-nums\" }}><span style={{ flex: \"none\", width: \"10px\", height: \"10px\", borderRadius: \"50%\", background: \"#D93025\", animation: \"fadeIn 700ms ease-in-out infinite alternate\" }}></span>{v.ld.lx.rec?.time} · Recording…</span>\n              <span onClick={v.ld.lx.rec?.send} title=\"Send voice note\" style={{ flex: \"none\", width: \"44px\", height: \"44px\", borderRadius: \"50%\", background: \"#BD4A19\", color: \"#fff\", display: \"grid\", placeItems: \"center\", cursor: \"pointer\" }}><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\"><path d=\"M5 12h14m-6-6 6 6-6 6\"></path></svg></span>\n            </div>)}\n            " + '<div style={{ flex: "none", display: v.ld.lx.rec ? "none" : "flex", alignItems: "center", gap: "6px" }}>\n              <span onClick={v.ld.lx.attach}'],
  // 2026-10-13: the sticker button in the reply box opens the emoji sheet; a tap adds one to the reply.
  [/<span (style=\{\{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60" )\}\}>(\s*<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1\.65" strokeLinecap="round" strokeLinejoin="round">\s*<path d="M20 13V7a3 3 0 0 0-3-3H7)/,
    '<span onClick={v.ld.lx.openEmoji} title="Emoji" $1, cursor: "pointer" }}>$2'],
  // …the emoji panel sits under the reply box like a keyboard (user 2026-10-13: a sheet over it hid what was typed).
  [/(<path d=\{v\.ld\.lx\.sendIcon\}>\s*<\/path>\s*<\/svg>\s*<\/span>\s*<\/div>)/, "$1\n            " + EMOJI_PANEL("v.ld.lx", "v.ld.lx.emojiOpen", "")],
  // 2026-10-13: picked photos / videos wait on a preview with an HD switch (shared/pick.ts).
  ['{!!(v.ld.lx.rec) && (<div', PICK_SHEET("v.ld.lx.pk") + '{!!(v.ld.lx.rec) && (<div'],
  // Team inbox cards: a long press or a swipe left opens Send to (user 2026-10-13; vm/inbox.ts › gestures).
  ['<div onClick={r.open} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px",',
    '<div onClick={r.open} onClickCapture={r.guard} onPointerDown={r.down} onPointerMove={r.move} onPointerUp={r.up} onPointerCancel={r.cancel} onContextMenu={r.noMenu} style={{ WebkitTouchCallout: "none", userSelect: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px",'],
  // Full time team editor: the people table keeps its rows full height and the page scrolls (user 2026-10-13: LAWRENCE's
  // title was cut — the scroller squeezed the table, whose overflow is hidden, to make room for the week below).
  [/<div style=\{\{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" \}\}>(\s*<div style=\{\{ display: "grid", gridTemplateColumns: "minmax\(0, 1fr\) repeat\(7, 30px\)", alignItems: "center", gap: "4px", padding: "10px 12px 6px" \}\}>)/,
    '<div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>$1'],
  // Customer info: the rows and Open chat keep their size; the sheet scrolls instead (user 2026-10-11, as the RS sheets).
  [/<div style=\{\{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" \}\}>(\s*\{\(v\.ci\.Rows\))/,
    "<div style={{ flex: \"none\", display: \"flex\", flexDirection: \"column\", borderRadius: \"14px\", border: \"1px solid #EBDDD2\" }}>$1"],
  ["<span onClick={v.ci.Chat} style={{ height: \"50px\",", "<span onClick={v.ci.Chat} style={{ flex: \"none\", height: \"50px\","],
  // The customer form follows the Control panel's Forms (CRM Desktop rev 1, B5) — tools/crm-design/form-patches.cjs.
  ...require("./form-patches.cjs")(),
];
