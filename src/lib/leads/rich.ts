// Lead View › bold and italic words (2026-10-29 — the user, on Reply templates: "能写粗体，斜体字眼"). Messenger reads
// *words* as bold and _words_ as italic, so a message carries the marks as written; Lead View draws them the same way.
// Pure, tested in rich.test.ts.

export interface RichPiece { text: string; bold?: boolean; italic?: boolean }

// A mark opens after a non-word character (or the start) and closes before one (or the end), hugging its words — so a
// link's snake_case or a sum like 2*3*4 is left as it is.
const MARKS = /(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_/])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/gu

/** A message's words in pieces: plain, bold (*…*) or italic (_…_). */
export function richPieces(text: string): RichPiece[] {
  const out: RichPiece[] = []
  let at = 0
  for (const m of text.matchAll(MARKS)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: text.slice(at, i) })
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], italic: true })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** Bold or italic around the selection (or an empty pair at the cursor); the cursor after the marked words. */
export function wrapMark(text: string, start: number, end: number, mark: '*' | '_'): { text: string; caret: number } {
  const a = Math.max(0, Math.min(start, end)), b = Math.min(text.length, Math.max(start, end))
  const picked = text.slice(a, b)
  // Spaces stay outside the marks — Messenger needs the marks to hug the words.
  const lead = picked.length - picked.trimStart().length, tail = picked.length - picked.trimEnd().length
  const core = picked.trim()
  const next = text.slice(0, a) + picked.slice(0, lead) + mark + core + mark + picked.slice(picked.length - tail) + text.slice(b)
  return { text: next, caret: core ? a + lead + core.length + 2 : a + 1 }
}
