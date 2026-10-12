// Ports the prototype's own logic (CrmFrame.dc.html's <script>, a class over this.state) into
// src/components/member/crm/desk/vm/proto-logic.ts — word for word, only the class plumbing rewritten
// (this.state → S, this.setState → set, this.props → P, timers / refs → R). It is the reference the desktop is
// pixel-compared against: the same bindings, on the prototype's own demo data. The live view model (vm/app.ts)
// is written from it by hand. Run from the repo: node tools/crm-design/gen-desk-logic.cjs
const fs = require("fs"), path = require("path");
const repo = path.resolve(__dirname, "../..");
const src = fs.readFileSync(path.join(repo, "docs/design/crm-desktop-rev1/prototypes/CrmFrame.dc.html"), "utf8").replace(/\r/g, "");
const s0 = src.indexOf("<script type=\"text/x-dc\""), s1 = src.indexOf("</script>", s0);
let js = src.slice(src.indexOf(">", s0) + 1, s1);
const cls = js.indexOf("class Component extends DCLogic {");
if (cls < 0) throw new Error("the prototype's class moved");
const consts = js.slice(0, cls);
let body = js.slice(cls);
// The class's methods, as functions over (P, S, set, R).
body = body
  .replace("class Component extends DCLogic {", "")
  .replace(/\n\s*state = \{\};\n/, "\n")
  .replace(/\n\s*componentDidMount\(\) \{/, "\nfunction keyHandler(P, S, set, R) {")
  .replace(/window\.addEventListener\('keydown', this\._key\);/, "return this._key;")
  .replace(/componentWillUnmount\(\) \{[^\n]*\n/, "")
  .replace(/\n  sortCl\(rows\) \{/, "\nfunction sortCl(S, rows) {")
  .replace(/\n\s*cur\(\) \{/, "\nfunction cur(P, S) {")
  .replace(/\n  closePane\(\) \{/, "\nfunction closePane(P, S, set) {")
  .replace(/\n  sheetOn\(tab\) \{ return \(this\.props\.flow === 'sheet'\)/, "\nfunction sheetOn(P, tab) { return (P.flow === 'sheet')")
  .replace(/\n  renderVals\(\) \{/, "\nexport function protoVals(P, S, set, R) {");
// Drop the class's closing brace (the last "}" before the end).
body = body.replace(/\}\s*$/, "");
body = body
  .replace(/this\.sortCl\(/g, "sortCl(S, ")
  .replace(/this\.cur\(\)/g, "cur(P, S)")
  .replace(/this\.closePane\(\)/g, "closePane(P, S, set)")
  .replace(/this\.sheetOn\(/g, "sheetOn(P, ")
  .replace(/this\.state/g, "S")
  .replace(/this\.setState/g, "set")
  .replace(/this\.props/g, "P")
  .replace(/this\._tt/g, "R.tt")
  .replace(/this\._cltTa/g, "R.cltTa")
  .replace(/this\._key/g, "R.key")
  .replace(/React\.createRef\(\)/g, "{ current: null }");
// Code only: "this." / "this(" — the copy says "in this team".
if (/\bthis\s*[.(]/.test(body)) throw new Error("a `this` survived: " + body.match(/.{40}\bthis\s*[.(].{40}/)[0]);
const out = `/* eslint-disable @typescript-eslint/ban-ts-comment -- the prototype's script, verbatim, only for the pixel comparison (DeskProto) */
// @ts-nocheck -- GENERATED from docs/design/crm-desktop-rev1/prototypes/CrmFrame.dc.html by
// tools/crm-design/gen-desk-logic.cjs: the prototype's own logic and demo data, verbatim, for pixel comparison only
// (/member/preview?app=desk-proto). Production reads vm/app.ts. Never edit; regenerate.
/* eslint-disable */
${consts}
${body}
export { keyHandler };
`;
fs.writeFileSync(path.join(repo, "src/components/member/crm/desk/vm/proto-logic.ts"), out);
console.log("proto-logic", out.length);
