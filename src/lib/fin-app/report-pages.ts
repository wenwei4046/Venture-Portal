// The Report section's pages that have no top tab in the Finance phone app
// (2026-10-15, part 5b — Trial Balance, Base Rate History, Company Statement,
// Receipt & Payment, General Ledger): each desktop page's own figures, shaped
// as a `PageModel` — the headline, a card per part, each card's lines summing
// to it. Pure; the pages' server halves read.

import type { CardTone } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import type { TbBlock } from '@/lib/trial-balance-groups'
import type { CounterpartyRow, PositionRow, StatementTotals } from '@/lib/counterparty-statement'
import type { CashFlowReport, ReportSection } from '@/lib/gl-reports'
import { cashFlowModel, type ReportModel } from './report-model'
import { dayWords, f2, joinQuery, monthEnd, monthWords, plural, r2, rm, shiftMonth, type PageCard, type PageGroup, type PageLine, type PageModel, type PagePlace } from './page-model'

// ── A month on show, as the pages' arrows step it ──────────────────────────

/** The query naming a month and a segment (none for the office's own month, none for all segments). */
export const keepOf = (ym: string, thisMonth: string, segment = '') => joinQuery(ym === thisMonth ? '' : `m=${ym}`, segment ? `s=${encodeURIComponent(segment)}` : '')

/** A page's place with a month between its arrows (never past the office's) and, where it has them, the segments. */
export function monthPlace(args: {
  href: string
  title: string
  roman: string
  ym: string
  thisMonth: string
  label: string
  segment?: string
  segments?: Array<{ value: string; label: string }> | null
}): PagePlace {
  const seg = args.segment ?? ''
  return {
    href: args.href,
    title: args.title,
    roman: args.roman,
    keep: keepOf(args.ym, args.thisMonth, seg),
    period: {
      label: args.label,
      prev: keepOf(shiftMonth(args.ym, -1), args.thisMonth, seg),
      next: args.ym < args.thisMonth ? keepOf(shiftMonth(args.ym, 1), args.thisMonth, seg) : null,
    },
    segments: args.segments ? args.segments.map((o) => ({ ...o, keep: keepOf(args.ym, args.thisMonth, o.value) })) : null,
    segment: seg,
  }
}

/** The day a month is read as at: its last, or the office's today for the office's own month. */
export const asAtOf = (ym: string, today: string) => (ym === today.slice(0, 7) ? today : monthEnd(ym))

// ── A Report hub's model, as a page's (the phone's reports share their parts) ──

const HUB_PATH: Record<string, string> = { invoices: '/fin-app/daily/invoices', 'fund-out': '/fin-app/fund/out', 'fund-in': '/fin-app/fund/in' }

/** A Report tab hub's model (`report-model.ts`) drawn by `PageApp`: a line's record in the app becomes its address. */
export function fromReportModel(m: ReportModel): PageModel {
  return {
    hero: m.hero,
    chip: m.chip,
    eyebrow: m.eyebrow,
    cards: m.cards.map((c) => ({
      ...c,
      groups: c.groups.map((g) => ({
        ...g,
        lines: g.lines.map((l): PageLine => ({ key: l.key, label: l.label, sub: l.sub, value: l.value, tone: l.tone ?? null, open: l.open ? { href: `${HUB_PATH[l.open.hub]}?id=${encodeURIComponent(l.open.id)}` } : null })),
      })),
    })),
  }
}

// ── Receipt & Payment ───────────────────────────────────────────────────────

/** An issued invoice still owed, as the desktop's *To collect* reads it (`fetchDeptOutstanding`). */
export interface OwedInvoice {
  id: string
  invoiceNo: string | null
  party: string
  periodMonth: string
  totalAmount: number
  receipts: number
  credits: number
  outstanding: number
}

/**
 * Receipt & Payment for a month: the Cash Flow statement's own figures (the desktop page builds the very same —
 * `readCashFlowStatement`), its receipts and payments as the page names them, and — for one segment — every
 * issued invoice of it still owed, opening in the app's Invoice.
 */
export function receiptPaymentModel(cf: CashFlowReport, sides: { inflow: ReportSection[]; outflow: ReportSection[] }, period: string, isNow: boolean, owed: OwedInvoice[] | null): PageModel {
  const base = fromReportModel(cashFlowModel(cf, sides, period, isNow))
  const when = monthWords(period)
  const [inCard, outCard, bankCard] = base.cards
  const cards: PageCard[] = [
    { ...inCard, label: 'Receipts' },
    { ...outCard, label: 'Payments' },
    bankCard,
  ]
  if (owed) {
    const total = r2(owed.reduce((s, i) => s + i.outstanding, 0))
    cards.push({
      key: 'collect',
      tone: 'issued',
      icon: 'invoice',
      label: 'To collect',
      sub: plural(owed.length, 'invoice', 'invoices'),
      value: rm(total),
      groups: [
        {
          key: 'collect',
          title: 'Issued, still owed',
          count: rm(total),
          empty: 'Nothing owed.',
          lines: owed.map((i) => ({
            key: i.id,
            label: `${i.invoiceNo ?? i.id.slice(0, 8)} · ${i.party}`,
            sub: [monthWords(i.periodMonth.slice(0, 7)), `total ${f2(i.totalAmount)}`, i.receipts > 0 ? `received ${f2(i.receipts)}` : null, i.credits > 0 ? `CN −${f2(i.credits)}` : null].filter(Boolean).join(' · '),
            value: f2(i.outstanding),
            tone: 'alert',
            open: { href: `/fin-app/daily/invoices?id=${encodeURIComponent(i.id)}` },
          })),
        },
      ],
    })
  }
  return { ...base, hero: { value: rm(cf.netChange.current), label: `Net · ${when}` }, eyebrow: `Receipt & Payment · ${when}`, cards }
}

// ── Trial Balance ───────────────────────────────────────────────────────────

const TB_LOOK: Record<string, { tone: CardTone; icon: HrIconName; credit: boolean }> = {
  asset: { tone: 'all', icon: 'doc', credit: false },
  fixed_asset: { tone: 'company', icon: 'tree', credit: false },
  liability: { tone: 'approved', icon: 'approve', credit: true },
  equity: { tone: 'paid', icon: 'payroll', credit: true },
  revenue: { tone: 'paid', icon: 'payroll', credit: true },
  cost: { tone: 'issued', icon: 'doc', credit: false },
  other_income: { tone: 'company', icon: 'in', credit: true },
  expense: { tone: 'approved', icon: 'out', credit: false },
}

/** "Dr 1,200.00" / "Cr 800.00" — an account's balance as the trial balance stands it. */
const drCr = (debit: number, credit: number) => (debit > 0 ? `Dr ${f2(debit)}` : credit > 0 ? `Cr ${f2(credit)}` : '—')

export function trialBalanceModel(tb: { rows: unknown[]; totals: { debit: number; credit: number }; reconciles: boolean }, blocks: TbBlock[], asOf: string): PageModel {
  const diff = r2(tb.totals.debit - tb.totals.credit)
  const cards: PageCard[] = blocks.map((b) => {
    const look = TB_LOOK[b.type] ?? { tone: 'quiet' as CardTone, icon: 'doc' as HrIconName, credit: false }
    // A block stands on its own side: an asset's or an expense's debits less its credits, the rest the other way.
    const net = r2(look.credit ? b.credit - b.debit : b.debit - b.credit)
    const accounts = b.groups.reduce((n, g) => n + g.items.length, 0)
    return {
      key: b.type,
      tone: look.tone,
      icon: look.icon,
      label: b.title,
      sub: `${plural(accounts, 'account', 'accounts')} · Dr ${f2(b.debit)} · Cr ${f2(b.credit)}`,
      value: rm(net),
      groups: b.groups.map(
        (g): PageGroup => ({
          key: g.code,
          title: g.name,
          count: drCr(g.debit > g.credit ? r2(g.debit - g.credit) : 0, g.credit > g.debit ? r2(g.credit - g.debit) : 0),
          lines: g.items.map((i): PageLine => ({ key: i.code, label: i.name, sub: i.code, value: drCr(i.debit, i.credit), tone: null })),
        }),
      ),
    }
  })
  return {
    hero: { value: rm(tb.totals.debit), label: `Total debit · as at ${dayWords(asOf)}` },
    chip: tb.reconciles ? { text: 'Debits = credits', tone: 'ledger' } : { text: `Does not reconcile · ${rm(diff)}`, tone: 'danger' },
    eyebrow: `Trial Balance · as at ${dayWords(asOf)}`,
    cards,
  }
}

// ── General Ledger ──────────────────────────────────────────────────────────

/** "1,234.00 Dr" / "567.00 Cr" — a signed balance as the desktop ledger writes it (the user kept it, 2026-10-10). */
export const signedBalance = (signed: number) => (Math.abs(signed) < 0.005 ? '—' : `${f2(Math.abs(signed))} ${signed >= 0 ? 'Dr' : 'Cr'}`)

export interface LedgerLike {
  code: string
  accountName: string
  accountType: string
  openingBalance: number
  closingBalance: number
  periodTotals: { debit: number; credit: number }
  lines: Array<{ entryDate: string; entryNo: string; description: string; ref: string; debit: number; credit: number; runningBalance: number }>
}

/**
 * The General Ledger for a month, as the desktop's: every account with activity (a line beyond its balance
 * brought forward, or a balance at either end), by its type; each account opens onto its entries — the
 * balance brought forward, each line with its running balance, the balance carried at the end.
 */
export function ledgerModel(ledgers: LedgerLike[], from: string, to: string, label: string): PageModel {
  const types = [...Object.keys(TB_LOOK), ...new Set(ledgers.map((l) => l.accountType).filter((t) => !(t in TB_LOOK)))]
  const debit = r2(ledgers.reduce((s, l) => s + l.periodTotals.debit, 0))
  const credit = r2(ledgers.reduce((s, l) => s + l.periodTotals.credit, 0))
  const TITLE: Record<string, string> = { asset: 'Assets', fixed_asset: 'Fixed assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', cost: 'Cost', other_income: 'Other income', expense: 'Expense' }
  const cards: PageCard[] = types.flatMap((type) => {
    const inType = ledgers.filter((l) => l.accountType === type)
    if (inType.length === 0) return []
    const look = TB_LOOK[type] ?? { tone: 'quiet' as CardTone, icon: 'doc' as HrIconName, credit: false }
    const dr = r2(inType.reduce((s, l) => s + l.periodTotals.debit, 0))
    const cr = r2(inType.reduce((s, l) => s + l.periodTotals.credit, 0))
    return [
      {
        key: type,
        tone: look.tone,
        icon: look.icon,
        label: TITLE[type] ?? type.replace(/_/g, ' '),
        sub: `${plural(inType.length, 'account', 'accounts')} · Dr ${f2(dr)} · Cr ${f2(cr)}`,
        value: signedBalance(r2(inType.reduce((s, l) => s + l.closingBalance, 0))),
        groups: [
          {
            key: type,
            title: 'Accounts',
            count: String(inType.length),
            lines: inType.map(
              (l): PageLine => ({
                key: l.code,
                label: l.accountName,
                sub: `${l.code} · Dr ${f2(l.periodTotals.debit)} · Cr ${f2(l.periodTotals.credit)}`,
                value: signedBalance(l.closingBalance),
                detail: {
                  title: l.accountName,
                  groups: [
                    {
                      key: 'entries',
                      title: `${l.code} · ${plural(Math.max(0, l.lines.length - 1), 'entry', 'entries')}`,
                      count: signedBalance(l.closingBalance),
                      lines: [
                        // Every ledger opens on its balance brought forward (buildLedger's first line).
                        ...l.lines.map(
                          (x, i): PageLine =>
                            i === 0 && x.description === 'BALANCE B/F'
                              ? { key: 'bf', label: 'Balance B/F', sub: dayWords(from), value: signedBalance(l.openingBalance), tone: 'muted' }
                              : {
                                  key: `${i}:${x.entryNo}`,
                                  label: x.description || x.ref || x.entryNo,
                                  // The running balance before the numbers: the line keeps one line of small print.
                                  sub: [x.entryDate ? dayWords(x.entryDate).slice(0, -5) : null, `bal ${signedBalance(x.runningBalance)}`, x.entryNo, x.ref && x.ref !== x.description ? x.ref : null].filter(Boolean).join(' · '),
                                  value: x.debit > 0 ? `${f2(x.debit)} Dr` : `${f2(x.credit)} Cr`,
                                  tone: x.credit > 0 ? 'out' : null,
                                },
                        ),
                        { key: 'cf', label: 'Balance C/F', sub: dayWords(to), value: signedBalance(l.closingBalance), tone: 'muted' },
                      ],
                    },
                  ],
                },
              }),
            ),
          },
        ],
      },
    ]
  })
  return {
    hero: { value: rm(debit), label: `Debits posted · ${label}` },
    chip: Math.abs(debit - credit) < 0.01 ? { text: `${plural(ledgers.length, 'account', 'accounts')} · Dr = Cr`, tone: 'ledger' } : { text: `Credits posted ${f2(credit)}`, tone: 'alert' },
    eyebrow: `General Ledger · ${label}`,
    cards,
  }
}

// ── Base Rate History ───────────────────────────────────────────────────────

export interface BaseRateRow {
  quarter: string
  base_rate: number | string
  weighted_cost: number | string
  op_margin: number | string
  approved_at: string | null
}

const pct = (v: number | string) => `${(Number(v) * 100).toFixed(3)}%`

export function baseRateModel(history: BaseRateRow[], approvedDay: (iso: string) => string): PageModel {
  const now = history[0]
  const prev = history[1]
  const change = now && prev ? Number(now.base_rate) - Number(prev.base_rate) : null
  const line = (h: BaseRateRow, value: string, sub: string): PageLine => ({ key: h.quarter, label: h.quarter, sub, value })
  const approved = (h: BaseRateRow) => (h.approved_at ? `Approved ${approvedDay(h.approved_at)}` : 'Not approved')
  const group = (title: string, lines: PageLine[]): PageGroup[] => [{ key: 'quarters', title, count: plural(lines.length, 'quarter', 'quarters'), lines, empty: 'No base rate history yet.' }]
  return {
    hero: now ? { value: `${pct(now.base_rate)}/mo`, label: `Current base rate · ${now.quarter}` } : { value: '—', label: 'No base rate yet' },
    chip: change === null ? null : { text: `${change >= 0 ? '+' : '−'}${(Math.abs(change) * 100).toFixed(3)}% vs ${prev!.quarter}`, tone: 'def' },
    eyebrow: 'Base Rate History',
    cards: [
      {
        key: 'history',
        tone: 'all',
        icon: 'percent',
        label: 'History',
        sub: plural(history.length, 'quarter', 'quarters'),
        value: now ? `${pct(now.base_rate)}/mo` : '—',
        groups: group('Base rate', history.map((h) => line(h, `${pct(h.base_rate)}/mo`, `Weighted ${pct(h.weighted_cost)} · Margin ${pct(h.op_margin)} · ${approved(h)}`))),
      },
      {
        key: 'weighted',
        tone: 'company',
        icon: 'doc',
        label: 'Weighted cost',
        sub: 'Cost of fund sources',
        value: now ? pct(now.weighted_cost) : '—',
        groups: group('Weighted cost', history.map((h) => line(h, pct(h.weighted_cost), approved(h)))),
      },
      {
        key: 'margin',
        tone: 'issued',
        icon: 'percent',
        label: 'Op margin',
        sub: 'Set in Treasury config',
        value: now ? pct(now.op_margin) : '—',
        groups: group('Op margin', history.map((h) => line(h, pct(h.op_margin), approved(h)))),
      },
    ],
  }
}

// ── Company Statement ───────────────────────────────────────────────────────

/** One deal still open with a counterparty, in the desktop statement's words — its rate and term, what is due,
 *  when it is done (`StatementView`) — opening in the app. */
function positionLine(p: PositionRow): PageLine {
  const kind = p.kind === 'compound' ? 'compounding' : p.kind === 'no_term' ? 'no fixed term' : `${p.tenureMonths}mo`
  const finish =
    p.kind === 'no_term'
      ? `TBD · ~RM ${f2(p.monthlyInterest)}/mo interest`
      : p.kind === 'compound'
        ? 'TBD · compounds monthly'
        : `${p.remainingPeriods} left${p.finishYM ? ` · by ${p.finishYM}` : ''}`
  const due = p.kind === 'no_term' ? p.principalOutstanding : r2(p.principalOutstanding + p.interestOutstanding)
  const source = p.source ? ` · ${p.side === 'collect' ? 'SC' : 'Lent to'} ${p.source}` : ''
  return {
    key: p.id,
    label: `${(p.monthlyRate * 100).toFixed(3)}%/mo · ${kind}${p.startYM ? ` · starts ${p.startYM}` : ''}`,
    sub: `${rm(p.principal)} · due ${f2(p.principalOutstanding)}${p.kind === 'no_term' ? '' : ` + ${f2(p.interestOutstanding)} interest`} · ${finish}${source}`,
    value: f2(due),
    tone: p.side === 'collect' ? 'ledger' : 'out',
    open: { href: `/fin-app/fund/${p.side === 'collect' ? 'out' : 'in'}?id=${encodeURIComponent(p.id)}` },
  }
}

export function companyStatementModel(rows: CounterpartyRow[], totals: StatementTotals, today: string): PageModel {
  const toCollect = r2(totals.collectPrincipal + totals.collectInterest)
  const toRepay = r2(totals.repayPrincipal + totals.repayInterest)
  const net = r2(toCollect - toRepay)
  const side = (which: 'collect' | 'repay'): PageGroup[] => {
    const list = rows
      .map((r) => ({ r, items: r.items.filter((i) => i.side === which) }))
      .filter((x) => x.items.length > 0)
      .map(({ r, items }): PageLine => {
        const principal = which === 'collect' ? r.collectPrincipal : r.repayPrincipal
        const interest = which === 'collect' ? r.collectInterest : r.repayInterest
        return {
          key: `${which}:${r.counterparty}`,
          label: r.counterparty,
          sub: `Principal ${f2(principal)} · Interest ${f2(interest)} · ${plural(items.length, 'deal', 'deals')}`,
          value: f2(r2(principal + interest)),
          tone: which === 'collect' ? 'ledger' : 'out',
          detail: { title: r.counterparty, groups: [{ key: 'deals', title: which === 'collect' ? 'To collect' : 'To repay', count: rm(r2(principal + interest)), lines: items.map(positionLine) }] },
        }
      })
    return [{ key: which, title: 'Counterparties', count: String(list.length), lines: list, empty: which === 'collect' ? 'Nothing to collect.' : 'Nothing to repay.' }]
  }
  return {
    hero: { value: `${net >= 0 ? 'Collect' : 'Repay'} ${rm(Math.abs(net))}`, label: `Net · as at ${dayWords(today)}` },
    chip: null,
    eyebrow: `Company Statement · as at ${dayWords(today)}`,
    cards: [
      { key: 'collect', tone: 'paid', icon: 'in', label: 'To collect', sub: `Principal ${f2(totals.collectPrincipal)} · Interest ${f2(totals.collectInterest)}`, value: rm(toCollect), groups: side('collect') },
      { key: 'repay', tone: 'approved', icon: 'out', label: 'To repay', sub: `Principal ${f2(totals.repayPrincipal)} · Interest ${f2(totals.repayInterest)}`, value: rm(toRepay), groups: side('repay') },
      {
        key: 'all',
        tone: 'all',
        icon: 'people',
        label: 'Counterparties',
        sub: plural(rows.length, 'counterparty', 'counterparties'),
        value: `${net >= 0 ? 'Collect' : 'Repay'} ${rm(Math.abs(net))}`,
        groups: [
          {
            key: 'all',
            title: 'Net by counterparty',
            count: String(rows.length),
            empty: 'Nothing open with anybody.',
            lines: rows.map((r) => ({
              key: `all:${r.counterparty}`,
              label: r.counterparty,
              sub: `Collect ${f2(r2(r.collectPrincipal + r.collectInterest))} · Repay ${f2(r2(r.repayPrincipal + r.repayInterest))}`,
              value: `${r.net >= 0 ? '' : '-'}${f2(Math.abs(r.net))}`,
              tone: r.net < 0 ? 'out' : 'ledger',
              detail: { title: r.counterparty, groups: [{ key: 'deals', title: 'Open deals', count: rm(Math.abs(r.net)), lines: r.items.map(positionLine) }] },
            })),
          },
        ],
      },
    ],
  }
}
