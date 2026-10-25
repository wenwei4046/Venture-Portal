// Marketing's billing as Finance's Invoice hub reads it (2026-10-26, Marketing ②b-2h — the user's "A": the lines
// Marketing's manager confirmed are what Marketing is invoiced by, imported with one click). `mkt_bill_import_preview`
// says the month's confirmed lines — each with the party it bills (a group company, or an outside client by Marketing's
// billing name), its words, amount, the revenue account its product posts to, and the invoice it is on (none, or a
// voided one: to import) — and the month's Marketing invoices typed by hand, so the same work is not billed twice. The
// card, its list, the Create invoice ▾ entry and the import window all say what this says. Pure.

export interface MktLine {
  bill: string
  project: string
  track: string
  title: string
  /** "Post pack - Oct'26" — the line's words on the invoice. */
  words: string
  amount: number
  sub: { id: string; code: string; name: string }
  /** Who it bills: a group company (its company's id) or an outside client (its own). */
  party: { kind: 'subsidiary' | 'client'; id: string; name: string; code: string | null }
  /** The revenue account its product posts to, while Finance's chart offers it. */
  account: { code: string; name: string } | null
  /** The invoice it is on, not voided — none: to import. */
  invoice: { id: string; no: string | null; status: string } | null
}

/** A Marketing invoice of the month typed by hand (no line of Marketing's on it). */
export interface MktTyped {
  id: string
  no: string | null
  status: string
  total: number
  party: string
  code: string | null
  /** Its first line. */
  words: string
}

export interface MarketingLines {
  /** `YYYY-MM-01`. */
  month: string
  /** The month is closed (period_locks). */
  locked: boolean
  lines: MktLine[]
  typed: MktTyped[]
}

/** A party's lines, as the import window shows them: one draft a party. */
export interface MktParty {
  key: string
  kind: 'subsidiary' | 'client'
  /** "Carres (CAR)"; an outside client by its billing name. */
  name: string
  lines: MktLine[]
  total: number
  /** Its lines on no invoice yet, and what they come to. */
  toImport: number
  toImportAmount: number
  /** The invoices its other lines are on. */
  invoices: Array<{ id: string; no: string | null; status: string }>
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? r2(n) : 0
}
const MONTH = /^\d{4}-\d{2}-01/

export const NO_MARKETING = (month: string): MarketingLines => ({ month, locked: false, lines: [], typed: [] })

/** mkt_bill_import_preview(month), or null when it is not one. */
export function marketingLinesFromRow(raw: unknown): MarketingLines | null {
  if (!isObj(raw) || !MONTH.test(str(raw.month))) return null
  const lines: MktLine[] = (Array.isArray(raw.lines) ? raw.lines.filter(isObj) : []).map((l) => {
    const sub = isObj(l.sub) ? l.sub : {}
    const party = isObj(l.party) ? l.party : {}
    const account = isObj(l.account) && str(l.account.code) ? { code: str(l.account.code), name: str(l.account.name) } : null
    const inv = isObj(l.invoice) && str(l.invoice.id) ? { id: str(l.invoice.id), no: strOrNull(l.invoice.no), status: str(l.invoice.status) || 'draft' } : null
    return {
      bill: str(l.bill),
      project: str(l.project),
      track: str(l.track),
      title: str(l.title),
      words: str(l.words),
      amount: num(l.amount),
      sub: { id: str(sub.id), code: str(sub.code), name: str(sub.name) },
      party: { kind: party.kind === 'client' ? 'client' : 'subsidiary', id: str(party.id), name: str(party.name) || str(sub.name), code: strOrNull(party.code) },
      account,
      invoice: inv,
    }
  })
  const typed: MktTyped[] = (Array.isArray(raw.typed) ? raw.typed.filter(isObj) : []).map((t) => ({
    id: str(t.id),
    no: strOrNull(t.no),
    status: str(t.status) || 'draft',
    total: num(t.total),
    party: str(t.party),
    code: strOrNull(t.code),
    words: str(t.words).split(/\r?\n/)[0].trim(),
  }))
  return { month: str(raw.month).slice(0, 10), locked: raw.locked === true, lines, typed }
}

const partyName = (l: MktLine) => (l.party.kind === 'subsidiary' && l.party.code ? `${l.party.name} (${l.party.code})` : l.party.name)

/** The lines by party, in the order the import numbers their drafts. */
export function mktParties(m: Pick<MarketingLines, 'lines'>): MktParty[] {
  const by = new Map<string, MktParty>()
  for (const l of m.lines) {
    const key = `${l.party.kind}:${l.party.id}`
    const p = by.get(key) ?? { key, kind: l.party.kind, name: partyName(l), lines: [], total: 0, toImport: 0, toImportAmount: 0, invoices: [] }
    p.lines.push(l)
    p.total = r2(p.total + l.amount)
    if (l.invoice) {
      if (!p.invoices.some((i) => i.id === l.invoice!.id)) p.invoices.push(l.invoice)
    } else {
      p.toImport++
      p.toImportAmount = r2(p.toImportAmount + l.amount)
    }
    by.set(key, p)
  }
  return [...by.values()]
}

/** The month's figures: every confirmed line, those to import, those imported. */
export function mktSummary(m: Pick<MarketingLines, 'lines'>): { lines: number; amount: number; toImport: number; toImportAmount: number; imported: number } {
  const open = m.lines.filter((l) => !l.invoice)
  return {
    lines: m.lines.length,
    amount: r2(m.lines.reduce((s, l) => s + l.amount, 0)),
    toImport: open.length,
    toImportAmount: r2(open.reduce((s, l) => s + l.amount, 0)),
    imported: m.lines.length - open.length,
  }
}

/** mkt_bill_import(month)'s answer: drafts made, drafts added to, lines put on them, and the drafts' numbers. */
export function importResultOf(raw: unknown): { made: number; added: number; lines: number; invoices: string[] } {
  const r = isObj(raw) ? raw : {}
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0)
  return {
    made: count(r.made),
    added: count(r.added),
    lines: count(r.lines),
    invoices: (Array.isArray(r.invoices) ? r.invoices.filter(isObj) : []).map((i) => str(i.no)).filter(Boolean),
  }
}

/** What an import did, in words: "2 drafts made · 1 added to · 5 lines" — or that nothing was left to import. */
export function importWords(r: { made: number; added: number; lines: number }): string {
  if (r.lines === 0) return 'Nothing new to import — every confirmed line is on an invoice'
  const parts = [r.made ? `${r.made} draft${r.made === 1 ? '' : 's'} made` : '', r.added ? `${r.added} draft${r.added === 1 ? '' : 's'} added to` : ''].filter(Boolean)
  return `Marketing billing imported · ${[...parts, `${r.lines} line${r.lines === 1 ? '' : 's'}`].join(' · ')}`
}

/** A line's state in words: "On HV-INV-202610-0004 · draft", or "To import". */
export const mktLineState = (l: MktLine) => (l.invoice ? `On ${l.invoice.no ?? 'a draft'} · ${l.invoice.status === 'paid_via_netting' ? 'paid via netting' : l.invoice.status}` : 'To import')
