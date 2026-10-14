// Generates the salesperson CRM's screens from CRM Revenue View.dc.html (3b) into React components.
// Run from the repo: node tools/crm-design/gen-sales.cjs (overwrites src/components/member/crm/sales/Sales*.tsx).
const fs = require("fs"), path = require("path");
const { convert, hoverClasses } = require("./dc2jsx.cjs");
const repo = path.resolve(__dirname, "../..");
const src = fs.readFileSync(path.join(repo, "docs/design_handoff_crm_roles/CRM Revenue View.dc.html"), "utf8").split(/\r?\n/);
const out = path.join(repo, "src/components/member/crm/sales");
fs.mkdirSync(out, { recursive: true });
const lines = (a, b) => src.slice(a - 1, b).join("\n");

// rev 1010 (docs/design/rev1010): new blocks are taken from the prototypes VERBATIM — one node, balanced, by a marker inside it.
const proto = name => fs.readFileSync(path.join(repo, "docs/design/rev1010/prototypes", name + ".dc.html"), "utf8");
/** The whole <sc-if> whose opening tag carries `marker` (e.g. "{{ lsOpen }}"), from the prototype, balanced. */
function protoNode(name, marker) {
  const s = proto(name), at = s.indexOf('<sc-if value="' + marker + '"');
  if (at < 0) throw new Error(name + ": no <sc-if " + marker);
  const re = /<(\/?)sc-if(?=[\s>])/g; re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(s))) { depth += m[1] ? -1 : 1; if (!depth) return s.slice(at, s.indexOf(">", m.index) + 1); }
  throw new Error(name + ": unbalanced " + marker);
}
/** The whole element that starts with `start` (an opening tag's beginning), from the prototype or a fragment, balanced on `tag`. */
function balanced(s, start, tag, what) {
  const at = s.indexOf(start);
  if (at < 0) throw new Error(what + ": no " + start.slice(0, 60));
  const re = new RegExp("<(/?)" + tag + "(?=[\\s>])", "g"); re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(s))) { depth += m[1] ? -1 : 1; if (!depth) return s.slice(at, s.indexOf(">", m.index) + 1); }
  throw new Error(what + ": unbalanced " + start.slice(0, 60));
}
const { PICK_SHEET } = require("./pick-sheet.cjs");
const { EMOJI_PANEL } = require("./emoji-panel.cjs");
const CHAT_MEDIA = require("./chat-media.cjs");
const once = (text, from, to) => { if (text.split(from).length !== 2) throw new Error("not exactly once: " + from.slice(0, 60)); return text.replace(from, to); };
// rev 1010 §5 Insight: the three hero figures open lists, the list sheet and Customer info with ‹ back.
const insightFrag = (() => {
  let f = lines(432, 491);
  // No Team | Me (rev 1010 §5.2 is replaced by §7.3, Team | Mine in the top bar).
  f = once(f, 'onClick="{{ goInbox }}" title="Open Inbox"', 'onClick="{{ openLeads }}" title="See leads"');
  f = f.replace('onClick="{{ goCal }}" title="Open Calendar"', 'onClick="{{ openAppts }}" title="See appointments"');
  f = once(f, 'onClick="{{ goCal }}" title="Open Calendar"', 'onClick="{{ openUp }}" title="See upcoming"');
  return [f, protoNode("RS Insight", "{{ lsOpen }}"), protoNode("RS Insight", "{{ ctOpen }}"), protoNode("RS Insight", "{{ cfOpen }}")].join("\n");
})();

// rev 1010 §6 Notifications: the title with Mark all as read, Unread | Read, the empty line; an update taps to read, bold with a dot while unread.
const profileFrag = (() => {
  const p = proto("RS Profile"), f0 = lines(304, 429);
  const headStart = '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px;"><h1';
  const head = p.slice(p.indexOf(headStart), p.indexOf('<sc-if value="{{ hasInv }}"', p.indexOf(headStart)));
  let f = once(f0, '<h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -.03em; line-height: 1.2;">Notifications</h1>', head);
  const upd = '<sc-for list="{{ notifUpd }}"';
  f = once(f, balanced(f0, upd, "sc-for", "3b Profile"), balanced(p, upd, "sc-for", "RS Profile"));
  return f;
})();

// Round 2 (§8.2): the top bar shows only on Profile's sub-pages ("‹ Profile" and the bell) — the RS prototypes'
// showTopBar; the bell moves into each page's title row. (Team | Mine — rev 1010 §7.3, the prototype's Director pill
// (RS Insight's isDir / dirTabs) — sat alone at this bar's right end on every page until 2026-10-14: it is one round
// button left of the house now, team-mine-swap.cjs, in BELL and on Profile's card.)
const headerFrag = (() => {
  const bar = lines(36, 39), bell = balanced(bar, '<span onClick="{{ openNotifTop }}"', "span", "3b header");
  const withBell = once(bar, bell, '<sc-if value="{{ bellTop }}" hint-placeholder-val="{{ false }}">' + bell + "</sc-if>");
  return '<sc-if value="{{ showTopBar }}" hint-placeholder-val="{{ false }}">' + withBell + "</sc-if>";
})();

const line34 = src[33];
const shellPart = line34.slice(line34.indexOf('<sc-if value="{{ rdX }}"'));

const parts = [
  ["SalesShellBanners", "ShellVM", shellPart, "The Revenue Director's Control panel | My CRM toggle, the Viewing-someone banner and the Switch sheet."],
  ["SalesHeader", "HeaderVM", headerFrag, "Top bar of Profile's sub-pages: ‹ Profile and the bell."],
  ["SalesInbox", "InboxVM", lines(41, 118), "Inbox: search, filter chips, rows (swipe for More), the More / Label sheets and the ad filter."],
  ["SalesContacts", "ContactsVM", lines(121, 180), "Contacts: A–Z, swipe to edit or delete, customer details and info sheets."],
  // rev 1010 §3: a visit opens Contacts' Customer info sheet (lines 145–150) and its form (127–144) on the Calendar too.
  ["SalesCalendar", "CalendarVM", lines(183, 301) + "\n" + lines(145, 150) + "\n" + lines(127, 144), "Calendar: Month / Week / Day, Today with Show up / No show, upcoming, outcome and celebration; Customer info and its form."],
  ["SalesProfile", "ProfileVM", profileFrag, "Profile: card, View my team, workspace, Notifications (Unread | Read), Quick replies, Auto-reply."],
  ["SalesInsight", "InsightVM", insightFrag, "Insight: Month / Week / Day / Range, the walnut hero and leads by status; Team | Me, the lists and Customer info."],
  ["SalesChat", "ChatVM", lines(496, 741), "A chat: header menu, messages, booking, quick replies, templates and every sheet."],
  // The customer form alone, for the Control panel's chat (Book visit asks for the details first, as here).
  ["SalesCustomerForm", "CustomerFormVM", lines(127, 144), "The customer form (name, phone, property, budget) — step 1 of a first booking, or Edit.", "customer"],
  ["SalesNav", "NavVM", lines(743, 750).replace(/^\s*<sc-if value="\{\{ inboxOpen \}\}"[^>]*>/, "").replace(/<\/sc-if>\s*$/, ""), "The bottom bar."],
];

// Where the design shows a demo value, the live one (each must match exactly once).
const PATCHES = {
  // rev 1010 §3: Month / Week chips open the visit (their own tap; "+N" has none and keeps select-day).
  SalesCalendar: [["<span style={{ alignSelf: \"stretch\", height: \"14px\",", "<span onClick={e.open} style={{ alignSelf: \"stretch\", height: \"14px\","],
    ["<span style={{ alignSelf: \"stretch\", padding: \"4px 3px\",", "<span onClick={e.open} style={{ alignSelf: \"stretch\", padding: \"4px 3px\","]],
  SalesProfile: [[">Full time</strong>", ">{v.meRankX}</strong>"]],
  // No phone (a Messenger customer) — no call button (user 2026-10-09: 無法打電話，刪掉).
  SalesContacts: [[/(<a href=\{p\.tel\}[\s\S]*?<\/a>)/, "{!!p.hasTel && ($1)}"]],
  SalesChat: [[/(<span onClick=\{v\.simReply\}[^>]*>Demo: customer replies<\/span>)/, "{!!v.simReplyShow && ($1)}"],
    // The Principal / Director assign rather than move (vm/chat.ts assigner).
    [">Move {v.cl.name} to</h2>", ">{v.hm.moveTitle}</h2>"],
    // ── rev 1010 (docs/design/rev1010, §1 Chat) ──
    // 1.5 ⋮ closes on a tap anywhere outside it: the toggle and the menu are marked for the document listener
    // (shared/outside.ts), which replaces the fixed backdrop that sat under the chat list.
    ["<span onClick={v.hm.toggle} title=\"More\"", "<span data-hm-toggle=\"1\" onClick={v.hm.toggle} title=\"More\""],
    [/<div onClick=\{v\.hm\.close\} style=\{\{ position: "fixed", inset: "0", zIndex: "6" \}\}>\s*<\/div>\s*/, ""],
    ["<div style={{ position: \"absolute\", top: \"52px\", right: \"0\", zIndex: \"7\", width: \"264px\"", "<div data-hm-menu=\"1\" style={{ position: \"absolute\", top: \"52px\", right: \"0\", zIndex: \"7\", width: \"264px\""],
    // 1.4 No "· reply window open Xh Ym" under the name (the Cold-lead banner stays).
    [/<p style=\{\{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px", margin: "0", fontSize: "12px", color: "rgb\(128 107 96\)" \}\}>\s*<span style=\{\{ color: "rgb\(56 117 87\)" \}\}>\{v\.cl\.window\}<\/span>\s*<\/p>\s*/, ""],
    // 1.1 The chat's wallpaper (WhatsApp-like), bleeding to the edges; the day pill white with a shadow.
    ["<div data-chat-list=\"1\" style={{ flex: \"1\", minHeight: \"0\", overflowY: \"auto\", scrollbarWidth: \"none\", display: \"flex\", flexDirection: \"column\", gap: \"10px\", padding: \"6px 0\" }}>",
     "<div data-chat-list=\"1\" style={{ flex: \"1\", minHeight: \"0\", overflowY: \"auto\", scrollbarWidth: \"none\", display: \"flex\", flexDirection: \"column\", gap: \"10px\", margin: \"0 -20px\", padding: \"10px 20px\", backgroundColor: v.wallBg, backgroundImage: v.wallImg, backgroundSize: v.wallSize }}>"],
    ["padding: \"5px 12px\", borderRadius: \"9px\", background: \"#F5EBE3\", color: \"#4E2F20\", fontSize: \"12px\", fontWeight: \"600\" }}>{m.sep}</span>",
     "padding: \"5px 12px\", borderRadius: \"9px\", background: \"#FFFFFF\", boxShadow: \"0 1px 1px rgba(63,43,34,.10)\", color: \"#4E2F20\", fontSize: \"12px\", fontWeight: \"600\" }}>{m.sep}</span>"],
    // 7.1 Book visit: each slot two lines, 46 px — the time, and under it N left / Full / Passed / Closed (prototype markup).
    ["<span onClick={s.pick} style={{ height: \"40px\", borderRadius: \"12px\", border: `1px solid ${s.border}`, background: s.bg, color: s.fg, display: \"grid\", placeItems: \"center\", fontSize: \"14px\", fontWeight: s.weight, textDecoration: s.deco, cursor: s.cursor }}>{s.t}</span>",
     "<span onClick={s.pick} style={{ height: \"46px\", borderRadius: \"12px\", border: `1px solid ${s.border}`, background: s.bg, color: s.fg, display: \"flex\", flexDirection: \"column\", alignItems: \"center\", justifyContent: \"center\", gap: \"1px\", cursor: s.cursor }}><span style={{ fontSize: \"14px\", fontWeight: s.weight, textDecoration: s.deco }}>{s.t}</span><small style={{ fontSize: \"10px\", fontWeight: \"600\", opacity: \".8\" }}>{s.left}</small></span>"],
    // 7.2 Chat top spacing 6 → 16 px. The list's max(16px, env(safe-area-inset-top)) is NOT repeated here: .app already pads
    // by the inset (crm.module.css, the safe-areas MUST), so 16 px is what max() gives inside it — and on an iPhone the
    // inset is not added twice.
    [/(<main style=\{\{ position: "relative", flex: "1 1 auto", minHeight: "0", boxSizing: "border-box", padding: )"6px 20px 8px"/, "$1\"16px 20px 8px\""],
    // 8.3 (round 2) No full-width "Book visit" bar above the composer: booking stays in ⋮ › Appointment.
    [/\{!!\(v\.notBooked\) && \(<>[\s\S]*?Book visit<\/span>\s*<\/div>\s*<\/>\)\}\s*/, ""],
    // Assign to / Move (user 2026-10-13): a long list scrolls inside the sheet — the button stays at its foot — and each
    // team's people sit under its heading (the Switch sheet's).
    ['<div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "4px" }}>\n            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "8px" }}>\n            </span>\n            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700" }}>{v.hm.moveTitle}</h2>',
     '<div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>\n            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "8px" }}>\n            </span>\n            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700" }}>{v.hm.moveTitle}</h2>'],
    ['{(v.hm.people).map((p, p_i) => (<Fragment key={p_i}>\n              <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #EBDDD2", cursor: "pointer" }}>',
     '{(v.hm.people).map((p, p_i) => (<Fragment key={p_i}>\n              {!!p.hasHead && (<span style={{ padding: "12px 0 4px", fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" }}>{p.head}</span>)}\n              <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: p.rule, cursor: "pointer" }}>'],
    ['<span onClick={v.hm.confirm} style={{ marginTop: "10px", height: "50px", borderRadius: "25px",',
     '<span onClick={v.hm.confirm} style={{ position: "sticky", bottom: "0", flex: "none", boxShadow: "0 0 0 10px #fff", marginTop: "10px", height: "50px", borderRadius: "25px",'],
    // 2026-10-13: a photo, video or voice note shows as itself in the bubble (the customer's and ours), a file opens.
    // 2026-10-14: drawn by tools/crm-design/chat-media.cjs (shared/chat-media.ts) — its final size before it loads, the in-app
    // viewer on a tap, a document as a tile with its name; a photo, video or document sits 3 px inside its bubble (m.pad / m.inPad).
    ['<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap",', CHAT_MEDIA + '\n                <p style={{ display: m.pDisp, margin: "0", padding: m.inPad, whiteSpace: "pre-wrap",'],
    ['minWidth: "0", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius,', 'minWidth: "0", display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: m.radius,'],
    ['gap: "3px", marginTop: "4px", fontSize: "11px", color: m.timeColor', 'gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: m.timeColor'],
    // 2026-10-14: a text message's time floats beside its words, as WhatsApp's (shared/chat-media.ts › INLINE_TIME).
    ['<span style={{ display: "flex", alignItems: "center", justifyContent: m.timeJustify, gap: "3px", marginTop: m.timeTop,', '<span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: m.timeJustify, gap: "3px", marginTop: m.timeTop,'],
    // 2026-10-14: a long press on any message opens WhatsApp's menu (shared/msg-menu.tsx); the phone's own callout is held back.
    ['<div onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ position: "relative", alignSelf: m.align,', '<div {...m.press} onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ WebkitTouchCallout: "none", position: "relative", alignSelf: m.align,'],
    // …a message being sent shows a small clock instead of the ticks.
    ['<path d="M1 6l3 3 6-7M7 8.5l.5.5 6-7">', '<path d={m.tickPath}>'],
    // The camera takes a photo or a video; the mic records a voice note (they were drawn only); while recording, the
    // composer is the recording bar (time, Cancel, Send).
    [/(<span )(style=\{\{ flex: "none", width: "40px", height: "44px", display: "grid", placeItems: "center", color: "rgb\(128 107 96\)" )\}\}>(\s*<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">\s*<path d="M4 8h3l2-3h6l2 3h3v11H4V8Z)/,
     '$1onClick={v.openCamera} title="Camera" $2, cursor: "pointer" }}>$3'],
    [/(<span )(style=\{\{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff" )\}\}>(\s*<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">\s*<path d="M12 3a3 3 0 0 0-3 3v6)/,
     '$1onClick={v.micTap} title="Voice note" $2, cursor: "pointer" }}>$3'],
    ['{!!(v.chatWarm) && (<>\n        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", padding: "8px 0" }}>',
     "{!!(v.chatWarm && v.rec) && (<>\n        <div style={{ display: \"flex\", alignItems: \"center\", gap: \"6px\", padding: \"8px 0\" }}>\n          <span onClick={v.rec?.cancel} title=\"Cancel\" style={{ flex: \"none\", width: \"44px\", height: \"44px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid rgb(235 221 210)\", display: \"grid\", placeItems: \"center\", color: \"#A3371A\", cursor: \"pointer\" }}>\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\"><path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"></path></svg>\n          </span>\n          <span style={{ flex: \"1\", minWidth: \"0\", height: \"44px\", boxSizing: \"border-box\", borderRadius: \"22px\", background: \"#FBF1EC\", display: \"flex\", alignItems: \"center\", gap: \"10px\", padding: \"0 16px\", fontSize: \"15px\", fontWeight: \"600\", color: \"#3F2B22\", fontVariantNumeric: \"tabular-nums\" }}>\n            <span style={{ flex: \"none\", width: \"10px\", height: \"10px\", borderRadius: \"50%\", background: \"#D93025\", animation: \"fadeIn 700ms ease-in-out infinite alternate\" }}></span>{v.rec?.time} · Recording…\n          </span>\n          <span onClick={v.rec?.send} title=\"Send voice note\" style={{ flex: \"none\", width: \"44px\", height: \"44px\", borderRadius: \"50%\", display: \"grid\", placeItems: \"center\", background: \"#BD4A19\", color: \"#fff\", cursor: \"pointer\" }}>\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\"><path d=\"M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9\"></path></svg>\n          </span>\n        </div>\n      </>)}\n      " + '{!!(v.chatWarm && !v.rec) && (<>\n        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", padding: "8px 0" }}>'],
    // 2026-10-13: the sticker button opens the emoji sheet (shared/emoji.ts), a tap adds one to the reply.
    ['<span title="Stickers" style={{ width: "38px", height: "38px", display: "grid", placeItems: "center", color: "rgb(128 107 96)" }}>',
     '<span onClick={v.openEmoji} title="Emoji" style={{ width: "38px", height: "38px", display: "grid", placeItems: "center", color: "rgb(128 107 96)", cursor: "pointer" }}>'],
    ['{!!(v.hm.apptOpen) && (<>', EMOJI_PANEL("v", "v.emojiOpen && v.chatWarm", 'margin: "0 -20px", ') + '{!!(v.hm.apptOpen) && (<>'],
    // 2026-10-13: picked photos / videos wait on a preview with an HD switch (shared/pick.ts).
    ['{!!(v.hm.toast) && (<>', PICK_SHEET("v.pk") + '{!!(v.hm.toast) && (<>'],
    // 2026-10-13: a message that did not reach the customer says why under it (vm/chat.ts › failNote), not only a red tick.
    [/(<path d=\{m\.tickPath\}>\s*<\/path>\s*<\/svg>\s*<\/>\)\}<\/span>)/, '$1{!!(m.failNote) && (<span style={{ display: "block", marginTop: "3px", fontSize: "11px", lineHeight: "1.35", color: "#A3371A" }}>{m.failNote}</span>)}'],
    // 1.2 Every bubble lifts a little off the wallpaper.
    ["boxSizing: \"border-box\", borderRadius: m.radius, background: m.bg,", "boxSizing: \"border-box\", borderRadius: m.radius, boxShadow: \"0 1px 1px rgba(63,43,34,.10)\", background: m.bg,"]],
  // Switch to: a whole department's list scrolls inside the sheet instead of running off the screen (user 2026-10-09).
  SalesShellBanners: [['<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px" }}>',
    '<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>'],
    // …grouped by team, with View as's group heading (design 1a) over each group.
    ['<div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: "1px solid #F5EEE9", cursor: "pointer" }}>',
     '{!!p.hasHead && (<span style={{ padding: "8px 0 4px", fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" }}>{p.head}</span>)}\n            <div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: p.rule, cursor: "pointer" }}>']],
};
// Customer info (Contacts, Calendar, Insight): the sheet scrolls when its rows are taller than it — the rows and Open chat
// keep their size instead of being squeezed (user 2026-10-11: Open chat came out a sliver, Budget cut in half).
const INFO_SHEET = [
  [/<div style=\{\{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" \}\}>(\s*\{\(v\.ctRows\))/,
    "<div style={{ flex: \"none\", display: \"flex\", flexDirection: \"column\", borderRadius: \"14px\", border: \"1px solid #EBDDD2\" }}>$1"],
  ["<span onClick={v.ctChat} style={{ height: \"50px\",", "<span onClick={v.ctChat} style={{ flex: \"none\", height: \"50px\","],
];
for (const n of ["SalesContacts", "SalesCalendar", "SalesInsight"]) PATCHES[n] = [...(PATCHES[n] ?? []), ...INFO_SHEET];
// The customer form follows the Control panel's Forms (CRM Desktop rev 1, B5): every copy of it.
for (const n of ["SalesChat", "SalesContacts", "SalesCalendar", "SalesInsight", "SalesCustomerForm"]) PATCHES[n] = [...(PATCHES[n] ?? []), ...require("./form-patches.cjs")()];
// The way back to the Revenue app left of the bell on every page (2026-10-14, the owner — switch-back.cjs).
const switchBack = require("./switch-back.cjs");
// …and Team | Mine left of the house, for whoever has a Team side (2026-10-14, the owner — team-mine-swap.cjs).
const teamMineSwap = require("./team-mine-swap.cjs");
const SWAP = (indent, extra) => "{!!(v.tm.on) && (<>\n" + indent + "  " + teamMineSwap("v.tm", indent + "  ", extra) + "\n" + indent + "</>)}\n" + indent;
// Round 2 (rev 1010 §8.2): the bell moves into each page's title row, at its right end — the Control panel prototype's
// round button (40×40, 1px #EBDDD2, white, soft shadow, 20 px bell, rust badge top/right -4px) — and the way back left of it,
// one group (with Team | Mine left of both): a title row that spreads its children (Contacts) keeps them side by side at
// its right end.
const BELL = "{!!(v.tb) && (<>\n          <span style={{ display: \"flex\", alignItems: \"center\", gap: \"8px\", flex: \"none\" }}>\n          " + SWAP("          ") + switchBack("          ") + "\n          <span onClick={v.tb.open} title=\"Notifications\" style={{ position: \"relative\", flex: \"none\", width: \"40px\", height: \"40px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid #EBDDD2\", background: \"#fff\", display: \"grid\", placeItems: \"center\", color: \"#3F2B22\", boxShadow: \"0 2px 8px rgba(63,43,34,.06)\", cursor: \"pointer\" }}>\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n              <path d=\"M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0\">\n              </path>\n            </svg>\n            {!!(v.tb.has) && (<>\n              <span style={{ position: \"absolute\", top: \"-4px\", right: \"-4px\", minWidth: \"18px\", height: \"18px\", padding: \"0 5px\", boxSizing: \"border-box\", borderRadius: \"9px\", background: \"#BD4A19\", border: \"2px solid #fff\", color: \"#fff\", display: \"grid\", placeItems: \"center\", fontSize: \"10px\", fontWeight: \"700\" }}>{v.tb.n}</span>\n            </>)}\n          </span>\n          </span>\n        </>)}";
// Inbox rows: a long press opens More (user 2026-10-13); scrolling (pointer cancel) stops it, and the phone's own text
// callout stays away.
PATCHES.SalesInbox = [...(PATCHES.SalesInbox ?? []),
  ['<div onClick={l.open} onPointerDown={l.down} onPointerUp={l.up} style={{ position: "relative",',
   '<div onClick={l.open} onPointerDown={l.down} onPointerUp={l.up} onPointerCancel={l.cancel} onContextMenu={l.noMenu} style={{ WebkitTouchCallout: "none", position: "relative",']];
// Inbox rows swipe as WhatsApp's (the owner, 2026-10-14: "往左滑很慢"): the row follows the finger (onPointerMove); left
// shows Assign (a TL / STL their team's customer; the Principal / Director in someone's CRM) beside More, right shows Read
// (an unread chat of one's own) and Pin / Unpin. Each row skips its layout while off screen (data-inbox-row →
// content-visibility, crm.module.css), so a long list scrolls as the chat does.
const ROW_ACT = (side, off, bg, click, label, icon) => '<span onClick={' + click + '} style={{ position: "absolute", top: "0", bottom: "0", ' + side + ': ' + off + ', width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "' + bg + '", color: "#fff", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="' + icon + '" /></svg>' + label + '</span>';
PATCHES.SalesInbox = [...(PATCHES.SalesInbox ?? []),
  ['<div style={{ position: "relative", overflow: "hidden", borderTop: l.rule }}>',
   '<div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: l.rule }}>\n            '
   + '{!!(l.canRead) && (' + ROW_ACT("left", '"0"', "#2F8FD8", "l.read", "{l.readLabel}", "M3 7l9 6 9-6M3 7v10h18V7M3 7l9-4 9 4") + ')}\n            '
   + ROW_ACT("left", 'l.canRead ? "84px" : "0"', "#A8968B", "l.pin", "{l.pinLabel}", "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z") + '\n            '
   + '{!!(l.canAssign) && (' + ROW_ACT("right", '"84px"', "#2F6FB5", "l.assign", "Assign", "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3") + ')}'],
  ['<div onClick={l.open} onPointerDown={l.down} onPointerUp={l.up} onPointerCancel={l.cancel}', '<div onClick={l.open} onPointerDown={l.down} onPointerMove={l.move} onPointerUp={l.up} onPointerCancel={l.cancel}'],
];
// A notification's row shows the customer's latest words under its line (2026-10-14: "在 notification 裡，我看不到重點").
PATCHES.SalesProfile = [...(PATCHES.SalesProfile ?? []),
  ['<span style={{ fontSize: "12px", color: "#806B60" }}>{u.meta}</span>',
   '<span style={{ fontSize: "12px", color: "#806B60" }}>{u.meta}</span>\n                    {!!(u.sum) && (<span style={{ fontSize: "13px", color: "#3F2B22", lineHeight: "1.35", marginTop: "2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{u.sum}</span>)}'],
];
// Inbox: after All ads, 8 px apart (the title takes the room, so All ads and the bell sit right). Team | Mine left the title
// row for its own top row (§8.4, superseding 2026-10-11's place beside All ads), and came back as one round button in
// BELL (2026-10-14).
PATCHES.SalesInbox = [...(PATCHES.SalesInbox ?? []),
  ['<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>\n        <h1 style={{ margin: "0", fontSize: "28px",',
    '<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>\n        <h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "28px",'],
  [/(<span onClick=\{v\.openAd\}[\s\S]*?<\/span>)(\s*<\/div>\s*<label)/, "$1\n        " + BELL + "$2"]];
// The way back takes 48 px of that row (2026-10-14): on a narrow phone with a long ad picked, the ad's name gives way
// (it ends in …) and the title stays whole — at 390 px All ads covered "Inbox" otherwise.
PATCHES.SalesInbox = [...PATCHES.SalesInbox,
  ['<h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "28px",', '<h1 style={{ flex: "1 0 auto", margin: "0", fontSize: "28px",'],
  ['<span onClick={v.openAd} style={{ flex: "0 0 auto", width: "max-content",', '<span onClick={v.openAd} style={{ flex: "0 1 auto", minWidth: "0", width: "max-content",'],
  ['{{ flex: "0 0 auto", width: "max-content", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.adLabel}',
    '{{ flex: "0 1 auto", minWidth: "0", width: "max-content", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.adLabel}'],
  // …its two icons keep their size.
  ['<svg style={{ color: "#BD4A19" }} width="16" height="16"', '<svg style={{ flex: "none", color: "#BD4A19" }} width="16" height="16"'],
  ['<svg style={{ color: "#806B60" }} width="14" height="14"', '<svg style={{ flex: "none", color: "#806B60" }} width="14" height="14"']];
// Contacts: right of the title; the row reaches 8 px into main's 28 px right padding (kept for the A–Z index), so its bell
// lines up with the other pages'.
PATCHES.SalesContacts = [...(PATCHES.SalesContacts ?? []),
  ['<div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>\n          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Contacts</h1>\n        </div>',
    '<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginRight: "-8px" }}>\n          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Contacts</h1>\n          ' + BELL + '\n        </div>']];
// Calendar: after Today, 8 px apart. On a phone too narrow for the month beside Today and the round buttons, the month
// takes its short name (shared/fit-rows.ts, 2026-10-14).
PATCHES.SalesCalendar = [...(PATCHES.SalesCalendar ?? []),
  ['<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>\n        <h1 style={{ margin: "0", fontSize: "26px",',
    '<div data-fit-row="1" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "0 20px" }}>\n        <h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "26px",'],
  ['>{v.calTitle}</h1>', '><span data-fit-long="1">{v.calTitle}</span><span data-fit-short="1">{v.calShort}</span></h1>'],
  [/(<span onClick=\{v\.calToday\}[^\n]*?>Today<\/span>)/, "$1\n        " + BELL]];
// Insight: after the date chip, 8 px apart. On a phone too narrow for "Insight" beside the chip and the round buttons, the
// chip is a round button (its period is written under the title anyway — shared/fit-rows.ts, 2026-10-14).
PATCHES.SalesInsight = [...(PATCHES.SalesInsight ?? []),
  ['<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>\n        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>\n          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Insight</h1>',
    '<div data-fit-row="1" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>\n        <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>\n          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Insight</h1>'],
  [/(<span onClick=\{v\.openRange\}[\s\S]*?<\/svg><\/span>)/, "$1\n        " + BELL],
  ['<span onClick={v.openRange} style={{', '<span onClick={v.openRange} data-fit-ctl="icon" style={{'],
  ['</svg>{v.rgLabel}<svg width="14" height="14"', '</svg><span data-fit-word="1">{v.rgLabel}</span><svg data-fit-word="1" width="14" height="14"']];
// Profile: the bell in the profile card's top-right corner, 14 px in; the avatar + name row keeps 48 px clear of it so a long
// name wraps first. (Its "Back to Revenue app" card, §8.1, is gone — the owner, 2026-10-14: "delete this, cause is no need
// anymore": the house beside the bell is the way back, switch-back.cjs.)
PATCHES.SalesProfile = [...(PATCHES.SalesProfile ?? []),
  ['<div style={{ borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)",', '<div style={{ position: "relative", borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)",'],
  ['<div style={{ display: "flex", alignItems: "center", gap: "14px" }}>\n            <span style={{ flex: "none", width: "64px", height: "64px",',
    // …and the way back left of it, 8 px apart (switch-back.cjs), Team | Mine 8 px left of that (team-mine-swap.cjs); the
    // name row then keeps 96 px clear, 144 px with Team | Mine.
    "{!!(v.tb) && (<>\n          " + SWAP("          ", "position: \"absolute\", top: \"14px\", right: \"110px\", ") + switchBack("          ", "position: \"absolute\", top: \"14px\", right: \"62px\", ") + "\n          <span onClick={v.tb.open} title=\"Notifications\" style={{ position: \"absolute\", top: \"14px\", right: \"14px\", flex: \"none\", width: \"40px\", height: \"40px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid #EBDDD2\", background: \"#fff\", display: \"grid\", placeItems: \"center\", color: \"#3F2B22\", boxShadow: \"0 2px 8px rgba(63,43,34,.06)\", cursor: \"pointer\" }}>\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n              <path d=\"M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0\">\n              </path>\n            </svg>\n            {!!(v.tb.has) && (<>\n              <span style={{ position: \"absolute\", top: \"-4px\", right: \"-4px\", minWidth: \"18px\", height: \"18px\", padding: \"0 5px\", boxSizing: \"border-box\", borderRadius: \"9px\", background: \"#BD4A19\", border: \"2px solid #fff\", color: \"#fff\", display: \"grid\", placeItems: \"center\", fontSize: \"10px\", fontWeight: \"700\" }}>{v.tb.n}</span>\n            </>)}\n          </span>\n        </>)}" + '\n          <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingRight: v.tm.on ? "144px" : "96px" }}>\n            <span style={{ flex: "none", width: "64px", height: "64px",']];
// The five pages read the bell, the house and Team | Mine beside their own view model: header.ts › ShellExtras.
const EXTRAS = new Set(["SalesInbox", "SalesContacts", "SalesCalendar", "SalesInsight", "SalesProfile"]);
for (const [name, vm, frag, doc, vmOverride] of parts) {
  let body = convert(frag);
  for (const [a, b] of PATCHES[name] ?? []) {
    const n = typeof a === "string" ? body.split(a).length - 1 : (body.match(new RegExp(a.source, "g")) ?? []).length;
    if (n !== 1) throw new Error(`${name}: patch matched ${n} times: ${a}`);
    body = body.replace(a, b);
  }
  // Text with an apostrophe ("doesn't") renders as written; lint is told so on that file only.
  const apos = /[>}][^<>{}]*'[^<>{}]*[<{]/.test(body.replace(/"[^"]*"/g, '""'));
  const usesFragment = body.includes("<Fragment");
  const usesH = body.includes("H.hov"), extras = EXTRAS.has(name);
  const vmFile = vmOverride ?? name.replace(/^Sales/, "").replace(/^ShellBanners$/, "Shell").toLowerCase();
  const code = `"use client";
${apos ? "/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */\n" : ""}
// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/${vmFile}.ts. To change the look, change the design and regenerate.
${usesFragment ? 'import { Fragment } from "react";\n' : ""}${usesH ? 'import H from "../crm.module.css";\n' : ""}${body.includes("<PickEditor") ? 'import { PickEditor } from "../shared/pick-editor";\n' : ""}${body.includes("<MediaAlbum") ? 'import { ChatImg, ChatVideo, MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";\n' : ""}import type { ${vm} } from "./vm/${vmFile}";${extras ? '\nimport type { ShellExtras } from "./vm/header";' : ""}

/** ${doc} */
export default function ${name}({ v }: { v: ${vm}${extras ? " & ShellExtras" : ""} }) {
  return (<>${body}</>);
}
`;
  fs.writeFileSync(path.join(out, name + ".tsx"), code);
  console.log(name, code.length);
}
console.log("hover", [...hoverClasses]);
