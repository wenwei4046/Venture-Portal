const { PICK_SHEET } = require("./pick-sheet.cjs");
const { EMOJI_PANEL } = require("./emoji-panel.cjs");
const CHAT_MEDIA = require("./chat-media.cjs");
const switchBack = require("./switch-back.cjs");
const teamMineSwap = require("./team-mine-swap.cjs");
// Team | Mine left of the house (team-mine-swap.cjs), only for whoever has the other side (v.tm.on).
const SWAP = (indent, extra) => "{!!(v.tm.on) && (<>\n" + indent + "  " + teamMineSwap("v.tm", indent + "  ", extra) + "\n" + indent + "</>)}\n" + indent;
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
  // top bar no longer holds "‹ Back to Revenue app" beside it. rev 1011 §8. Since 2026-10-14 that row is gone too: Team |
  // Mine is one round button left of the house, below.)
  // 2026-10-13: a photo, video or voice note shows as itself in the chat's bubble (as the salesperson's), a file opens;
  // a message being sent shows a small clock, and the ticks go blue only once read.
  ['<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>',
    // 2026-10-14: the message it answers (a quote) and its reaction, as Mine's chat shows them.
    '{!!(m.quote) && (<div style={{ margin: "0 0 6px", padding: "6px 10px", borderRadius: "8px", borderLeft: "3px solid #BD4A19", background: "rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", lineHeight: "1.35", color: "#806B60", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.quote.text}</span></div>)}' +
    '{!!(m.reaction) && (<span style={{ position: "absolute", bottom: "-14px", left: m.rxSide, right: m.rxRight, padding: "1px 5px", borderRadius: "12px", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.25)", fontSize: "15px", lineHeight: "22px" }}>{m.reaction}</span>)}' +
    CHAT_MEDIA + '<p style={{ display: m.pDisp, margin: "0", padding: m.inPad, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>'],
  // 2026-10-14 (chat-media.cjs): a photo, video or document sits 3 px inside its bubble, as WhatsApp's ("聊天室的邊框不要那麼大").
  ['<div style={{ alignSelf: m.align, maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius, boxShadow', '<div {...m.press} style={{ WebkitTouchCallout: "none", position: "relative", marginBottom: m.rxGap, display: m.vis, alignSelf: m.align, maxWidth: "80%", padding: m.pad, boxSizing: "border-box", borderRadius: m.radius, boxShadow'],
  ['justifyContent: "flex-end", gap: "3px", marginTop: "4px", fontSize: "11px", color: "#806B60" }}', 'justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: "#806B60" }}'],
  // 2026-10-14 (the owner: "team 的聊天室，點進來後下方的 insight inbox… 可以拿掉，像 mine 一樣"): a chat open hides the bottom bar.
  ['<nav style={{ flex: "none", display: "flex", alignItems: "flex-end", height: "62px"', '<nav style={{ flex: "none", display: v.navOn ? "flex" : "none", alignItems: "flex-end", height: "62px"'],
  [/(\{m\.time\}\{!!\(m\.mine\) && \(<>\s*<svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke=)"#2F8FD8"( strokeWidth="1\.6" strokeLinecap="round" strokeLinejoin="round">\s*<path d=)"M1 6l3 3 6-7M7 8\.5l\.5\.5 6-7"/,
    '$1{m.tickC}$2{m.tickPath}'],
  // 2026-10-17 (the owner: two videos WhatsApp refused showed in the Team chat as sent, only Mine's said so): a message
  // that did not reach the customer says why under its time, as Mine's (gen-sales.cjs; panel/vm/lead.ts › failNote).
  [/(<path d=\{m\.tickPath\}>\s*<\/path>\s*<\/svg>\s*<\/>\)\}<\/span>)/,
    '$1{!!(m.failNote) && (<span style={{ display: "block", marginTop: "3px", fontSize: "11px", lineHeight: "1.35", color: "#FFFFFF" }}>{m.failNote}</span>)}'],
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
  // No Organic Leads (the owner, 2026-10-13: "organic lead 直接給 director … 可以刪掉"), and Insight's Needs your action is gone
  // whole — it was the Inbox's Attention again ("刪掉 team 中 need your action，跟 inbox 中 need a reply 是一樣"); an ad
  // nobody set says what really happens to its leads.
  [/<h2 style=\{\{[^}]*\}\}>Needs your action<\/h2>\s*<section[\s\S]*?<\/section>\s*/, ""],
  // The Team inbox's "Needs a reply" column is Attention, as everybody's Mine inbox calls it (vm/inbox.ts).
  ["Not assigned yet · leads wait in Organic Leads", "Not assigned yet · dealt evenly across teams"],
  // Team inbox (the owner, 2026-10-14: "我不知道哪一個應該先處理，沒有數字提示"; "只要在 mine 有的，team 也要有"): a row of the
  // same categories as Mine, each with its count, above the board — a tap slides the board to that column.
  ['<div data-drag-scroll="1" style={{ flex: "1 1 0", minHeight: "0", display: "flex", alignItems: "stretch", gap: "10px", overflowX: "auto", overflowY: "hidden",',
    '<div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>\n' +
    '            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}><span onClick={g.jump} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}></span>{g.title}<b style={{ fontWeight: "700", color: g.c }}>{g.n}</b></span></Fragment>))}\n' +
    '          </div>\n' +
    '          <div data-inb-board="1" data-drag-scroll="1" style={{ flex: "1 1 0", minHeight: "0", display: "flex", alignItems: "stretch", gap: "10px", overflowX: "auto", overflowY: "hidden",'],
  // Full time team editor: the people table keeps its rows full height and the page scrolls (user 2026-10-13: LAWRENCE's
  // title was cut — the scroller squeezed the table, whose overflow is hidden, to make room for the week below).
  [/<div style=\{\{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" \}\}>(\s*<div style=\{\{ display: "grid", gridTemplateColumns: "minmax\(0, 1fr\) repeat\(7, 30px\)", alignItems: "center", gap: "4px", padding: "10px 12px 6px" \}\}>)/,
    '<div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>$1'],
  // Customer info: the rows and Open chat keep their size; the sheet scrolls instead (user 2026-10-11, as the RS sheets).
  [/<div style=\{\{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" \}\}>(\s*\{\(v\.ci\.Rows\))/,
    "<div style={{ flex: \"none\", display: \"flex\", flexDirection: \"column\", borderRadius: \"14px\", border: \"1px solid #EBDDD2\" }}>$1"],
  ["<span onClick={v.ci.Chat} style={{ height: \"50px\",", "<span onClick={v.ci.Chat} style={{ flex: \"none\", height: \"50px\","],
  // 2026-10-14 (the owner: "作為用戶，我不知道 inbox 2 是誰？"): a board card shows its unread messages beside its time.
  ['<small style={{ flex: "none", fontSize: "11px", color: "#A8968B" }}>{r.at}</small>', '<small style={{ flex: "none", fontSize: "11px", color: "#A8968B" }}>{r.at}</small>{!!(r.unread) && (<span style={{ flex: "none", minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.unread}</span>)}'],
  // 2026-10-14: the message being answered sits over the reply box, with × to drop it (the message menu's Reply).
  ['<div style={{ flex: "none", display: v.ld.lx.rec ? "none" : "flex", alignItems: "center", gap: "6px" }}>', '{!!(v.ld.lx.replying) && (<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", marginBottom: "6px", borderRadius: "12px", borderLeft: "3px solid #BD4A19", background: "#F5EBE3" }}><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19" }}>{v.ld.lx.replyWho}</strong><span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.lx.replyText}</span></span><span onClick={v.ld.lx.cancelReply} title="Cancel reply" style={{ flex: "none", width: "28px", height: "28px", display: "grid", placeItems: "center", color: "#806B60", fontSize: "20px", cursor: "pointer" }}>×</span></div>)}<div style={{ flex: "none", display: v.ld.lx.rec ? "none" : "flex", alignItems: "center", gap: "6px" }}>'],
  // 2026-10-14: a text message's time floats beside its words, as WhatsApp's (shared/chat-media.ts › INLINE_TIME).
  ['<span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad,', '<span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad,'],
  // 2026-10-15 (the owner: "聊天室的 bubble 可以換成橙色嗎？" — your own, the brand's orange with white words): the bubble's
  // words and its time row take the VM's colours (fg, timeC), white on your own.
  ['border: `1px solid ${m.bd}`, color: "#3F2B22" }}>', 'border: `1px solid ${m.bd}`, color: m.fg }}>'],
  ['fontSize: "11px", color: "#806B60" }}>{!!(m.hasBy)', 'fontSize: "11px", color: m.timeC }}>{!!(m.hasBy)'],
  // 2026-10-16 (the owner: "把加 showroom（可能只需要保留 + 的符號）的功能放到右上角，同時加一個 <> 功能，切換不同 showroom，
  // 如果都在下面太長了"): Showrooms shows one showroom at a time — ‹ 1 / 3 › and a round + at the title's right (vm/rooms.ts ›
  // rmAt); the dashed Add showroom under the list goes.
  ['<h1 style={{ margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Showrooms</h1>',
    '<div style={{ display: "flex", alignItems: "center", gap: "8px" }}><h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Showrooms</h1>' +
    '{!!(v.rm.rmPager) && (<span style={{ flex: "none", display: "inline-flex", alignItems: "center", height: "40px", padding: "0 2px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", background: "#fff" }}>' +
    '<span onClick={v.rm.rmPrev} role="button" aria-label="Previous showroom" style={{ width: "34px", height: "34px", display: "grid", placeItems: "center", color: "#BD4A19", opacity: v.rm.rmPrevOp, cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"></path></svg></span>' +
    '<span style={{ minWidth: "34px", textAlign: "center", fontSize: "13px", fontWeight: "650", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{v.rm.rmPos}</span>' +
    '<span onClick={v.rm.rmNext} role="button" aria-label="Next showroom" style={{ width: "34px", height: "34px", display: "grid", placeItems: "center", color: "#BD4A19", opacity: v.rm.rmNextOp, cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"></path></svg></span></span>)}' +
    '<span onClick={v.rm.rmAdd} role="button" aria-label="Add showroom" title="Add showroom" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"></path></svg></span></div>'],
  [/\n *<span onClick=\{v\.rm\.rmAdd\} style=\{\{[^\n]*\n[\s\S]*?<\/svg>Add showroom<\/span>/, ""],
  // 2026-10-16 (the owner: the chat showed Meta's headline "Chat with us" — "顯示廣告的名稱，不然業務也看不懂"): the ad editor's
  // title is its name, typed in place for CRM · Manage (vm/assign.ts › naming; crm_name_ad), Meta's headline as the hint.
  ['<h2 style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.as.ae.name}</h2>',
    '{v.as.ae.canName ? (<input aria-label="Ad name" value={v.as.ae.nameDraft} onChange={v.as.ae.onName} onBlur={v.as.ae.saveName} onKeyDown={v.as.ae.nameKey} placeholder={v.as.ae.headline} maxLength={120} style={{ width: "100%", boxSizing: "border-box", margin: "0", padding: "2px 0 4px", border: "0", borderBottom: "1px dashed #D9C7BA", borderRadius: "0", background: "transparent", font: "inherit", fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em", color: "#3F2B22", outline: "none" }} />) : (<h2 style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.as.ae.name}</h2>)}'],
  // The customer form follows the Control panel's Forms (CRM Desktop rev 1, B5) — tools/crm-design/form-patches.cjs.
  ...require("./form-patches.cjs")(),
  // 2026-10-14 (the owner: "點聊天室可以收起右上 3 個點的功能"): the chat's ⋮ menu closes on a tap anywhere outside it, as
  // Mine's does — marked for sales/outside.ts › useCloseOnOutside (PanelScreens).
  ['<span onClick={v.ld.lx.toggleMenu} title="More"', '<span data-hm-toggle="1" onClick={v.ld.lx.toggleMenu} title="More"'],
  ['<div style={{ position: "absolute", top: "48px", right: "0", zIndex: "7", width: "240px"', '<div data-hm-menu="1" style={{ position: "absolute", top: "48px", right: "0", zIndex: "7", width: "240px"'],
  // 2026-10-14 (the owner: "the switch back revenue app, put the same place with switch to crm, put a icon, easy to switch"):
  // the Revenue app's home left of the bell (switch-back.cjs), as the Revenue app's Today has the CRM's chat button left of
  // its bell. And Team | Mine, the same day ("change the 原本的那个 team 跟 mine 换来这里", the design "Team · Mine toggle —
  // 1a Single swap circle"): one round button left of the house (team-mine-swap.cjs), for whoever has a Mine to go to.
  // The three sit on the Overview alone — the first page of the bottom bar, as the Revenue app keeps its header to Today
  // (the owner, later the same day: "这三个 icon 本身只需要出现在第一个界面 … principal view … 只存在于 Insight 界面"; vm/app.ts
  // keeps the prototype's bell to it). Until then they were on Inbox, Assignment, Calendar and Profile's card too.
  // 2026-10-16 (the owner, circling Team | Mine and the house on Insight: "換到 Inbox 那頁"): the three moved to the Inbox's
  // title row, beside Contacts — where Mine keeps its own on its first page (vm/app.ts › bellIn).
  // 2026-10-16, later (the owner, circling the space left of the avatar on Team's Insight: "帮我把 inbox 标记处的小房子放到截图1
  // 标记的地方"): the house is on Insight too — the page Team opens on — so the way back to the Revenue app is there at once.
  ['<span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.ov.meIni}</span>',
    '{!!(v.houseOv) && (<>' + switchBack("              ") + '</>)}\n              <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.ov.meIni}</span>'],
  // 2026-10-16, later (the owner, crossing out the house on Team's Inbox: "在 inbox, 右上角的功能是 人像，鈴鐺，contacts（小房子
  // 不需要）"): the Inbox's title row reads Team | Mine, the bell, then Contacts — the house only on Insight (houseOv).
  ['</svg>Contacts</span>\n            {!!(v.bellIn) && (<>\n','</svg>Contacts</span>\n            {!!(v.bellIn) && (<>\n              ' + SWAP("              ") + "\n"],
  ['<span onClick={v.ib.openPc} style={{ flex: "none",', '<span onClick={v.ib.openPc} style={{ order: "1", flex: "none",'],
  // …so Profile's card has no bell in its corner, and its name the whole row.
  ['<div style={{ display: "flex", alignItems: "center", gap: "14px", paddingRight: "48px" }}>\n              <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "650" }}>{v.pf.meIni}</span>',
    '<div style={{ display: "flex", alignItems: "center", gap: "14px" }}>\n              <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "650" }}>{v.pf.meIni}</span>'],
  // No line under a page's title (the owner, 2026-10-14, of the Team inbox's "5 chats · 1 need attention", Assignment's "Who
  // gets each new enquiry" and the Calendar's "1 Oct – 31 Oct · 10 visits · 2 upcoming": "这行字不需要"); the title then sits
  // level with the control beside it.
  ['<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>\n            <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>\n              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>\n              <span style={{ fontSize: "13px", color: "#806B60" }}>{v.ib.inbSummary}</span>',
    '<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>\n            <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>\n              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>'],
  [/\n *<span style=\{\{ fontSize: "13px", color: "#806B60" \}\}>Who gets each new enquiry<\/span>/, ""],
  ['<div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>\n            <div style={{ flex: "1", minWidth: "0" }}>\n              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Calendar</h1>\n              <span style={{ fontSize: "13px", color: "#806B60" }}>{v.cal.cRangeLabel}</span>',
    '<div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>\n            <div style={{ flex: "1", minWidth: "0" }}>\n              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Calendar</h1>'],
  // …so the top bar's Team | Mine segment (rev 1011 §8: alone at the right end of its own row on every page) is gone; the
  // bar holds only a back link (its bell went with the rest, vm/app.ts › bellTop).
  [/\{!!\(v\.dirTop\) && \(<>\s*<div style=\{\{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F0E6DE" \}\}>[\s\S]*?>Mine<\/span>\s*<\/div>\s*<\/>\)\}\s*/, ""],
  // Profile's "Back to Revenue app" card is gone (the owner, 2026-10-14: "delete this, cause is no need anymore"): the house
  // left of the bell (switch-back.cjs) is the way back on every page.
  [/\n *<div onClick=\{v\.exitCrm\} style=\{\{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#F5EBE3"[^\n]*\n[\s\S]*?Back to Revenue app<\/strong>[\s\S]*?<\/svg>\n *<\/div>/, ""],
];
