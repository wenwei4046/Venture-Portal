// Generates the salesperson CRM's screens from CRM Revenue View.dc.html (3b) into React components.
// Run from the repo: node tools/crm-design/gen-sales.cjs (overwrites src/components/member/crm/sales/Sales*.tsx).
const fs = require("fs"), path = require("path");
const { convert, hoverClasses } = require("./dc2jsx.cjs");
const repo = path.resolve(__dirname, "../..");
const src = fs.readFileSync(path.join(repo, "docs/design_handoff_crm_roles/CRM Revenue View.dc.html"), "utf8").split(/\r?\n/);
const out = path.join(repo, "src/components/member/crm/sales");
fs.mkdirSync(out, { recursive: true });
const lines = (a, b) => src.slice(a - 1, b).join("\n");

const line34 = src[33];
const shellPart = line34.slice(line34.indexOf('<sc-if value="{{ rdX }}"'));

const parts = [
  ["SalesShellBanners", "ShellVM", shellPart, "The Revenue Director's Control panel | My CRM toggle, the Viewing-someone banner and the Switch sheet."],
  ["SalesHeader", "HeaderVM", lines(36, 39), "Top bar: back to the Revenue app, and the bell."],
  ["SalesInbox", "InboxVM", lines(41, 118), "Inbox: search, filter chips, rows (swipe for More), the More / Label sheets and the ad filter."],
  ["SalesContacts", "ContactsVM", lines(121, 180), "Contacts: A–Z, swipe to edit or delete, customer details and info sheets."],
  ["SalesCalendar", "CalendarVM", lines(183, 301), "Calendar: Month / Week / Day, Today with Show up / No show, upcoming, outcome and celebration."],
  ["SalesProfile", "ProfileVM", lines(304, 429), "Profile: card, View my team, workspace, Notifications, Quick replies, Auto-reply."],
  ["SalesInsight", "InsightVM", lines(432, 491), "Insight: Month / Week / Day / Range, the walnut hero and leads by status."],
  ["SalesChat", "ChatVM", lines(496, 741), "A chat: header menu, messages, booking, quick replies, templates and every sheet."],
  // The customer form alone, for the Control panel's chat (Book visit asks for the details first, as here).
  ["SalesCustomerForm", "CustomerFormVM", lines(127, 144), "The customer form (name, phone, property, budget) — step 1 of a first booking, or Edit.", "customer"],
  ["SalesNav", "NavVM", lines(743, 750).replace(/^\s*<sc-if value="\{\{ inboxOpen \}\}"[^>]*>/, "").replace(/<\/sc-if>\s*$/, ""), "The bottom bar."],
];

// Where the design shows a demo value, the live one (each must match exactly once).
const PATCHES = {
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
    // 1.2 Every bubble lifts a little off the wallpaper.
    ["boxSizing: \"border-box\", borderRadius: m.radius, background: m.bg,", "boxSizing: \"border-box\", borderRadius: m.radius, boxShadow: \"0 1px 1px rgba(63,43,34,.10)\", background: m.bg,"]],
  // Switch to: a whole department's list scrolls inside the sheet instead of running off the screen (user 2026-10-09).
  SalesShellBanners: [['<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px" }}>',
    '<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>'],
    // …grouped by team, with View as's group heading (design 1a) over each group.
    ['<div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: "1px solid #F5EEE9", cursor: "pointer" }}>',
     '{!!p.hasHead && (<span style={{ padding: "8px 0 4px", fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" }}>{p.head}</span>)}\n            <div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: p.rule, cursor: "pointer" }}>']],
};
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
