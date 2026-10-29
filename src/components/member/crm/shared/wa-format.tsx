import { Fragment, type ReactNode } from "react";

/**
 * WhatsApp's own formatting in a reply (the owner, 2026-10-29: "Reply library 要能粗体，斜线"): *bold* and _italic_, as
 * WhatsApp writes them, so the customer's WhatsApp shows them as typed. Messenger has no formatting, so the marks are
 * taken off before a Messenger send (`plainWa`). An unclosed mark stays as it is.
 */
const RUN = /(\*[^*\n]+\*|_[^_\n]+_)/g;

/** A text with *bold* and _italic_ drawn (bold inside italic and the other way round, one level each). */
export function waRuns(text: string): ReactNode {
  return text.split(RUN).filter(Boolean).map((p, i) => {
    if (/^\*[^*\n]+\*$/.test(p)) return <b key={i}>{italics(p.slice(1, -1))}</b>;
    if (/^_[^_\n]+_$/.test(p)) return <i key={i}>{bolds(p.slice(1, -1))}</i>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
const italics = (t: string): ReactNode => t.split(/(_[^_\n]+_)/g).filter(Boolean).map((p, i) => (/^_[^_\n]+_$/.test(p) ? <i key={i}>{p.slice(1, -1)}</i> : <Fragment key={i}>{p}</Fragment>));
const bolds = (t: string): ReactNode => t.split(/(\*[^*\n]+\*)/g).filter(Boolean).map((p, i) => (/^\*[^*\n]+\*$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b> : <Fragment key={i}>{p}</Fragment>));

/** The text without its marks (Messenger, and anywhere formatting cannot show). */
export { plainWa } from "@/lib/member/wa-text";

/** B / I: the words picked wrapped in the mark (or the mark taken off again); with nothing picked, a pair at the caret. */
export function wrapMark(value: string, start: number, end: number, mark: "*" | "_"): { value: string; start: number; end: number } {
  const a = Math.max(0, Math.min(start, value.length)), b = Math.max(a, Math.min(end, value.length));
  // WhatsApp needs the mark tight against the words: leave a picked word's spaces outside it.
  let s = a, e = b;
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;
  const picked = value.slice(s, e);
  if (value.slice(s - 1, s) === mark && value.slice(e, e + 1) === mark) return { value: value.slice(0, s - 1) + picked + value.slice(e + 1), start: s - 1, end: e - 1 };
  return { value: `${value.slice(0, s)}${mark}${picked}${mark}${value.slice(e)}`, start: s + 1, end: e + 1 };
}
