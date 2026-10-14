// Generates the Control panel's screens from CRM Principal View.dc.html (1a) into React components.
// Run from the repo: node tools/crm-design/gen-panel.cjs (overwrites src/components/member/crm/panel/Panel*.tsx).
const fs = require("fs"), path = require("path");
const { convert } = require("./dc2jsx.cjs");
const repo = path.resolve(__dirname, "../..");
const src = fs.readFileSync(path.join(repo, "docs/design_handoff_crm_roles/CRM Principal View.dc.html"), "utf8").split(/\r?\n/);
const out = path.join(repo, "src/components/member/crm/panel");
fs.mkdirSync(out, { recursive: true });
const lines = (a, b) => src.slice(a - 1, b).join("\n");

const parts = [
  ["PanelBell", "BellVM", "bell", lines(34, 34), "The bell at the top right (Notifications), with its unread count."],
  ["PanelHead", "HeadVM", "head", lines(39, 41), "The back link a sub-page shows."],
  ["PanelOverview", "OverviewVM", "overview", lines(43, 133), "Insight: greeting, Control panel | My CRM, period, the hero, Comparison, Needs your action, Team performance — and the date sheet."],
  ["PanelInbox", "InboxVM", "inbox", lines(135, 154), "Inbox: the status board — Needs a reply · Follow up · Appointment · Won · Lost — by team and member."],
  // PanelLead (the chat, 176–245) is no longer generated: the Control panel's chat is PanelApp's (gen-panel-1011.cjs), with
  // Mine's composer since 2026-10-15 (panel-chat-composer-patches.cjs); nothing imported the 1a one.
  ["PanelAds", "AdsVM", "ads", lines(247, 314), "Profile › Ads Performance: per-ad leads, appointment rate and show-up, with a comparison."],
  // The Team Leader's own split page (371–402) is not reachable in this design: a TL uses the salesperson CRM.
  ["PanelAssign", "AssignVM", "assign", lines(315, 370) + "\n" + lines(403, 478), "Assignment: Organic Leads, Ads to teams (and its edit page), Awaiting reply, Full time lead allocation (and its page)."],
  ["PanelCalendar", "CalendarVM", "calendar", lines(480, 538), "Calendar: every visit as a list or a month, by team and person, with the stats and the range sheet."],
  ["PanelProfile", "ProfileVM", "profile", lines(540, 571), "Profile: the card, View as a team member, and the workspace."],
  ["PanelRooms", "RoomsVM", "rooms", lines(609, 700), "Profile › Showrooms: address, slots by weekday, booking limit, closures — editing, the time picker, delete."],
  ["PanelOverlays", "OverlaysVM", "overlays", lines(701, 811), "Undo bar, Send-to and Move sheets, Awaiting reply, View as, everyone's Contacts, Notifications."],
  ["PanelNav", "NavVM", "nav", lines(812, 814), "The bottom bar."],
];

const PATCHES = require("./panel-patches.cjs");
for (const [name, vm, vmFile, frag, doc] of parts) {
  let body = convert(frag);
  // The prototype draws a phone, its 9:41 status bar 54 px tall; the app has none, so full-screen sheets start at the top.
  body = body.replace(/top: "54px", bottom: "0"/g, 'top: "0", bottom: "0"').replace(/padding: "54px (\d+px) (\d+px)"/g,'padding: "10px $1 $2"');
  for (const [a, b] of PATCHES[name] ?? []) {
    const n = body.split(a).length - 1;
    if (n !== 1) throw new Error(`${name}: patch matched ${n} times: ${a}`);
    body = body.replace(a, b);
  }
  // Text with an apostrophe ("doesn't") renders as written; lint is told so on that file only.
  const apos = /[>}][^<>{}]*'[^<>{}]*[<{]/.test(body.replace(/"[^"]*"/g, '""'));
  const usesFragment = body.includes("<Fragment");
  const usesH = body.includes("H.hov");
  const code = `"use client";
${apos ? "/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */\n" : ""}
// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
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
