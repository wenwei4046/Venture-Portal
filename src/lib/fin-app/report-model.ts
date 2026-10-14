// The Finance phone app's Report tab (2026-10-15, the Finance revamp v2's
// phone — M15–M16, `Finance Mobile App.dc.html`'s `bankReport` /
// `listReport`): a report as a hub — its headline figure, a stacked card per
// part, each card a list of lines — built from the very statements the
// desktop's report pages draw (`reports/_lib/statement-reads`, the debtor
// read, the loan monitor). The design's sample parts (Operating / Investing /
// Financing, Current · not due …) are the system's own here, as the Fund
// cards are (the user, 2026-10-14: the design's style, the system's
// categories). Pure, so every figure is tested without a database.

import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import type { AccountNode, BalanceSheetReport, CashFlowReport, PnlReport, ReportSection } from '@/lib/gl-reports'
import { DAY_BUCKETS, type AgingView } from '@/lib/debtor-aging'
import type { DueRow, LoanMonitorData, MonitorSide, OutstandingRow } from '@/lib/loan-monitor'

export type ReportHub = 'pnl' | 'cf' | 'debtor' | 'loan' | 'bs'

export interface ReportLine {
  key: string
  label: string
  sub?: string
  value: string
  tone?: 'ledger' | 'out' | 'alert' | 'muted' | null
  /** A record of its own, opened in the app (an invoice, a loan, a fund source). */
  open?: { hub: 'invoices' | 'fund-out' | 'fund-in'; id: string } | null
}

export interface ReportGroup {
  key: string
  title: string
  count: string
  lines: ReportLine[]
  empty?: string
}

export interface ReportCard extends HubCardItem {
  groups: ReportGroup[]
}

export interface ReportModel {
  hub: ReportHub
  hero: { value: string; label: string }
  /** A state the page says in a word (*Unpaid as of today*, *Segment only · won't balance*). */
  chip: string | null
  /** A card's list's eyebrow — "P&L · October 2026". */
  eyebrow: string
  cards: ReportCard[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const r2 = (n: number) => Math.round(n * 100) / 100
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "October 2026". */
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
/** "15 Oct 2026". */
export const dayName = (iso: string) => `${String(Number(iso.slice(8, 10))).padStart(2, '0')} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

const card = (key: string, tone: CardTone, icon: HrIconName, label: string, sub: string, value: string, groups: ReportGroup[]): ReportCard => ({ key, tone, icon, label, sub, value, groups })

/** A statement section's accounts, as lines: each account that moved — a parent's children rather than the parent, so nothing is counted twice. */
export function sectionLines(section: Pick<ReportSection, 'nodes' | 'root'>, sign = 1): ReportLine[] {
  const out: ReportLine[] = []
  const walk = (n: AccountNode) => {
    if (n.children.length > 0) {
      n.children.forEach(walk)
      // What the parent carries beyond its children (posted to the parent itself).
      const own = r2(n.current - n.children.reduce((s, c) => s + c.current, 0))
      if (Math.abs(own) >= 0.005) out.push({ key: `${n.code}:own`, label: n.name, sub: n.code, value: f2(sign * own), tone: sign * own < 0 ? 'out' : null })
      return
    }
    if (Math.abs(n.current) < 0.005) return
    out.push({ key: n.code, label: n.name, sub: n.code === '—' ? undefined : n.code, value: f2(sign * n.current), tone: sign * n.current < 0 ? 'out' : null })
  }
  section.nodes.forEach(walk)
  return out
}

const totalLine = (label: string, value: number): ReportLine => ({ key: 'total', label: `Total ${label.toLowerCase()}`, value: f2(value), tone: value < 0 ? 'out' : null })

function sectionCard(key: string, tone: CardTone, icon: HrIconName, label: string, section: ReportSection, when: string): ReportCard {
  const lines = sectionLines(section)
  return card(key, tone, icon, label, plural(lines.length, 'line', 'lines'), rm(section.current), [
    { key, title: label, count: plural(lines.length, 'line', 'lines'), lines: lines.length > 0 ? [...lines, { ...totalLine(label, section.current), sub: when }] : [], empty: 'Nothing this month.' },
  ])
}

/** P&L for a month (the income statement): the net profit over Revenue, Cost of Goods Sold, Other Income and Expenses. */
export function pnlModel(pnl: PnlReport, period: string): ReportModel {
  const when = monthName(period)
  return {
    hub: 'pnl',
    hero: { value: rm(pnl.netIncome.current), label: `Net profit · ${when}` },
    chip: null,
    eyebrow: `P&L · ${when}`,
    cards: [
      sectionCard('revenue', 'paid', 'payroll', 'Revenue', pnl.revenue, when),
      sectionCard('cost', 'issued', 'doc', 'Cost of Goods Sold', pnl.cost, when),
      sectionCard('other_income', 'company', 'in', 'Other Income', pnl.otherIncome, when),
      sectionCard('expense', 'approved', 'approve', 'Expenses', pnl.expense, when),
    ],
  }
}

/**
 * Cash Flow for a month (direct method): the net change over Money in and Money out — each a list of the user's
 * sections (Edit layout), its accounts under each — and the bank balances, opening to closing.
 */
export function cashFlowModel(cf: CashFlowReport, sides: { inflow: ReportSection[]; outflow: ReportSection[] }, period: string, isNow: boolean): ReportModel {
  const when = monthName(period)
  const side = (key: string, sections: ReportSection[], fallback: ReportSection, sign: number): ReportGroup[] =>
    (sections.length > 0 ? sections : [fallback]).map((s, i) => {
      const lines = sectionLines(s, sign)
      return { key: `${key}:${i}`, title: s.label, count: rm(sign * s.current), lines, empty: 'Nothing this month.' }
    })
  const count = (groups: ReportGroup[]) => groups.reduce((n, g) => n + g.lines.length, 0)
  const inGroups = side('in', sides.inflow, cf.inflow, 1)
  const outGroups = side('out', sides.outflow, cf.outflow, 1)
  const [y, m] = period.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const bank: ReportLine[] = [
    { key: 'opening', label: `Opening · 01 ${MON[m - 1]}`, value: f2(cf.openingCash.current) },
    { key: 'net', label: 'Net change', value: f2(cf.netChange.current), tone: cf.netChange.current < 0 ? 'out' : 'ledger' },
    { key: 'closing', label: isNow ? 'Closing · to date' : `Closing · ${last} ${MON[m - 1]}`, value: f2(cf.closingCash.current) },
    ...(Math.abs(cf.check.current) > 0.005 ? [{ key: 'check', label: 'Uncategorised cash movement', value: f2(cf.check.current), tone: 'alert' as const }] : []),
  ]
  return {
    hub: 'cf',
    hero: { value: rm(cf.netChange.current), label: `Net cash flow · ${when}` },
    chip: null,
    eyebrow: `Cash flow · ${when}`,
    cards: [
      card('in', 'paid', 'in', 'Money in', plural(count(inGroups), 'line', 'lines'), rm(cf.inflow.current), inGroups),
      card('out', 'approved', 'out', 'Money out', plural(count(outGroups), 'line', 'lines'), rm(cf.outflow.current), outGroups),
      card('bank', 'all', 'doc', 'Bank balances', plural(bank.length, 'line', 'lines'), rm(cf.closingCash.current), [{ key: 'bank', title: 'Bank balances', count: when, lines: bank }]),
    ],
  }
}

/** The Balance Sheet as at a month's end: the total assets over each part; Equity carries the cumulative P&L, as the page's does. */
export function balanceSheetModel(bs: BalanceSheetReport, period: string, segment: string): ReportModel {
  const [y, m] = period.split('-').map(Number)
  const end = `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  const asAt = dayName(end)
  const equity: ReportSection = {
    ...bs.equity,
    nodes: [...bs.equity.nodes, { code: '—', name: 'Retained & current earnings (cumulative P&L)', current: bs.earnings.current, previous: bs.earnings.previous, txns: [], children: [] }],
    current: r2(bs.equity.current + bs.earnings.current),
    previous: r2(bs.equity.previous + bs.earnings.previous),
  }
  const balanced = Math.abs(bs.check.current) < 0.01
  return {
    hub: 'bs',
    hero: { value: rm(bs.totalAssets.current), label: `Total assets · ${asAt}` },
    chip: segment ? 'Segment only · won’t balance' : balanced ? null : 'Out of balance',
    eyebrow: `Balance sheet · ${asAt}`,
    cards: [
      ...(bs.fixedAssets.nodes.length > 0 ? [sectionCard('fixed_asset', 'company', 'tree', 'Fixed Assets', bs.fixedAssets, asAt)] : []),
      sectionCard('asset', 'all', 'doc', 'Current Assets', bs.assets, asAt),
      sectionCard('liability', 'approved', 'approve', 'Liabilities', bs.liabilities, asAt),
      sectionCard('equity', 'paid', 'payroll', 'Equity', equity, asAt),
    ],
  }
}

const DEBTOR_LOOK: Record<string, { tone: CardTone; icon: HrIconName }> = {
  d0_30: { tone: 'paid', icon: 'payroll' },
  d31_60: { tone: 'issued', icon: 'doc' },
  d61_90: { tone: 'approved', icon: 'approve' },
  d90_plus: { tone: 'pending_approval', icon: 'calendar' },
}

/**
 * Debtor Aging as at a day (by days since the invoice — the page's company-wide view): what is owed to HV over a
 * card per age, each invoice opening in the app.
 */
export function debtorModel(view: AgingView, asAt: string, past: boolean): ReportModel {
  const at = dayName(asAt)
  return {
    hub: 'debtor',
    hero: { value: rm(view.totals.total), label: `Owed to HV · as at ${at}` },
    chip: past ? 'Unpaid as of today' : null,
    eyebrow: `Debtor aging · as at ${at}`,
    cards: DAY_BUCKETS.map((b) => {
      const xs = view.invoices.filter((i) => i.bucket === b.key)
      const lines: ReportLine[] = xs.map((i) => ({
        key: i.id,
        label: i.payer,
        sub: `${i.invoiceNo} · ${plural(i.age, 'day', 'days')}`,
        value: f2(i.amount),
        tone: i.age > 60 ? 'out' : null,
        open: { hub: 'invoices', id: i.id },
      }))
      const total = view.totals.buckets[b.key] ?? 0
      return card(b.key, DEBTOR_LOOK[b.key].tone, DEBTOR_LOOK[b.key].icon, b.label, plural(xs.length, 'invoice', 'invoices'), rm(total), [
        { key: b.key, title: 'Invoices', count: `${xs.length} · ${rm(total)}`, lines, empty: 'Nothing in this bucket.' },
      ])
    }),
  }
}

const LOAN_BUCKETS = [
  { key: 'notDue', label: 'Not due', tone: 'paid', icon: 'payroll' },
  { key: 'd30', label: '1–30 days', tone: 'issued', icon: 'doc' },
  { key: 'd90', label: '31–90 days', tone: 'approved', icon: 'approve' },
  { key: 'd90plus', label: '90+ days', tone: 'pending_approval', icon: 'calendar' },
] as const

const dueLine = (d: DueRow, value: number, hub: 'fund-out' | 'fund-in'): ReportLine => ({
  key: d.key,
  label: d.counterparty,
  sub: [d.source ? `SC ${d.source}` : null, d.detail].filter(Boolean).join(' · '),
  value: f2(value),
  open: { hub, id: d.key },
})
const outstandingLine = (o: OutstandingRow, hub: 'fund-out' | 'fund-in'): ReportLine => ({
  key: o.key,
  label: o.counterparty,
  sub: [o.source ? `SC ${o.source}` : null, o.detail, o.startLabel ? `starts ${o.startLabel}` : null].filter(Boolean).join(' · '),
  value: f2(o.outstanding),
  open: { hub, id: o.key },
})
const outstandingGroups = (side: MonitorSide, hub: 'fund-out' | 'fund-in'): ReportGroup[] => [
  { key: `${hub}:scheduled`, title: 'Fixed schedule', count: rm(side.scheduledTotal), lines: side.scheduled.map((o) => outstandingLine(o, hub)), empty: 'None.' },
  { key: `${hub}:noterm`, title: 'No fixed term / compounding', count: rm(side.noTermTotal), lines: side.noTerm.map((o) => outstandingLine(o, hub)), empty: 'None.' },
]

/**
 * Loan Aging as at a day (the loan monitor): the loans outstanding over a card per days late — the instalments
 * past their day unpaid, by borrower — then what HV owes its lenders late, and every open balance on each side.
 * A line opens its loan or fund source.
 */
export function loanModel(data: LoanMonitorData, asAt: string): ReportModel {
  const at = dayName(asAt)
  const c = data.collect
  const r = data.repay
  const collectCount = new Set([...c.scheduled, ...c.noTerm].map((o) => o.key)).size
  const repayCount = new Set([...r.scheduled, ...r.noTerm].map((o) => o.key)).size
  return {
    hub: 'loan',
    hero: { value: rm(c.grandTotal), label: `Loans outstanding · as at ${at}` },
    chip: null,
    eyebrow: `Loan aging · as at ${at}`,
    cards: [
      ...LOAN_BUCKETS.map((b) => {
        const xs = c.due.filter((d) => d.days[b.key] > 0.005).sort((x, y) => y.days[b.key] - x.days[b.key])
        const total = c.dueDaysTotal[b.key]
        return card(b.key, b.tone, b.icon, b.label, plural(xs.length, 'loan', 'loans'), rm(total), [
          { key: b.key, title: 'Loans', count: `${xs.length} · ${rm(total)}`, lines: xs.map((d) => dueLine(d, d.days[b.key], 'fund-out')), empty: 'Nothing in this bucket.' },
        ])
      }),
      card('repay', 'company', 'in', 'To repay · Fund IN', plural(r.due.length, 'lender', 'lenders'), rm(r.dueDaysTotal.total), [
        { key: 'repay', title: 'Lenders', count: `${r.due.length} · ${rm(r.dueDaysTotal.total)}`, lines: r.due.map((d) => dueLine(d, d.days.total, 'fund-in')), empty: 'All paid — nothing overdue.' },
      ]),
      card('out-collect', 'quiet', 'out', 'Outstanding · to collect', plural(collectCount, 'position', 'positions'), rm(c.grandTotal), outstandingGroups(c, 'fund-out')),
      card('out-repay', 'peach', 'in', 'Outstanding · to repay', plural(repayCount, 'position', 'positions'), rm(r.grandTotal), outstandingGroups(r, 'fund-in')),
    ],
  }
}
