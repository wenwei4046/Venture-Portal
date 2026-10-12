// Converts a Claude Design (.dc.html) template fragment into JSX with the exact inline styles.
// Usage: node dc2jsx.cjs <file> <fromLine> <toLine> [name]  → prints JSX for the sibling nodes in that range.
// Top-level bindings become v.<name>; loop variables (sc-for as="x") stay bare.
const fs = require("fs");

const VOID = new Set(["input", "br", "img", "hr", "meta", "link"]);
const hoverClasses = new Map(); // style-hover text → class key

function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i); i = e + 3; continue; }
    if (src[i] === "<") {
      const close = src[i + 1] === "/";
      let j = i + (close ? 2 : 1), name = "";
      while (/[A-Za-z0-9_-]/.test(src[j])) name += src[j++];
      if (close) { const e = src.indexOf(">", j); out.push({ t: "close", name: name.toLowerCase() }); i = e + 1; continue; }
      const attrs = []; let self = false;
      while (j < src.length) {
        while (/\s/.test(src[j])) j++;
        if (src[j] === ">") { j++; break; }
        if (src[j] === "/" && src[j + 1] === ">") { self = true; j += 2; break; }
        let an = ""; while (j < src.length && !/[\s=>]/.test(src[j]) && !(src[j] === "/" && src[j + 1] === ">")) an += src[j++];
        while (/\s/.test(src[j])) j++;
        let av = null;
        if (src[j] === "=") { j++; while (/\s/.test(src[j])) j++; const q = src[j]; if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); av = src.slice(j + 1, e); j = e + 1; } else { let s = ""; while (!/[\s>]/.test(src[j])) s += src[j++]; av = s; } }
        if (an) attrs.push([an, av]);
      }
      out.push({ t: "open", name: name.toLowerCase(), attrs, self: self || VOID.has(name.toLowerCase()) });
      i = j; continue;
    }
    const e = src.indexOf("<", i); const txt = src.slice(i, e < 0 ? src.length : e);
    out.push({ t: "text", v: txt }); i = e < 0 ? src.length : e;
  }
  return out;
}

function tree(tokens) {
  const root = { name: "#root", kids: [] }, stack = [root];
  for (const tk of tokens) {
    const top = stack[stack.length - 1];
    if (tk.t === "text") top.kids.push({ text: tk.v });
    else if (tk.t === "open") { const n = { name: tk.name, attrs: tk.attrs, kids: [] }; top.kids.push(n); if (!tk.self) stack.push(n); }
    else {
      // close: pop to the matching name (tolerate stray closes like </input>)
      if (VOID.has(tk.name)) continue;
      let k = stack.length - 1; while (k > 0 && stack[k].name !== tk.name) k--;
      if (k > 0) stack.length = k; // pop through
    }
  }
  return root;
}

const camel = p => p.trim().replace(/^-webkit-/, "Webkit-").replace(/^-ms-/, "ms-").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function expr(e, scope) {
  e = e.trim();
  if (/^v(\.|$)/.test(e) && scope.has("v")) return "vi" + e.slice(1); // a loop variable named v (renamed: v is the props)
  if (e === "true" || e === "false") return e;
  const root = e.match(/^[A-Za-z_$][\w$]*/)?.[0];
  if (root && !scope.has(root)) return "v." + e;
  return e;
}
function interp(s, scope) { // "a {{ x }} b" → `a ${v.x} b` or expression when whole
  const m = s.match(/^\s*\{\{([^}]+)\}\}\s*$/);
  if (m) return { code: expr(m[1], scope), whole: true };
  if (!s.includes("{{")) return { code: JSON.stringify(s), whole: false, lit: true };
  const t = s.replace(/`/g, "\\`").replace(/\{\{([^}]+)\}\}/g, (_, x) => "${" + expr(x, scope) + "}");
  return { code: "`" + t + "`", whole: false };
}

function styleObj(s, scope) {
  const decls = []; let depth = 0, cur = "";
  for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === ";" && depth === 0) { decls.push(cur); cur = ""; } else cur += ch; }
  if (cur.trim()) decls.push(cur);
  const map = new Map();
  for (const d of decls) {
    const k = d.indexOf(":"); if (k < 0) continue;
    const prop = camel(d.slice(0, k)), val = d.slice(k + 1).trim();
    if (!prop) continue;
    map.delete(prop); map.set(prop, interp(val, scope).code); // last wins, keeps order of the winner
  }
  return "{ " + [...map].map(([p, c]) => `${/^[A-Za-z_$][\w$]*$/.test(p) ? p : JSON.stringify(p)}: ${c}`).join(", ") + " }";
}

const ATTR = { "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin", "fill-rule": "fillRule", "clip-rule": "clipRule", inputmode: "inputMode", autofocus: "autoFocus", readonly: "readOnly", viewbox: "viewBox", "stroke-dasharray": "strokeDasharray", class: "className", for: "htmlFor", tabindex: "tabIndex", maxlength: "maxLength" };
const NUMERIC = new Set(["rows", "cols", "tabIndex", "maxLength"]);

/** auto: the CSS-module import name generated hover / focus classes are read from (null = the fixed crm.module.css list). */
const opts = { auto: null };
const autoHover = new Map(), autoFocus = new Map();
/** The generated classes as CSS (each declaration !important: the element's own inline style would win otherwise). */
function autoCss() {
  const decl = (s, k) => { let j = 0; return s.replace(/\{\{\}\}/g, () => `var(--${k}-${j++})`).split(";").map(d => d.trim()).filter(Boolean).map(d => `${d} !important;`).join(" "); };
  return [...[...autoHover].map(([s, k]) => `.${k}:hover { ${decl(s, k)} }`), ...[...autoFocus].map(([s, k]) => `.${k}:focus { ${decl(s, k)} }`)].join("\n") + "\n";
}

function attrs(n, scope) {
  const out = []; let hover = null, focus = null;
  for (const [a0, val] of n.attrs) {
    if (a0.startsWith("hint-placeholder")) continue;
    if (a0 === "style-hover") { hover = val; continue; }
    if (a0 === "style-focus") { focus = val; continue; }
    const a = ATTR[a0] || ATTR[a0.toLowerCase()] || a0;
    if (val == null) { out.push(a); continue; }
    // A whole style object bound at once (style="{{ paneStyle }}") goes through as it is.
    if (a === "style") { const w = val.match(/^\s*\{\{([^}]+)\}\}\s*$/); out.push(w ? `style={${expr(w[1], scope)}}` : `style={${styleObj(val, scope)}}`); continue; }
    const r = interp(val, scope);
    if (/^on[A-Z]/.test(a)) { out.push(`${a}={${r.whole ? r.code : "undefined"}}`); continue; }
    if (a === "autoFocus") { out.push(r.whole ? `autoFocus={${r.code}}` : "autoFocus"); continue; }
    if (NUMERIC.has(a) && r.lit && /^\d+$/.test(val)) { out.push(`${a}={${val}}`); continue; }
    out.push(r.lit ? `${a}=${JSON.stringify(val)}` : `${a}={${r.code}}`);
  }
  if (opts.auto && (hover || focus)) {
    // Generated classes (CRM desktop, 2026-10-13): each distinct style-hover / style-focus becomes a class of the
    // generator's own stylesheet, so a new hover in the design needs no hand-made class. A bound value ({{ t.tint }})
    // becomes a custom property the class reads and the element sets in its own style.
    const names = [], vars = [];
    const cls = (map, s, p) => {
      const tpl = s.replace(/\{\{([^}]+)\}\}/g, "{{}}");
      if (!map.has(tpl)) map.set(tpl, `${p}${map.size + 1}`);
      const k = map.get(tpl); let j = 0;
      s.replace(/\{\{([^}]+)\}\}/g, (_, x) => { vars.push([`--${k}-${j++}`, expr(x, scope)]); return ""; });
      names.push(k);
    };
    if (hover) cls(autoHover, hover, "h");
    if (focus) cls(autoFocus, focus, "f");
    out.push(`className={${names.map(n => `${opts.auto}.${n}`).join(' + " " + ')}}`);
    if (vars.length) {
      const extra = vars.map(([k, e]) => `${JSON.stringify(k)}: ${e}`).join(", ");
      const si = out.findIndex(x => x.startsWith("style={"));
      if (si >= 0) out[si] = out[si].replace(/ \}\}$/, `, ${extra} } as React.CSSProperties}`).replace(/^style=\{\{ /, "style={{ ");
      else out.push(`style={{ ${extra} } as React.CSSProperties}`);
    }
    return out.length ? " " + out.join(" ") : "";
  }
  if (hover) {
    // The design's hover styles, by fixed name (crm.module.css has each).
    const HOVER = { "background: #FBF7F3;": "hov1", "background: #FBF4EE;": "hov2", "background: #FFF8F2;": "hov3", "border-color: #387557;": "hov4", "background: #F5EEE9;": "hov5", "color: rgb(150 58 20);": "hov6", "background: #F5EBE3;": "hov7", "background: #963A14;": "hov8", "background: #EEF3F9;": "hov9", "border-color: #B9CCE3;": "hov10", "border-color: #D9C7BA;": "hov11", "border-color: #E9BFA0;": "hov12" };
    const k = HOVER[hover.trim()];
    if (!k) throw new Error("A hover style crm.module.css does not have: " + hover);
    hoverClasses.set(hover, k);
    out.push(`className={H.${k}}`);
  }
  return out.length ? " " + out.join(" ") : "";
}

function textJsx(t, scope) {
  if (!t.includes("{{")) return t.replace(/[{}<>]/g, c => `{"${c}"}`);
  return t.replace(/[{}<>]/g, c => (c === "{" || c === "}") ? c : `{"${c}"}`).replace(/\{\{([^}]+)\}\}/g, (_, x) => "{" + expr(x, scope) + "}");
}

function emit(n, scope, ind) {
  if (n.text != null) { const t = n.text; if (!t.trim()) return t.includes("\n") ? "" : t; return textJsx(t.replace(/\s*\n\s*/g, " "), scope); }
  const pad = "  ".repeat(ind);
  if (n.name === "sc-if") {
    const v = n.attrs.find(a => a[0] === "value")[1];
    const cond = interp(v, scope).code;
    return `{!!(${cond}) && (<>${kids(n, scope, ind + 1)}</>)}`;
  }
  if (n.name === "sc-for") {
    const list = interp(n.attrs.find(a => a[0] === "list")[1], scope).code;
    const as = n.attrs.find(a => a[0] === "as")[1];
    const s2 = new Set(scope); s2.add(as);
    const nm = as === "v" ? "vi" : as;
    return `{(${list}).map((${nm}, ${nm}_i) => (<Fragment key={${nm}_i}>${kids(n, s2, ind + 1)}</Fragment>))}`;
  }
  if (n.name === "dc-import" || n.name === "helmet") return "";
  const tag = n.name;
  if (VOID.has(tag)) return `<${tag}${attrs(n, scope)} />`;
  return `<${tag}${attrs(n, scope)}>${kids(n, scope, ind + 1)}</${tag}>`;
}
function kids(n, scope, ind) {
  const allWs = n.kids.every(k => k.text != null ? !k.text.trim() : true);
  const parts = n.kids.map(k => emit(k, scope, ind)).filter(x => x !== "");
  if (allWs) return parts.map(p => "\n" + "  ".repeat(ind) + p).join("") + "\n" + "  ".repeat(Math.max(0, ind - 1));
  return parts.join("");
}

function convert(src, scopeVars = []) {
  const root = tree(tokenize(src));
  return kids(root, new Set(scopeVars), 2);
}

if (require.main === module) {
  const [file, a, b] = process.argv.slice(2);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(+a - 1, +b);
  process.stdout.write(convert(lines.join("\n")));
  process.stderr.write("\nHOVER " + JSON.stringify([...hoverClasses]) + "\n");
}
module.exports = { convert, hoverClasses, opts, autoCss };
