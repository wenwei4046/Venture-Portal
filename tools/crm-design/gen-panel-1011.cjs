// Generates the Control panel (rev 1011) from docs/design/rev1011/prototypes/Principal Panel.dc.html into ONE component,
// src/components/member/crm/panel/PanelApp.tsx — the prototype's markup verbatim (its phone frame dropped), bound to
// one view model whose groups are the prototype's own: hd (head), bl (bell), ov (overview), ib (inbox), ld (a chat),
// cf (customer form), ad (Ads Performance), as / asx / bp / ftx / hl (Assignment), cal / cl / ci (Calendar), pf / fts / tp
// (Profile, Member work type, Cold lead templates), rm (Showrooms), ol (overlays), nv (bottom bar).
// Run from the repo: node tools/crm-design/gen-panel-1011.cjs
const fs = require("fs"), path = require("path");
const { convert } = require("./dc2jsx.cjs");
const repo = path.resolve(__dirname, "../..");
const src = fs.readFileSync(path.join(repo, "docs/design/rev1011/prototypes/Principal Panel.dc.html"), "utf8");
const lines = src.split("\n").map(l => l.replace(/\r$/, ""));
// The prototype draws a phone (390 x 844, its own radius and shadow) on line 27 and closes it on line 29: the app IS the
// phone, so only what is inside it (line 28) is generated.
if (!lines[26].includes('data-screen-label="Principal · Control panel"') || lines[28].trim() !== "</div>") throw new Error("the phone frame moved");
const inner = lines[27];
const PATCHES = require("./panel-1011-patches.cjs");

let body = convert(inner);
for (const [a, b] of PATCHES) {
  const n = typeof a === "string" ? body.split(a).length - 1 : (body.match(new RegExp(a.source, "g")) || []).length;
  if (n !== 1) throw new Error(`PanelApp: patch matched ${n} times: ${a}`);
  body = body.replace(a, b);
}
// The Revenue app's type scale on every size (2026-10-14 — type-scale.cjs), after the patches, which match the prototype's px.
body = require("./type-scale.cjs")(body);
const apos = /[>}][^<>{}]*'[^<>{}]*[<{]/.test(body.replace(/"[^"]*"/g, '""'));
const code = `"use client";
${apos ? "/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */\n" : ""}
// GENERATED from docs/design/rev1011/prototypes/Principal Panel.dc.html (rev 1011) by tools/crm-design/gen-panel-1011.cjs —
// markup and styles exactly as designed. Behaviour lives in ./vm/app.ts (and the vm/*.ts it groups). To change the look,
// change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { PickEditor } from "../shared/pick-editor";
import { ChatImg, ChatVideo, MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";
import type { PanelAppVM } from "./vm/app";

/** The whole Control panel: the top bar, every tab, every sheet and page, the toast and the bottom bar. */
export default function PanelApp({ v }: { v: PanelAppVM }) {
  return (<>${body}</>);
}
`;
fs.writeFileSync(path.join(repo, "src/components/member/crm/panel/PanelApp.tsx"), code);
console.log("PanelApp", code.length);
