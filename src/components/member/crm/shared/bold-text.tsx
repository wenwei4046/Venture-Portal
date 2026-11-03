import { Fragment, type ReactNode } from "react";

/**
 * Remarks with bold words (the owner, 2026-10-29: "remarks 可以加粗体字"): **like this** is drawn bold, everything else as
 * typed. Only bold — no other markup — and an unclosed ** stays as it is.
 */
export function boldRuns(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*\n]+?\*\*)/g);
  return parts.map((p, i) => (/^\*\*[^*\n]+?\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

/** The B button: the words picked in a box wrapped in ** (or ** ** put at the caret, the caret between). */
export function wrapBold(value: string, start: number, end: number): { value: string; start: number; end: number } {
  const a = Math.max(0, Math.min(start, value.length)), b = Math.max(a, Math.min(end, value.length));
  const picked = value.slice(a, b);
  // Already bold: take the ** off again.
  if (value.slice(Math.max(0, a - 2), a) === "**" && value.slice(b, b + 2) === "**") {
    return { value: value.slice(0, a - 2) + picked + value.slice(b + 2), start: a - 2, end: b - 2 };
  }
  return { value: `${value.slice(0, a)}**${picked}**${value.slice(b)}`, start: a + 2, end: b + 2 };
}
