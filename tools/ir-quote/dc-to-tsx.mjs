// IR Quote (2026-11-05): turns a Claude Design "Design Component" template (`.design/ir-quote/…/*.dc.html`) into a
// TSX render function, so the app draws exactly what the prototype draws — every inline style, every hover, every
// animation — without anybody retyping 5,000 lines of markup. It follows the prototype runtime's own rules
// (`support.js` › compileTemplate): `{{ path }}` holes, `<sc-if value>`, `<sc-for list as>`, `style-hover|focus` pseudo
// classes, camelCase attributes, raw table/select tags. Three things change on the way, all in the generated CSS and
// styles, never the layout:
//   · a hex colour in a template becomes `var(--irq-c-<hex>)`, declared once in `ir-quote.css` (no hex in components);
//   · Manrope / Space Grotesk / Chivo Mono / Inter read the app's next/font variables;
//   · the prototype's global rules (placeholder colour, keyframes) are scoped under `[data-irq]`.
//
//   node tools/ir-quote/dc-to-tsx.mjs            — regenerates src/components/member/app/irq/tpl/* and irq/ir-quote.css
//
// The output is generated: edit the prototype or this script, never the files it writes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, ".design/ir-quote/design_handoff_ir_quote");
const OUT = join(ROOT, "src/components/member/app/irq/tpl");
const CSS_OUT = join(ROOT, "src/components/member/app/irq/irq-css.ts");

const FILES = [
  ["IR Quote v9 Bold.dc.html", "QuoteTpl"],
  ["Quote Settings v3 Bold.dc.html", "SettingsTpl"],
  ["Quote Settings Mobile.dc.html", "SettingsMobileTpl"],
  ["Workspace.dc.html", "WorkspaceTpl"],
];

// ── where the app takes over from the prototype ──
// The prototypes draw their own stand-ins for the app around them (a sidebar, a header's account switcher, links to
// each other's .html files, 100vh roots). Each patch below is the ONLY change to the prototype's markup: it hands that
// spot to a value the app's logic sets, and must find its anchor exactly `count` times or the script stops.
const NAV_BTN = '<button style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0 8px;border:0;background:transparent;color:#6B6B66">';
const PATCHES = {
  "IR Quote v9 Bold.dc.html": [
    // The app's own sidebar on a computer (with its real rows and counts) stands where the prototype drew a copy.
    ['<sc-if value="{{ desk }}" hint-placeholder-val="{{ false }}">\n    <aside', '<sc-if value="{{ deskAside }}" hint-placeholder-val="{{ false }}">\n    <aside'],
    // Fills the app's column rather than the browser window.
    ["height:100vh;width:100%;max-width:{{ frameMax }}", "height:{{ rootH }};width:100%;max-width:{{ frameMax }}"],
    // The phone's bottom bar goes to the app's screens.
    [NAV_BTN, NAV_BTN.replace("<button ", '<button onClick="{{ n.go }}" '), 2],
    // Quote settings opens in the app, for those who may edit it.
    ['<a href="Quote Settings v3 Bold.dc.html"', '<a href="{{ settingsHref }}" onClick="{{ openSettings }}" data-irq-settings="{{ canSettings }}"'],
    // The bar stands on the app's safe area (CLAUDE.md › The installed app).
    ["padding-bottom:env(safe-area-inset-bottom,0px)", "padding-bottom:var(--safe-bottom)"],
    // …and the app's own top bar on a computer (greeting, bell, account), where the prototype drew a stand-in.
    ['<sc-if value="{{ desk }}" hint-placeholder-val="{{ false }}">\n      <header', '<sc-if value="{{ deskHeader }}" hint-placeholder-val="{{ false }}">\n      <header'],
    // The Change item sheet's header shows the item being replaced (the user, 2026-11-06), drawn as the list's own photos.
    ['<div style="min-width:0">\n              <p style="margin:0;font-size:11.5px;font-weight:650;letter-spacing:.08em;color:#111111">{{ sheet.eyebrow }}', '<div style="min-width:0;display:flex;align-items:flex-start;gap:12px"><sc-if value="{{ sheet.img }}" hint-placeholder-val="{{ false }}"><span onClick="{{ sheet.zoom }}" title="View larger" style="position:relative;flex:0 0 56px;width:56px;height:52px;border-radius:12px;background:#EEEEEA url(\'{{ sheet.img }}\') center/cover no-repeat;cursor:zoom-in"><span style="position:absolute;right:3px;bottom:3px;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;box-shadow:0 1px 3px rgba(20,20,18,0.15)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34342F" strokeWidth="2.4" strokeLinecap="round"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6"></path></svg></span></span></sc-if><div style="min-width:0">\n              <p style="margin:0;font-size:11.5px;font-weight:650;letter-spacing:.08em;color:#111111">{{ sheet.eyebrow }}'],
    ['{{ staleText }}</p></sc-if>\n            </div>\n            <button aria-label="Close" onClick="{{ closeSheet }}"', '{{ staleText }}</p></sc-if>\n            </div></div>\n            <button aria-label="Close" onClick="{{ closeSheet }}"'],
  ],
  "Quote Settings v3 Bold.dc.html": [
    ["position:relative;height:100vh;width:100%;display:flex", "position:relative;height:{{ rootH }};width:100%;display:flex"],
    ['\n  <aside style="flex:0 0 240px', '\n  <sc-if value="{{ deskAside }}"><aside style="flex:0 0 240px'],
    ["    </div>\n  </aside>\n", "    </div>\n  </aside></sc-if>\n"],
    // The app's own top bar stands where the prototype drew a stand-in with its sample Principal's initials.
    ['<header style="flex:0 0 60px;height:60px;display:flex;align-items:center;gap:16px;padding:0 28px;background:#FFFFFF', '<header style="flex:0 0 60px;height:60px;display:{{ hdrDisplay }};align-items:center;gap:16px;padding:0 28px;background:#FFFFFF'],
    ['font-size:12px;font-weight:700">TS</span>\n    </header>', 'font-size:12px;font-weight:700">{{ userInitials }}</span>\n    </header>'],
    // The Catalogue's column heads sort it (the user, 2026-11-06).
    ['<span style="padding:0 8px">CODE</span><span style="padding:0 8px">NAME</span><span style="padding:0 8px">CATEGORY</span><span style="padding:0 8px;text-align:right">PRICE (RM)</span><span style="padding:0 8px"></span><span style="padding:0 8px">SHOW</span>', '<span onClick="{{ catSortH.code.go }}" title="Sort by code" style="padding:0 8px;cursor:pointer;user-select:none">CODE{{ catSortH.code.mark }}</span><span onClick="{{ catSortH.name.go }}" title="Sort by name" style="padding:0 8px;cursor:pointer;user-select:none">NAME{{ catSortH.name.mark }}</span><span onClick="{{ catSortH.kind.go }}" title="Sort by category" style="padding:0 8px;cursor:pointer;user-select:none">CATEGORY{{ catSortH.kind.mark }}</span><span onClick="{{ catSortH.cost.go }}" title="Sort by price" style="padding:0 8px;text-align:right;cursor:pointer;user-select:none">PRICE (RM){{ catSortH.cost.mark }}</span><span style="padding:0 8px"></span><span onClick="{{ catSortH.show.go }}" title="Sort by show" style="padding:0 8px;cursor:pointer;user-select:none">SHOW{{ catSortH.show.mark }}</span>'],
  ],
  "Quote Settings Mobile.dc.html": [
    ['<a href="#" aria-label="Back to Profile"', '<a href="#" onClick="{{ back }}" aria-label="Back to Profile"'],
  ],
  "Workspace.dc.html": [],
};

// ── the runtime's encoding (support.js › encode.ts) ──
const CAMEL_ATTR = "sc-camel-";
const RAW_WRAP = { select: "sc-raw-select", table: "sc-raw-table", tbody: "sc-raw-tbody", thead: "sc-raw-thead", tfoot: "sc-raw-tfoot", tr: "sc-raw-tr", td: "sc-raw-td", th: "sc-raw-th", caption: "sc-raw-caption" };
const RAW_UNWRAP = Object.fromEntries(Object.entries(RAW_WRAP).map(([k, v]) => [v, k]));
const EVENT_MAP = Object.fromEntries("Click Change Input Submit KeyDown KeyUp KeyPress MouseDown MouseUp MouseEnter MouseLeave Focus Blur DoubleClick ContextMenu MouseMove MouseOver MouseOut PointerDown PointerUp PointerMove PointerEnter PointerLeave PointerCancel PointerOver PointerOut GotPointerCapture LostPointerCapture TouchStart TouchEnd TouchMove TouchCancel DragStart DragEnd DragEnter DragLeave DragOver Drop Paste AnimationStart AnimationEnd AnimationIteration TransitionEnd".split(" ").map(e => ["on" + e.toLowerCase(), "on" + e]));
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const kebabToCamel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function encodeCase(html) {
  html = html.replace(new RegExp("<(x-import|dc-import)(" + ATTRS + ")/>", "gi"), (_, t, a) => "<" + t + a + "></" + t + ">");
  html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1").replace(/<\/helmet\s*>/gi, "</sc-helmet>");
  html = html.replace(/(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g, (_, sp, name, eq) => sp + CAMEL_ATTR + name.replace(/[A-Z]/g, c => "-" + c.toLowerCase()) + eq);
  for (const [real, alias] of Object.entries(RAW_WRAP)) html = html.replace(new RegExp("(</?)" + real + "(?=[\\s>])", "gi"), "$1" + alias);
  return html;
}

// ── colours and faces ──
const colours = new Map(); // hex(lower, 6/8 digits) → var name
function hexVar(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join("");
  const name = `--irq-c-${h}`;
  colours.set(h, name);
  return `var(${name})`;
}
const FACE = [
  [/'Space Grotesk'|"Space Grotesk"/g, "var(--font-space-grotesk)"],
  [/\bManrope\b/g, "var(--font-manrope)"],
  [/'Chivo Mono'/g, "var(--font-mono)"],
  [/(font-family:\s*)Inter\b/g, "$1var(--font-sans)"],
];
function restyle(css) {
  let out = css.replace(/#[0-9A-Fa-f]{3,8}\b/g, m => ([4, 5, 7, 9].includes(m.length) ? hexVar(m) : m));
  for (const [re, to] of FACE) out = out.replace(re, to);
  return out;
}

// ── pseudo classes (style-hover / style-focus …) → one stylesheet ──
const pseudo = new Map(); // key → class
function importantify(css) {
  return css.split(";").map(d => d.trim()).filter(Boolean).map(d => (/!important\s*$/.test(d) ? d : d + " !important")).join(";");
}
function pseudoClass(kind, css) {
  const k = kind + "|" + css;
  if (!pseudo.has(k)) pseudo.set(k, { cls: "irq-p" + pseudo.size.toString(36), kind, css: restyle(css) });
  return pseudo.get(k).cls;
}

// ── expressions (support.js › resolve) → JS ──
function expr(src, scope) {
  const e = String(src).trim();
  if (!e) return "undefined";
  if (e[0] === "(" && e.endsWith(")") && wrapsWhole(e)) return expr(e.slice(1, -1), scope);
  const eq = topEquality(e);
  if (eq) return `(${expr(e.slice(0, eq.index), scope)} ${eq.op === "==" ? "==" : eq.op === "!=" ? "!=" : eq.op} ${expr(e.slice(eq.index + eq.op.length), scope)})`;
  if (e[0] === "!") return `!(${expr(e.slice(1), scope)})`;
  if (["true", "false", "null", "undefined"].includes(e)) return e;
  if (/^-?\d+(\.\d+)?$/.test(e)) return e;
  if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e.endsWith(e[0])) return JSON.stringify(e.slice(1, -1));
  const m = e.match(/^[A-Za-z_$][\w$]*/);
  if (!m) throw new Error("Unparsed expression: " + e);
  let out = scope.has(m[0]) ? scope.get(m[0]) : `v[${JSON.stringify(m[0])}]`;
  let i = m[0].length;
  while (i < e.length) {
    if (e[i] === ".") { const n = e.slice(i + 1).match(/^[A-Za-z_$][\w$]*|^\d+/); out += `?.[${JSON.stringify(n[0])}]`; i += 1 + n[0].length; }
    else if (e[i] === "[") { let d = 1, j = i + 1; while (j < e.length && d) { if (e[j] === "[") d++; else if (e[j] === "]") d--; j++; } out += `?.[${expr(e.slice(i + 1, j - 1), scope)}]`; i = j; }
    else throw new Error("Unparsed expression: " + e);
  }
  return out;
}
function wrapsWhole(e) { let d = 0; for (let i = 0; i < e.length - 1; i++) { if (e[i] === "(") d++; else if (e[i] === ")") { d--; if (!d) return false; } } return true; }
function topEquality(e) {
  let d = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "[" || c === "(") d++; else if (c === "]" || c === ")") d--;
    else if (!d && (c === "=" || c === "!") && e[i + 1] === "=") {
      if (i > 0 && (e[i - 1] === "=" || e[i - 1] === "!")) continue;
      if (!e.slice(0, i).trim()) continue;
      return { index: i, op: e[i + 2] === "=" ? c + "==" : c + "=" };
    }
  }
  return null;
}
const HOLE = /\{\{([\s\S]+?)\}\}/g;
const whole = raw => raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
const attrExpr = (raw, scope) => (whole(raw) ? expr(whole(raw)[1], scope) : raw.includes("{{") ? interp(raw, scope) : JSON.stringify(raw));
function interp(raw, scope, fix = s => s) {
  const parts = raw.split(HOLE);
  return "`" + parts.map((p, i) => (i & 1 ? "${dcS(" + expr(p, scope) + ")}" : fix(p).replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${"))).join("") + "`";
}
function cssToObj(css) {
  const o = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  return o;
}

// ── the walk ──
let loopN = 0;
function walkChildren(node, scope, ind) {
  return [...node.childNodes].map(c => walk(c, scope, ind)).filter(x => x != null);
}
function walk(node, scope, ind) {
  if (node.nodeType === 3) {
    const txt = node.nodeValue ?? "";
    if (!txt.includes("{{")) {
      if (!txt.trim() && !txt.includes(" ")) return null;
      return `{${JSON.stringify(txt)}}`;
    }
    return txt.split(HOLE).map((p, i) => (i & 1 ? `{dcText(${expr(p, scope)})}` : p ? `{${JSON.stringify(p)}}` : "")).join("");
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  const pad = "  ".repeat(ind);
  if (tag === "sc-helmet") return null; // fonts and globals: ir-quote.css
  if (tag === "sc-if") {
    const kids = walkChildren(node, scope, ind + 1);
    return `{(${attrExpr(node.getAttribute("value") || "", scope)}) ? (<>\n${kids.map(k => pad + "  " + k).join("\n")}\n${pad}</>) : null}`;
  }
  if (tag === "sc-for") {
    const as = node.getAttribute("as") || "item";
    const id = `L_${as}_${(loopN++).toString(36)}`;
    const sub = new Map(scope); sub.set(as, id);
    const kids = walkChildren(node, sub, ind + 2);
    return `{dcList(${attrExpr(node.getAttribute("list") || "", scope)}).map((${id}, ${id}_i) => (\n${pad}  <Fragment key={${id}_i}>\n${kids.map(k => pad + "    " + k).join("\n")}\n${pad}  </Fragment>\n${pad}))}`;
  }
  if (tag === "dc-import") {
    const name = node.getAttribute("name");
    const props = [];
    for (const { name: an, value } of [...node.attributes]) {
      if (["name", "data-dc-tpl"].includes(an) || an.startsWith("hint-")) continue;
      let key = an.startsWith(CAMEL_ATTR) ? kebabToCamel(an.slice(CAMEL_ATTR.length)) : an;
      if (key === "style") { props.push(`hostStyle={dcCss(${interp(value, scope, restyle)})}`); continue; }
      key = kebabToCamel(key);
      const w = whole(value);
      props.push(`${key}={${w ? expr(w[1], scope) : interp(value, scope)}}`);
    }
    return `<C.${name} ${props.join(" ")} />`;
  }
  const real = RAW_UNWRAP[tag] || tag;
  const attrs = [];
  const classes = [];
  let classExpr = null;
  let styleObj = null, styleDyn = null;
  const paint = {};
  for (const { name: an, value } of [...node.attributes]) {
    if (an === "data-dc-tpl" || an.startsWith("hint-")) continue;
    let key = an.startsWith(CAMEL_ATTR) ? kebabToCamel(an.slice(CAMEL_ATTR.length)) : an;
    if (key.startsWith("style-")) {
      if (value.includes("{{")) throw new Error("A pseudo style with a hole: " + value);
      classes.push(pseudoClass(key.slice(6), value));
      continue;
    }
    if (key === "class") { classExpr = whole(value) ? expr(whole(value)[1], scope) : value.includes("{{") ? interp(value, scope) : JSON.stringify(value); continue; }
    if (key === "for") key = "htmlFor";
    else if (key.startsWith("on")) key = EVENT_MAP[key.toLowerCase()] || "on" + key[2].toUpperCase() + key.slice(3);
    else if (key.includes("-") && !key.startsWith("aria-") && !key.startsWith("data-")) key = kebabToCamel(key);
    if (key === "style") {
      if (!value.includes("{{")) styleObj = cssToObj(restyle(value));
      else styleDyn = `dcCss(${interp(value, scope, restyle)})`;
      continue;
    }
    // An SVG's hex stroke / fill: an attribute cannot read a token, so it is drawn as the same property in the style.
    if ((key === "stroke" || key === "fill") && /^#[0-9A-Fa-f]{3,8}$/.test(value)) {
      paint[key] = restyle(value);
      continue;
    }
    const w = whole(value);
    if (w) {
      const x = expr(w[1], scope);
      attrs.push(`${key}={${key === "value" ? `dcValue(${x})` : key === "checked" ? `dcChecked(${x})` : x}}`);
    } else if (value.includes("{{")) attrs.push(`${key}={${interp(value, scope)}}`);
    else attrs.push(`${key}={${JSON.stringify(value)}}`);
  }
  const painted = Object.keys(paint).length > 0;
  if (styleDyn) attrs.push(`style={${painted ? `{ ...${styleDyn}, ...${JSON.stringify(paint)} }` : styleDyn}}`);
  else if (styleObj || painted) attrs.push(`style={${JSON.stringify({ ...(styleObj || {}), ...paint })}}`);
  if (classes.length || classExpr) {
    const parts = [classExpr, classes.length ? JSON.stringify(classes.join(" ")) : null].filter(Boolean);
    attrs.push(`className={${parts.length > 1 ? `[${parts.join(", ")}].filter(Boolean).join(" ")` : parts[0]}}`);
  }
  const kids = walkChildren(node, scope, ind + 1);
  const open = `<${real}${attrs.length ? " " + attrs.join(" ") : ""}`;
  if (!kids.length) return `${open} />`;
  return `${open}>\n${kids.map(k => pad + "  " + k).join("\n")}\n${pad}</${real}>`;
}

// ── run ──
const win = new Window();
const doc = win.document;
mkdirSync(OUT, { recursive: true });
const helmets = [];
for (const [file, name] of FILES) {
  const html = readFileSync(join(SRC, file), "utf8");
  const start = html.indexOf("<x-dc>") + "<x-dc>".length;
  const end = html.indexOf('<script type="text/x-dc"');
  let tplHtml = html.slice(start, end);
  for (const [from, to, count = 1] of PATCHES[file] ?? []) {
    const n = tplHtml.split(from).length - 1;
    if (n !== count) throw new Error(`${file}: a patch's anchor is found ${n} times, not ${count}: ${from.slice(0, 80)}`);
    tplHtml = tplHtml.split(from).join(to);
  }
  const helmet = tplHtml.match(/<helmet>([\s\S]*?)<\/helmet>/);
  if (helmet) helmets.push([file, helmet[1]]);
  const tpl = doc.createElement("template");
  tpl.innerHTML = encodeCase(tplHtml);
  loopN = 0;
  const kids = walkChildren(tpl.content, new Map(), 2);
  const body = `/* eslint-disable */
// @ts-nocheck — generated from the prototype; its values are the prototype logic's renderVals().
// GENERATED by tools/ir-quote/dc-to-tsx.mjs from .design/ir-quote/design_handoff_ir_quote/${file} — do not edit.
import { Fragment } from "react";
import { dcCss, dcList, dcS, dcText, dcValue, dcChecked, type DcVals, type DcComponents } from "../dc";

export function render${name.replace(/Tpl$/, "")}(v: DcVals, C: DcComponents) {
  return (
    <>
${kids.map(k => "      " + k).join("\n")}
    </>
  );
}
`;
  writeFileSync(join(OUT, name + ".tsx"), body);
  console.log("wrote", name, body.length);
}

// The stylesheets. Each screen draws in its own shadow root (IrQuoteScreens › Frame), so — as on the prototype's own
// page — nothing of the app's CSS reaches it: each gets its prototype's own <helmet> globals word for word (html / body
// read as the frame's .irq-root), the colour tokens, the keyframes and the hover / focus rules.
const globalsOf = file => {
  const h = (helmets.find(([f]) => f === file) || [])[1] || "";
  const style = (h.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  return restyle(style)
    .replace(/(^|[}\s])((?:html|body)(?:\s*,\s*(?:html|body))*)\s*\{/g, (m, a) => a + ".irq-root{")
    .trim();
};
colours.set("a3a39c", "--irq-c-a3a39c");
const tokens = [...colours.entries()].sort().map(([h, n]) => `  ${n}: #${h.toUpperCase()};`).join("\n");
const rules = [...pseudo.values()].map(p => {
  const sel = p.kind === "before" || p.kind === "after" ? `.${p.cls}::${p.kind}` : `.${p.cls}:${p.kind}`;
  return `${sel} { ${p.kind === "before" || p.kind === "after" ? p.css : importantify(p.css)} }`;
}).join("\n");
const base = [
  ":host { all: initial; display: block; height: 100%; }",
  `.irq-root {\n${tokens}\n  height: 100%;\n}`,
  ".sc-host { display: block; }",
  "/* The quote header's Quote settings link shows only to those who may edit them (a patch in this script). */",
  '[data-irq-settings="false"] { display: none !important; }',
  "/* iOS Safari zooms the page on a focused control under 16px and leaves it zoomed. globals.css holds this floor for the app, but it cannot reach into a shadow root. */",
  "@media (max-width: 767px) { input:not([type='checkbox']):not([type='radio']):not([type='range']), select, textarea { font-size: 16px !important; } }",
  rules,
].join("\n");
const sheets = {
  QUOTE: [globalsOf("IR Quote v9 Bold.dc.html"), globalsOf("Workspace.dc.html").replace(/\.irq-root\{[^}]*\}/g, "")],
  SETTINGS: [globalsOf("Quote Settings v3 Bold.dc.html")],
  SETTINGS_MOBILE: [globalsOf("Quote Settings Mobile.dc.html")],
};
const out = [
  "// GENERATED by tools/ir-quote/dc-to-tsx.mjs — do not edit: change the prototype or the script.",
  "// Each IR Quote screen's stylesheet, put into its shadow root: the shared base (tokens, hover / focus rules), then that",
  "// prototype's own page globals.",
  `const BASE = ${JSON.stringify(base)};`,
  ...Object.entries(sheets).map(([k, parts]) => `export const IRQ_CSS_${k} = BASE + ${JSON.stringify("\n" + parts.join("\n"))};`),
  "",
].join("\n");
writeFileSync(CSS_OUT, out);
console.log("colours", colours.size, "pseudo", pseudo.size);
