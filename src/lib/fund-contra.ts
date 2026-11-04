// Fund contra (2026-11-04, mig 20261104230000): a Fund OUT loan and a Fund IN deposit knocked off against each other,
// no bank — one to many, many to one, many to many; each line its principal and / or interest; the two sides equal;
// the Principal approves it. What the dialog sends and checks, worked out here so the dialog and its test read one rule.
// The database checks it all again (file_fund_contra) — this is the reader's early answer, not the guard.

export type ContraSide = 'loan' | 'source'

/** A deal the dialog offers: its words and what it owes in principal. */
export interface ContraDeal {
  id: string
  label: string
  /** Principal still owed on it. */
  outstanding: number
}

/** A contra still waiting for the Principal (2026-11-05): withdrawn by whoever filed it, or the Principal. */
export interface ContraWaiting {
  id: string
  /** The approval's words: each deal with its P / I, the total. */
  words: string
  date: string
  filedBy: string
  canWithdraw: boolean
}

export interface ContraOptions {
  loans: ContraDeal[]
  sources: ContraDeal[]
  waiting: ContraWaiting[]
}

/** A line as typed: the deal picked and two amounts as text. */
export interface ContraLineDraft {
  key: string
  id: string
  principal: string
  interest: string
}

export interface ContraLine {
  side: ContraSide
  id: string
  principal: number
  interest: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const amount = (s: string) => {
  const n = Number(String(s).replace(/,/g, '').trim() || '0')
  return Number.isFinite(n) ? r2(n) : NaN
}

/** One side's lines as numbers, blank lines dropped. */
export function contraLines(side: ContraSide, drafts: ContraLineDraft[]): ContraLine[] {
  return drafts
    .filter((d) => d.id || d.principal.trim() || d.interest.trim())
    .map((d) => ({ side, id: d.id, principal: amount(d.principal), interest: amount(d.interest) }))
}

export const sideTotal = (lines: ContraLine[]) => r2(lines.reduce((s, l) => s + (l.principal || 0) + (l.interest || 0), 0))

/**
 * What still stops the contra, in words — the first one only, the dialog's foot — or null when it may be sent.
 * `deals` names each deal and what it owes, so an over-large principal says whose.
 */
export function contraProblem(input: {
  date: string
  today: string
  loans: ContraLine[]
  sources: ContraLine[]
  deals: Map<string, ContraDeal>
}): string | null {
  const { date, today, loans, sources, deals } = input
  if (!date) return 'Pick the contra’s date'
  if (date > today) return 'The date cannot be in the future'
  if (loans.length === 0) return 'Add at least one Fund OUT loan'
  if (sources.length === 0) return 'Add at least one Fund IN fund source'
  for (const l of [...loans, ...sources]) {
    if (!l.id) return `Pick the ${l.side === 'loan' ? 'loan' : 'fund source'} on every line`
    if (Number.isNaN(l.principal) || Number.isNaN(l.interest)) return 'An amount is not a number'
    if (l.principal < 0 || l.interest < 0) return 'Amounts cannot be negative'
    if (l.principal + l.interest <= 0) return `${deals.get(l.id)?.label ?? 'A line'} needs a principal or an interest amount`
  }
  for (const side of [loans, sources]) {
    const seen = new Set<string>()
    for (const l of side) {
      if (seen.has(l.id)) return `${deals.get(l.id)?.label ?? 'A deal'} is in the contra twice`
      seen.add(l.id)
    }
  }
  for (const l of [...loans, ...sources]) {
    const d = deals.get(l.id)
    if (d && l.principal > d.outstanding + 0.005) return `${d.label} owes RM ${money(d.outstanding)} in principal`
  }
  const a = sideTotal(loans)
  const b = sideTotal(sources)
  if (Math.abs(a - b) >= 0.005) return `The two sides must be equal — Fund OUT RM ${money(a)}, Fund IN RM ${money(b)}`
  return null
}

export const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
