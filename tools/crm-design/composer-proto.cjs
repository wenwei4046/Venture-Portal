// The chat composer handoff (docs/design/chat-composer, 2026-10-14 — the owner's Claude Design "Typing bar UI mobile chat
// design"): its prototype's nodes, taken VERBATIM by a marker at their start and balanced on their tag — the composer stack
// (gen-composer.cjs → sales/SalesComposer.tsx) and the chat's header and message list (chat-composer-patches.cjs → the
// generated SalesChat).
const fs = require("fs"), path = require("path");
const repo = path.resolve(__dirname, "../..");
const FILE = path.join(repo, "docs/design/chat-composer/prototypes/Chat Composer.dc.html");

function template() {
  const s = fs.readFileSync(FILE, "utf8").replace(/\r/g, "");
  const a = s.indexOf("</helmet>"), b = s.indexOf("</x-dc>");
  if (a < 0 || b < 0) throw new Error("Chat Composer.dc.html: the template's <helmet> / </x-dc> moved");
  return s.slice(a + "</helmet>".length, b);
}

/** The whole element that starts with `start` (an opening tag's beginning), balanced on `tag` — the only one, unless `first`. */
function balanced(s, start, tag, what, first = false) {
  const at = s.indexOf(start);
  if (at < 0) throw new Error(`${what}: no ${start.slice(0, 70)}`);
  if (!first && s.indexOf(start, at + 1) >= 0) throw new Error(`${what}: more than one ${start.slice(0, 70)}`);
  const re = new RegExp("<(/?)" + tag + "(?=[\\s>])", "g"); re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(s))) { depth += m[1] ? -1 : 1; if (!depth) return s.slice(at, s.indexOf(">", m.index) + 1); }
  throw new Error(`${what}: unbalanced ${start.slice(0, 70)}`);
}

/** `html` without the `count` elements that start with `start` (each balanced on `tag`) — what the app leaves out. */
function drop(html, start, tag, count, why) {
  if (!why) throw new Error(`a dropped node needs its reason: ${start}`);
  const n = html.split(start).length - 1;
  if (n !== count) throw new Error(`drop: ${start.slice(0, 70)} found ${n} times, expected ${count}`);
  // A void element (an <input>) ends at its own ">".
  const one = s => (tag === "input" ? s.slice(s.indexOf(start), s.indexOf(">", s.indexOf(start)) + 1) : balanced(s, start, tag, "drop", true));
  for (let k = 0; k < count; k++) html = html.replace(one(html), "");
  return html;
}

const STACK = '<div style="position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;flex-direction:column">';
const TOAST = '<sc-if value="{{ p.toast }}">';
const HEADER = '<div style="position:absolute;left:0;right:0;top:0;z-index:3;background:rgba(255,255,255,.96);border-bottom:1px solid rgb(235 221 210)">';
const LIST = '<div onClick="{{ p.dismiss }}" style="position:absolute;inset:0;';

module.exports = {
  FILE, balanced, drop,
  stack: () => balanced(template(), STACK, "div", "composer stack"),
  toast: () => balanced(template(), TOAST, "sc-if", "toast"),
  header: () => balanced(template(), HEADER, "div", "header"),
  /** The message list's opening tag (its children are the app's own messages). */
  listTag: () => { const s = template(), at = s.indexOf(LIST); if (at < 0) throw new Error("no message list"); return s.slice(at, s.indexOf(">", at) + 1); },
};
