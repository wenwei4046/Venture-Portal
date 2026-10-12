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

// rev 1010 §7.3 Team | Mine in the top bar of every RS page, between the back link and the bell — the prototype's
// Director pill (RS Insight's isDir / dirTabs), centred in the bar; shown to the Director and to anyone with a downline.
const headerFrag = (() => {
  const pill = protoNode("RS Insight", "{{ isDir }}").replace("{{ isDir }}", "{{ hasTM }}").replace("{{ dirTabs }}", "{{ tmTabs }}")
    .replace("align-self: flex-start;", "align-self: center; margin-left: auto;");
  return once(lines(36, 39), '<span onClick="{{ openNotifTop }}"', pill + '<span onClick="{{ openNotifTop }}"');
})();

const line34 = src[33];
const shellPart = line34.slice(line34.indexOf('<sc-if value="{{ rdX }}"'));

const parts = [
  ["SalesShellBanners", "ShellVM", shellPart, "The Revenue Director's Control panel | My CRM toggle, the Viewing-someone banner and the Switch sheet."],
  ["SalesHeader", "HeaderVM", headerFrag, "Top bar: back to the Revenue app, Team | Mine (leaders and the Director), and the bell."],
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
// Inbox: Team | Mine moves from the top bar into the title row, just left of All ads (user 2026-10-11) — the top bar's
// own pill markup; margin-left auto keeps it beside All ads.
PATCHES.SalesInbox = [...(PATCHES.SalesInbox ?? []), ["<span onClick={v.openAd} style",
  '{!!(v.hasTM) && (<>\n        <div style={{ flex: "none", alignSelf: "center", marginLeft: "auto", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F0E6DE" }}>\n' +
  '          {(v.tmTabs).map((d, d_i) => (<Fragment key={d_i}>\n' +
  '            <span onClick={d.pick} style={{ height: "28px", padding: "0 14px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", background: d.bg, color: d.fg, boxShadow: d.sh, cursor: "pointer" }}>{d.label}</span>\n' +
  '          </Fragment>))}\n        </div>\n      </>)}\n        <span onClick={v.openAd} style']];
// Top bar with Team | Mine: "‹ Back to Revenue app", the pill and the bell filled the 335 px to the pixel, so the link
// broke onto two lines (user 2026-10-11). The link stays on one line; the pill's tabs take 12 px a side, not 14 (here and
// beside All ads), which leaves room.
PATCHES.SalesHeader = [...(PATCHES.SalesHeader ?? []),
  ['fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="20"', 'fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", flex: "none", cursor: "pointer" }}><svg width="20"'],
  ['padding: "0 14px", borderRadius: "9px"', 'padding: "0 12px", borderRadius: "9px"']];
PATCHES.SalesInbox[PATCHES.SalesInbox.length - 1][1] = PATCHES.SalesInbox[PATCHES.SalesInbox.length - 1][1].replace('padding: "0 14px", borderRadius: "9px"', 'padding: "0 12px", borderRadius: "9px"');
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
  const usesH = body.includes("H.hov");
  const vmFile = vmOverride ?? name.replace(/^Sales/, "").replace(/^ShellBanners$/, "Shell").toLowerCase();
  const code = `"use client";
${apos ? "/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */\n" : ""}
// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/${vmFile}.ts. To change the look, change the design and regenerate.
${usesFragment ? 'import { Fragment } from "react";\n' : ""}${usesH ? 'import H from "../crm.module.css";\n' : ""}import type { ${vm} } from "./vm/${vmFile}";

/** ${doc} */
export default function ${name}({ v }: { v: ${vm} }) {
  return (<>${body}</>);
}
`;
  fs.writeFileSync(path.join(out, name + ".tsx"), code);
  console.log(name, code.length);
}
console.log("hover", [...hoverClasses]);
