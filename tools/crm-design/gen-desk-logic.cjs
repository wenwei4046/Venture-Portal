// Ports the prototype's own logic (CrmFrame v2.dc.html's <script>, `class Component extends DCLogic`) into
// src/components/member/crm/desk/vm/proto-logic.ts — word for word: the class is kept as it is and runs on
// ./proto-base.ts, a copy of the design runtime's DCLogic (support.js › StreamableLogic: state merged at once,
// function updaters, a callback after). It is the reference the desktop is pixel-compared against: the same bindings,
// on the prototype's own demo data (DeskProto, /member/preview?app=desk-proto). The live view model (vm/app.ts) is
// written from it by hand. Run from the repo: node tools/crm-design/gen-desk-logic.cjs
const fs = require("fs"), path = require("path");
const repo = path.resolve(__dirname, "../..");
const SRC = "docs/design_handoff_crm_desktop_v2/prototypes/CrmFrame v2.dc.html";
const src = fs.readFileSync(path.join(repo, SRC), "utf8").replace(/\r/g, "");
const s0 = src.indexOf("<script type=\"text/x-dc\""), s1 = src.indexOf("</script>", s0);
const js = src.slice(src.indexOf(">", s0) + 1, s1);
if (!js.includes("class Component extends DCLogic {")) throw new Error("the prototype's class moved");
const out = `/* eslint-disable */
// @ts-nocheck -- GENERATED from ${SRC} by tools/crm-design/gen-desk-logic.cjs: the prototype's own logic and demo
// data, verbatim, for the pixel comparison only (/member/preview?app=desk-proto). Production reads vm/app.ts.
// Never edit; regenerate.
import React from "react";
import { DCLogic } from "./proto-base";
${js}
export { Component };
`;
fs.writeFileSync(path.join(repo, "src/components/member/crm/desk/vm/proto-logic.ts"), out);
console.log("proto-logic", out.length);
