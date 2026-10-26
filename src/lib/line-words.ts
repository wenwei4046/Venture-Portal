// What a journal line says in the drill-downs (2026-10-26, the mockup's fifth round — the user: "左边改成显示单据上真正写的说明",
// "先名字再到 description"): the line's own words when they say something; else its document's — the voucher's purpose,
// for a claim of several items the item that carries this line's amount (all of them when none does), the invoice's
// first line, the receipt's "Settle invoice HV-INV-… — Carres"; a line from before the system says what its entry said
// ("PV-000042 — EHJ1 PROPERTY …" gives the old number and who). Never the system's own "expense - KHO WEI JIE
// (dept_pool_marketing)". Who it was with stands apart (`party`), the drill-downs put it first.

/** The system's own wording, which says nothing about the line. */
const GENERIC =
  /^(expense - .+ \(([a-z_]+|\d{4})\)\s*$|AR — invoice\b|AR cleared — |Payment received —|Service billing revenue recognised|Inter-billing\b|Reclass \d{4}-\d{2}-\d{2})/i
/** An entry from before the system: "PV-000020 — KHO WEI JIE", "JV-000011 [marketing] — SALARY - MAR'26". */
const OLD = /^((?:PV|JV|I|OR)-\d+)(?:\s*\[[^\]]*\])?\s*—\s*(.+)$/

/** A text's lines, its [pool] tags gone. */
const linesOf = (s: string): string[] =>
  s
    .replace(/\s*\[[a-z_]+\]/gi, '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Whether a line of a claim names this amount ("Claude - RM 409.83", "RM99.90", "Canva - RM 250"). */
export function namesAmount(text: string, amount: number): boolean {
  const a = Math.abs(amount)
  if (a < 0.005) return false
  const forms = new Set([a.toFixed(2)])
  if (Number.isInteger(a)) forms.add(String(a))
  if (a.toFixed(2).endsWith('0')) forms.add(a.toFixed(1))
  const flat = text.replace(/,/g, '')
  return [...forms].some((f) => new RegExp(`(^|[^\\d.])${f.replace('.', '\\.')}(?!\\d)`).test(flat))
}

export interface LineSays {
  description: string | null
  entry_description: string | null
  entry_no: string | null
  /** The source document's own words (the invoice's, the voucher's, the credit note's), as written. */
  doc_text?: string | null
  /** The source document's number. */
  ref_no?: string | null
  party?: string | null
  debit: number
  credit: number
}

export interface LineWords {
  /** What the line was. */
  text: string
  /** Who it was with, or null. */
  party: string | null
  /** The entry's number — a pre-system entry's old one when it has no other. */
  entryNo: string | null
}

export function lineWords(l: LineSays): LineWords {
  const own = l.description?.trim() ? l.description : null
  const old = l.entry_description ? OLD.exec(l.entry_description.trim()) : null
  let text: string
  if (own && !GENERIC.test(own.trim())) text = linesOf(own)[0] ?? ''
  else if (l.doc_text?.trim()) {
    const ls = linesOf(l.doc_text)
    // A claim of several items: the item that carries this line's amount, else (a payment) them all; else its first line.
    const hit = ls.length > 1 ? ls.find((x) => /[a-z]{2}/i.test(x.replace(/rm/gi, '')) && namesAmount(x, l.debit || l.credit)) : undefined
    text = hit ?? (ls.length > 1 && /-PV-/.test(l.ref_no ?? '') ? ls.join(' · ') : (ls[0] ?? ''))
  } else if (old) text = old[2]
  else text = linesOf((l.entry_description ?? '').replace(/^(PV|OR) [A-Z0-9-]+: /, ''))[0] ?? (own ? (linesOf(own)[0] ?? '') : '')
  // Before the system a payment or receipt named who in its entry ("PV-000042 — EHJ1 PROPERTY …"), never the bank.
  const oldParty = old && /^(PV|OR)-/.test(old[1]) && !/^bank\b/i.test(old[2]) && old[2] !== text ? old[2] : null
  const party = l.party?.trim() ? l.party.trim() : oldParty
  // Who is said once: "Salary - Sep'26 · Marketing · 3 vouchers" with Marketing as the party loses its " · Marketing".
  if (party) {
    const parts = text.split(' · ')
    if (parts.length > 1 && parts.includes(party)) text = parts.filter((p) => p !== party).join(' · ')
  }
  return { text, party, entryNo: l.entry_no ?? (old ? old[1] : null) }
}
