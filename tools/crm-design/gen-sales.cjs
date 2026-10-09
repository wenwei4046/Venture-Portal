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
  ["SalesNav", "NavVM", lines(743, 750).replace(/^\s*<sc-if value="\{\{ inboxOpen \}\}"[^>]*>/, "").replace(/<\/sc-if>\s*$/, ""), "The bottom bar."],
];

// Where the design shows a demo value, the live one (each must match exactly once).
const PATCHES = {
  SalesProfile: [[">Full time</strong>", ">{v.meRankX}</strong>"]],
  SalesChat: [[/(<span onClick=\{v\.simReply\}[^>]*>Demo: customer replies<\/span>)/, "{!!v.simReplyShow && ($1)}"]],
  // Switch to: a whole department's list scrolls inside the sheet instead of running off the screen (user 2026-10-09).
  SalesShellBanners: [['<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px" }}>',
    '<div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>']],
};
for (const [name, vm, frag, doc] of parts) {
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
  const vmFile = name.replace(/^Sales/, "").replace(/^ShellBanners$/, "Shell").toLowerCase();
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
