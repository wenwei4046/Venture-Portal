// The Finance phone app's Journal Entries (2026-10-15, part 5c — a page the
// design does not draw, in its style): the vouchers as a hub — what was posted
// this month, a card for this month, the manual vouchers and the payroll
// accruals — their lists, and one voucher as its page. The figures are the
// desktop pages' (`journal-entries/_lib/jv-read`); the voucher's balance rule
// is the form's (debits equal credits, at least two lines). Pure.

import type { HubCardItem } from '@/components/finv/Hub'
import type { JournalListRow, JournalVoucherRead } from '@/app/(portal)/reconciliation/journal-entries/_lib/jv-read'
import { dayWords, f2, plural, r2, rm } from './page-model'

export type JournalCard = 'month' | 'manual' | 'auto'

export interface JournalRow {
  id: string
  title: string
  desc: string
  amount: number
  /** The voucher's month, `YYYY-MM`. */
  ym: string
  auto: boolean
}

export interface JournalHubModel {
  hero: { value: string; label: string }
  cards: HubCardItem[]
  lists: Record<JournalCard, JournalRow[]>
}

/** The segments a voucher posts to (the form's — gl_segment's own values, not the reports' folded list). */
export const SEGMENTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'unallocated', label: 'Unallocated (top-level adjustment)' },
  { value: 'corporate', label: 'Venture (Office)' },
  { value: 'treasury', label: 'Treasury' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR' },
  { value: 'finance', label: 'Finance' },
  { value: 'director_office', label: 'Director Office' },
  { value: 'director', label: 'Director' },
]

/** The departments added since the form's list was written (the registry's: IT, Revenue Department …). */
export type ExtraSegments = ReadonlyArray<{ value: string; label: string }>

/** Every segment a voucher may post to: the form's, the registry's, and the voucher's own if neither knows it. */
export function segmentChoices(extra: ExtraSegments, own?: string | null): Array<{ value: string; label: string }> {
  const all = [...SEGMENTS, ...extra.filter((e) => !SEGMENTS.some((x) => x.value === e.value))]
  return own && !all.some((x) => x.value === own) ? [...all, { value: own, label: own.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }] : all
}

const segmentWords = (s: string | null, extra: ExtraSegments = []) => {
  const v = s ?? 'unallocated'
  return segmentChoices(extra, v).find((x) => x.value === v)!.label.replace(' (top-level adjustment)', '')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function journalHubModel(rows: JournalListRow[], thisMonth: string, extra: ExtraSegments = []): JournalHubModel {
  const all = rows.map((r) => ({
    id: r.id,
    // A voucher with no words of its own goes by its number (the list rule keeps numbers out of the small print).
    title: r.description?.trim() || r.entry_no || 'Journal voucher',
    desc: [dayWords(r.transaction_date), plural(r.lineCount, 'line', 'lines'), segmentWords(r.segment, extra), r.auto ? 'Auto · payroll' : null].filter(Boolean).join(' · '),
    amount: r.total_amount,
    ym: r.transaction_date.slice(0, 7),
    auto: r.auto,
  }))
  const lists: Record<JournalCard, JournalRow[]> = {
    month: all.filter((r) => r.ym === thisMonth),
    manual: all.filter((r) => !r.auto),
    auto: all.filter((r) => r.auto),
  }
  const sum = (xs: JournalRow[]) => r2(xs.reduce((t, r) => t + r.amount, 0))
  const monthName = `${MONTHS[Number(thisMonth.slice(5, 7)) - 1]} ${thisMonth.slice(0, 4)}`
  return {
    hero: { value: rm(sum(lists.month)), label: `Posted · ${monthName}` },
    cards: [
      { key: 'month', tone: 'all', icon: 'calendar', label: 'This month', sub: plural(lists.month.length, 'voucher', 'vouchers'), value: rm(sum(lists.month)) },
      { key: 'manual', tone: 'company', icon: 'doc', label: 'Manual vouchers', sub: plural(lists.manual.length, 'voucher', 'vouchers'), value: rm(sum(lists.manual)) },
      { key: 'auto', tone: 'payroll', icon: 'payroll', label: 'Payroll accruals', sub: `${plural(lists.auto.length, 'voucher', 'vouchers')} · auto`, value: rm(sum(lists.auto)) },
    ],
    lists,
  }
}

export interface JournalRecordModel {
  id: string
  no: string
  auto: boolean
  date: string
  dateWords: string
  description: string
  segment: string
  segmentWords: string
  debit: number
  credit: number
  balanced: boolean
  lines: Array<{ account: string; name: string | null; debit: number; credit: number; note: string | null }>
  can: { edit: boolean; copy: boolean; delete: boolean }
}

export function journalRecordModel(read: JournalVoucherRead, can: { create: boolean; edit: boolean }, extra: ExtraSegments = []): JournalRecordModel {
  const auto = read.entry.reference_type === 'payroll_accrual'
  const lines = read.lines.map((l) => ({ account: l.account_code, name: read.nameOf.get(l.account_code) ?? null, debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0), note: l.description }))
  const debit = r2(lines.reduce((s, l) => s + l.debit, 0))
  const credit = r2(lines.reduce((s, l) => s + l.credit, 0))
  return {
    id: read.entry.id,
    no: read.entry.entry_no ?? '',
    auto,
    date: read.entry.transaction_date,
    dateWords: dayWords(read.entry.transaction_date),
    description: read.entry.description ?? '',
    segment: read.entry.segment ?? 'unallocated',
    segmentWords: segmentWords(read.entry.segment, extra),
    debit,
    credit,
    balanced: Math.abs(debit - credit) < 0.005,
    lines,
    // The voucher's page: a manual one Delete / Copy / Edit; an auto accrual only *Fix mistakes* (its Edit).
    can: { edit: can.edit, copy: can.create && !auto, delete: can.edit && !auto },
  }
}

// ── The voucher sheet's rule (the desktop form's) ───────────────────────────

export interface JvLineDraft {
  key: string
  account: string
  debit: string
  credit: string
  note: string
}

/** A line nobody filled in neither holds Post back nor posts (the form's leftover). */
export const isBlankLine = (l: JvLineDraft) => l.account === '' && !l.debit.trim() && !l.credit.trim() && !l.note.trim()

export function jvCheck(description: string, lines: JvLineDraft[]): { debit: number; credit: number; diff: number; balanced: boolean; ok: boolean; filled: JvLineDraft[] } {
  const debit = r2(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0))
  const credit = r2(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0))
  const diff = r2(debit - credit)
  const balanced = Math.abs(diff) < 0.005
  const filled = lines.filter((l) => !isBlankLine(l))
  const everyLine = filled.every((l) => {
    const d = parseFloat(l.debit) || 0
    const c = parseFloat(l.credit) || 0
    return l.account !== '' && ((d > 0 && c === 0) || (c > 0 && d === 0))
  })
  return { debit, credit, diff, balanced, filled, ok: description.trim().length > 0 && filled.length >= 2 && everyLine && balanced && debit > 0 }
}

/** What the sheet says while it cannot post (the desktop form's chip, in words). */
export function jvState(c: ReturnType<typeof jvCheck>, description: string): string {
  if (c.ok) return 'Balanced'
  if (!description.trim()) return 'A description is needed'
  if (c.filled.length < 2) return 'At least two lines'
  if (c.debit > 0 || c.credit > 0) return c.balanced ? 'Each line: an account and a debit or a credit' : `Out of balance · ${f2(Math.abs(c.diff))}`
  return 'Debits must equal credits before posting'
}
