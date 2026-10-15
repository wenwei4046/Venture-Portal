// Fund › Statements in the Finance phone app (2026-10-15, part 5c — a page the
// design does not draw, in its style): the desktop page's month (its cards —
// the month's statements and net, every month's drafts, every statement) as a
// hub with the month between its arrows; a statement as its page, as
// `/statements/[id]` reads it — its invoice and contra items, the net, and the
// one step its status allows. Pure.

import type { HubCardItem } from '@/components/finv/Hub'
import type { StatementRead, StatementRow } from '@/app/(portal)/statements/_lib/statement-read'
import { statementCategory } from '@/app/(portal)/statements/_lib/statement-read'
import { f2, monthWords, plural, r2, shiftMonth, type PagePlace } from './page-model'

export type StatementCard = 'month' | 'draft' | 'all'
export const STATEMENT_CARDS: readonly StatementCard[] = ['month', 'draft', 'all']

const monthOf = (d: string) => String(d).slice(0, 7)
/** Money as the sheet writes a net: a minus for what HV owes. */
export const net = (n: number) => `${n < 0 ? '−' : ''}RM ${f2(Math.abs(n))}`

/** "all draft", or "1 issued · 1 paid" — what state a month's statements are in (the desktop's words). */
export function statusMix(statements: Array<{ status: string }>): string {
  const counts = new Map<string, number>()
  for (const s of statements) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
  if (counts.size === 1) return `all ${[...counts.keys()][0]}`
  return ['draft', 'issued', 'paid']
    .filter((st) => counts.has(st))
    .map((st) => `${counts.get(st)} ${st}`)
    .join(' · ')
}

export interface StatementListRow {
  id: string
  title: string
  desc: string
  amount: string
  tone: 'out' | null
}

export interface StatementHubModel {
  hero: { value: string; label: string }
  chip: { text: string; tone: 'def' | 'alert' | 'ledger' } | null
  cards: Array<HubCardItem & { key: StatementCard }>
  lists: Record<StatementCard, Array<{ title: string; rows: StatementListRow[] }>>
}

/** The month on show as the address names it (`?m=YYYY-MM`); none is the newest month with statements (the desktop's). */
export function askedStatementMonth(m: unknown, months: readonly string[], fallback: string): string {
  return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : (months[0] ?? fallback)
}

/** Where the page is: its month between the arrows — a month back or on, as the desktop's bar steps. */
export function statementsPlace(ym: string, newest: string | null): PagePlace {
  const keep = (x: string) => (x === newest ? '' : `m=${x}`)
  return {
    href: '/fin-app/page/statements',
    title: 'Statements',
    roman: 'II.',
    keep: keep(ym),
    period: { label: monthWords(ym), prev: keep(shiftMonth(ym, -1)), next: keep(shiftMonth(ym, 1)) },
  }
}

export function statementHubModel(statements: StatementRow[], companies: ReadonlyMap<string, { name: string; code: string | null }>, month: string): StatementHubModel {
  const shown = statements.filter((s) => monthOf(s.period_month) === month)
  const sum = (list: StatementRow[], f: (s: StatementRow) => number) => r2(list.reduce((t, s) => t + f(s), 0))
  const netShown = sum(shown, (s) => Number(s.net_amount))
  const drafts = statements.filter((s) => s.status === 'draft')
  const draftMonths = new Set(drafts.map((s) => monthOf(s.period_month))).size
  const issued = statements.filter((s) => s.status === 'issued').length
  const paid = statements.filter((s) => s.status === 'paid').length
  const monthName = monthWords(month).split(' ')[0]

  const row = (s: StatementRow): StatementListRow => {
    const co = companies.get(s.company_id)
    const n = Number(s.net_amount)
    return {
      id: s.id,
      title: co?.name ?? '—',
      desc: [co?.code, s.status, `invoice ${f2(Number(s.total_invoice))} − contra ${f2(Number(s.total_contra))}`].filter(Boolean).join(' · '),
      amount: `${n < 0 ? '−' : ''}${f2(Math.abs(n))}`,
      tone: n < 0 ? 'out' : null,
    }
  }
  const byMonth = (list: StatementRow[]) => {
    const months = Array.from(new Set(list.map((s) => monthOf(s.period_month)))).sort().reverse()
    return months.map((m) => ({ title: monthWords(m), rows: list.filter((s) => monthOf(s.period_month) === m).map(row) }))
  }

  return {
    hero: { value: net(netShown), label: `Net · ${monthWords(month)}` },
    chip: shown.length === 0 ? { text: 'None generated', tone: 'def' } : { text: statusMix(shown), tone: shown.every((s) => s.status === 'paid') ? 'ledger' : shown.some((s) => s.status === 'draft') ? 'def' : 'alert' },
    cards: [
      {
        key: 'month',
        tone: 'all',
        icon: 'calendar',
        label: `Statements · ${monthName}`,
        sub: shown.length > 0 ? `invoice ${f2(sum(shown, (s) => Number(s.total_invoice)))} − contra ${f2(sum(shown, (s) => Number(s.total_contra)))}` : 'None generated',
        value: plural(shown.length, 'statement', 'statements'),
      },
      { key: 'draft', tone: 'draft', icon: 'doc', label: 'Draft', sub: drafts.length > 0 ? `waiting to be issued${draftMonths > 1 ? ` · ${draftMonths} months` : ''}` : 'none waiting', value: plural(drafts.length, 'statement', 'statements') },
      { key: 'all', tone: 'company', icon: 'receipt', label: 'All statements', sub: `${issued} issued · ${paid} paid`, value: plural(statements.length, 'statement', 'statements') },
    ],
    lists: {
      month: [{ title: monthWords(month), rows: shown.map(row) }],
      draft: byMonth(drafts),
      all: byMonth(statements),
    },
  }
}

// ── A statement as its page ────────────────────────────────────────────────

export interface StatementRecordModel {
  id: string
  company: string
  code: string | null
  period: string
  periodYm: string
  status: string
  net: string
  netValue: number
  /** Who pays whom: "<company> pays HV", or "HV owes <company>". */
  direction: string
  invoice: number
  contra: number
  invoiceLines: Array<{ key: string; label: string; sub?: string; value: string }>
  contraLines: Array<{ key: string; label: string; sub?: string; value: string }>
  created: string
  issued: string | null
  /** Treasury's Edit on the page's boxes: a draft is issued, an issued one marked paid. */
  can: { issue: boolean; paid: boolean }
}

/** `when`: the office's day words for a moment (the created and issued stamps). */
export function statementRecordModel(read: StatementRead, when: { created: string; issued: string | null }, may: { edit: boolean }): StatementRecordModel {
  const s = read.statement
  const company = read.company?.name ?? '—'
  const n = Number(s.net_amount)
  const line = (l: StatementRead['invoiceLines'][number], sign: 1 | -1) => ({ key: l.id, label: statementCategory(l.category_code), sub: l.description ?? undefined, value: `${sign * Number(l.amount) < 0 ? '−' : ''}${f2(Math.abs(Number(l.amount)))}` })
  return {
    id: s.id,
    company,
    code: read.company?.short_code ?? null,
    period: monthWords(monthOf(s.period_month)),
    periodYm: monthOf(s.period_month),
    status: s.status,
    net: net(n),
    netValue: n,
    direction: n >= 0 ? `${company} pays HV` : `HV owes ${company}`,
    invoice: Number(s.total_invoice),
    contra: Number(s.total_contra),
    invoiceLines: read.invoiceLines.map((l) => line(l, 1)),
    contraLines: read.contraLines.map((l) => line(l, -1)),
    created: when.created,
    issued: when.issued,
    can: { issue: may.edit && s.status === 'draft', paid: may.edit && s.status === 'issued' },
  }
}
