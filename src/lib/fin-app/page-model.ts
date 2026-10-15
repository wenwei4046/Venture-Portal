// A Finance page the phone app draws as a hub of its own (2026-10-15, part 5 —
// the pages the design does not draw, in its style): the page's headline
// centred, its state in a word, a stacked card per part, a card's groups of
// lines — a line opening a record in the app, or a screen of its own lines (a
// General Ledger account's entries). The page's server half reads what its
// desktop page reads and fills this; `PageApp` draws it. Types and the few
// words every page writes the same way.

import type { HubCardItem } from '@/components/finv/Hub'

export type LineTone = 'ledger' | 'out' | 'alert' | 'muted' | null

export interface PageLine {
  key: string
  label: string
  sub?: string
  value?: string
  tone?: LineTone
  /** Its state as the design's item lists chip it. */
  chip?: { text: string; tone: 'def' | 'wait' | 'accent' | 'ledger' | 'info' | 'danger' | 'alert' } | null
  /** A record of its own: in the app (a voucher, a deal, an invoice), or a page. */
  open?: { href: string; label?: string } | null
  /** A screen of its own lines, opened by pressing the line (an account's entries). */
  detail?: { title: string; groups: PageGroup[] } | null
}

export interface PageGroup {
  key: string
  title: string
  count: string
  lines: PageLine[]
  empty?: string
}

export interface PageCard extends HubCardItem {
  groups: PageGroup[]
}

export interface PageModel {
  hero: { value: string; label: string }
  /** The page's state in a word (*Debits = credits*, *Does not reconcile*). */
  chip: string | { text: string; tone: 'def' | 'wait' | 'accent' | 'ledger' | 'info' | 'danger' | 'alert' } | null
  /** A card's list's eyebrow — "Trial Balance · as at 15 Oct 2026". */
  eyebrow: string
  cards: PageCard[]
}

/** What the server half hands with the model: where the page is, what is on show, where else it can go. */
export interface PagePlace {
  /** `/fin-app/page/tb`. */
  href: string
  title: string
  /** The sidebar section's numeral for a list's eyebrow (III. for Report). */
  roman: string
  /** The query naming what is on show — a period, a segment — kept as the reader steps into a list. */
  keep: string
  /** The period between its arrows: its label and the `keep` of the one before and after (null: none). */
  period?: { label: string; prev: string | null; next: string | null; unit?: 'month' | 'day' } | null
  /** The segments, each with its own `keep`. */
  segments?: Array<{ value: string; label: string; keep: string }> | null
  segment?: string
}

export const r2 = (n: number) => Math.round(n * 100) / 100
export const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const rm = (n: number) => `RM ${f2(n)}`
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const joinQuery = (...parts: string[]) => parts.filter(Boolean).join('&')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "October 2026". */
export const monthWords = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
/** "15 Oct 2026". */
export const dayWords = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

/** The month `n` from `ym`. */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** A month's last day, `YYYY-MM-DD`. */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m, 0))
  return `${ym}-${String(t.getUTCDate()).padStart(2, '0')}`
}
