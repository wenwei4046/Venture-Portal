// Presentation structure for the GL-driven statements, shared by the pages
// (GlReportView) AND the xlsx/pdf export routes — one source of truth for
// section order, subtotal rows, and labels, so the screen and the files can
// never drift apart.

import type {
  AccountNode,
  BalanceSheetReport,
  CashFlowReport,
  PnlReport,
  ReportSection,
} from './gl-reports'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface SummaryRow {
  label: string
  current: number
  previous: number
  /** Optional sub-line under the label, e.g. "38.5% gross margin". */
  sub?: string
  emphasis?: 'normal' | 'strong'
  tone?: 'ledger' | 'danger' | 'auto'
}

export type ReportBlock =
  | { kind: 'section'; section: ReportSection }
  | { kind: 'summary'; row: SummaryRow }

export function deltaPct(current: number, previous: number): string {
  if (Math.abs(previous) < 0.005) return '—'
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export function pctOf(n: number, base: number): string {
  if (Math.abs(base) < 0.005) return '—'
  return `${((n / base) * 100).toFixed(1)}%`
}

// ─── Block builders (one per statement) ──────────────────────────────────────

export function pnlBlocks(pnl: PnlReport): ReportBlock[] {
  const margin = (n: number) =>
    Math.abs(pnl.revenue.current) < 0.005 ? undefined : `${((n / pnl.revenue.current) * 100).toFixed(1)}%`
  const gm = margin(pnl.grossProfit.current)
  const nm = margin(pnl.netIncome.current)
  return [
    { kind: 'section', section: pnl.revenue },
    {
      kind: 'summary',
      row: { label: 'Total Revenue', current: pnl.revenue.current, previous: pnl.revenue.previous, emphasis: 'strong', tone: 'ledger' },
    },
    { kind: 'section', section: pnl.cost },
    {
      kind: 'summary',
      row: {
        label: 'Gross Profit',
        current: pnl.grossProfit.current,
        previous: pnl.grossProfit.previous,
        sub: gm ? `${gm} gross margin` : undefined,
        emphasis: 'strong',
        tone: 'auto',
      },
    },
    { kind: 'section', section: pnl.otherIncome },
    {
      kind: 'summary',
      row: { label: 'Total Other Income', current: pnl.otherIncome.current, previous: pnl.otherIncome.previous, tone: 'ledger' },
    },
    { kind: 'section', section: pnl.expense },
    {
      kind: 'summary',
      row: { label: 'Total Expenses', current: pnl.expense.current, previous: pnl.expense.previous, tone: 'danger' },
    },
    {
      kind: 'summary',
      row: {
        label: 'Net Income / (Loss)',
        current: pnl.netIncome.current,
        previous: pnl.netIncome.previous,
        sub: nm ? `${nm} net margin` : undefined,
        emphasis: 'strong',
        tone: 'auto',
      },
    },
  ]
}

export function balanceSheetBlocks(bs: BalanceSheetReport, segment?: string): ReportBlock[] {
  // Surface cumulative earnings as a row inside Equity so the sheet ties.
  const equityWithEarnings: ReportSection = {
    ...bs.equity,
    nodes: [
      ...bs.equity.nodes,
      {
        code: '—',
        name: 'Retained & current earnings (cumulative P&L)',
        current: bs.earnings.current,
        previous: bs.earnings.previous,
        txns: [],
        children: [],
      },
    ],
    current: r2(bs.equity.current + bs.earnings.current),
    previous: r2(bs.equity.previous + bs.earnings.previous),
  }
  return [
    ...(bs.fixedAssets.nodes.length > 0
      ? ([{ kind: 'section', section: bs.fixedAssets }] as ReportBlock[])
      : []),
    { kind: 'section', section: bs.assets },
    {
      kind: 'summary',
      row: { label: 'Total Assets', current: bs.totalAssets.current, previous: bs.totalAssets.previous, emphasis: 'strong', tone: 'ledger' },
    },
    { kind: 'section', section: bs.liabilities },
    {
      kind: 'summary',
      row: { label: 'Total Liabilities', current: bs.liabilities.current, previous: bs.liabilities.previous },
    },
    { kind: 'section', section: equityWithEarnings },
    {
      kind: 'summary',
      row: {
        label: 'Total Liabilities & Equity',
        current: bs.totalLiabEquity.current,
        previous: bs.totalLiabEquity.previous,
        emphasis: 'strong',
        tone: 'ledger',
      },
    },
    ...(Math.abs(bs.check.current) > 0.005 || Math.abs(bs.check.previous) > 0.005
      ? ([
          {
            kind: 'summary',
            row: {
              label: segment ? 'Segment imbalance (expected with a segment filter)' : '⚠ Out of balance (Assets − L&E)',
              current: bs.check.current,
              previous: bs.check.previous,
              tone: 'danger',
            },
          },
        ] as ReportBlock[])
      : []),
  ]
}

// 收钱先、出钱后 (user 2026-07-30). Accounts are listed flat under each side —
// no Operating/Investing/Financing sub-grouping — and an account that both
// received and paid appears on BOTH sides with its own gross figure and its own
// drill-down (bank-statement style). 流入合计 + 流出合计 = Net change, so the
// statement still ties to the bank movement.
export function cashFlowBlocks(
  cf: CashFlowReport,
  /** Optional user-arranged sections per side (lib/cash-flow-sections). When
   *  omitted each side renders as one section, exactly as before. */
  custom?: { inflow?: ReportSection[]; outflow?: ReportSection[] },
): ReportBlock[] {
  // Each custom section carries its own subtotal (user 2026-07-30: "general
  // expense 少掉一个 total"). Skipped when a side has a single section — the
  // side total right below would just repeat it.
  const sideBlocks = (sections: ReportSection[] | undefined, fallback: ReportSection): ReportBlock[] => {
    if (!sections || sections.length === 0) return [{ kind: 'section', section: fallback }]
    if (sections.length === 1) return [{ kind: 'section', section: sections[0] }]
    return sections.flatMap((s) => [
      { kind: 'section', section: s } as ReportBlock,
      {
        kind: 'summary',
        row: { label: `${s.label} — 小计`, current: s.current, previous: s.previous, tone: 'auto' },
      } as ReportBlock,
    ])
  }

  return [
    ...sideBlocks(custom?.inflow, cf.inflow),
    {
      kind: 'summary',
      row: {
        label: '流入合计 · Total money in',
        current: cf.inflow.current,
        previous: cf.inflow.previous,
        tone: 'ledger',
        emphasis: 'strong',
      },
    },
    ...sideBlocks(custom?.outflow, cf.outflow),
    {
      kind: 'summary',
      row: {
        label: '流出合计 · Total money out',
        current: cf.outflow.current,
        previous: cf.outflow.previous,
        tone: 'auto',
        emphasis: 'strong',
      },
    },
    {
      kind: 'summary',
      row: { label: 'Net change in cash', current: cf.netChange.current, previous: cf.netChange.previous, emphasis: 'strong', tone: 'auto' },
    },
    {
      kind: 'summary',
      row: { label: 'Opening cash', current: cf.openingCash.current, previous: cf.openingCash.previous },
    },
    {
      kind: 'summary',
      row: { label: 'Closing cash', current: cf.closingCash.current, previous: cf.closingCash.previous, emphasis: 'strong', tone: 'ledger' },
    },
    ...(Math.abs(cf.check.current) > 0.005 || Math.abs(cf.check.previous) > 0.005
      ? ([
          {
            kind: 'summary',
            row: {
              label: '⚠ Uncategorised cash movement (closing − opening − net change)',
              current: cf.check.current,
              previous: cf.check.previous,
              tone: 'danger',
            },
          },
        ] as ReportBlock[])
      : []),
  ]
}

// ─── Flattener for exports (xlsx rows / pdf table rows) ──────────────────────

export interface FlatGlReport {
  headerRow: string[]
  rows: (string | number | null)[][]
  /** afterRow indices for buildXlsxBuffer sectionBreaks. */
  sectionBreaks: { afterRow: number; title: string }[]
}

/** Serialise blocks into flat rows: Account | current | [compare | Δ%] | (% Rev).
 *  Account groups are depth-indented; summary rows carry their sub-label.
 *  `withCompare: false` drops the comparison + Δ% columns (single-month view). */
export function flattenGlReport(
  blocks: ReportBlock[],
  opts: { pctBase?: number; withCompare?: boolean },
): FlatGlReport {
  const withPct = opts.pctBase !== undefined
  const withCompare = opts.withCompare !== false
  const rows: (string | number | null)[][] = []
  const sectionBreaks: { afterRow: number; title: string }[] = []

  const cells = (label: string, current: number, previous: number): (string | number | null)[] => [
    label,
    current,
    ...(withCompare ? [previous, deltaPct(current, previous)] : []),
    ...(withPct ? [pctOf(current, opts.pctBase!)] : []),
  ]

  const pushNode = (n: AccountNode, depth: number) => {
    rows.push(
      cells(`${'    '.repeat(depth)}${n.code === '—' ? '' : `${n.code} `}${n.name}`, n.current, n.previous),
    )
    for (const c of n.children) pushNode(c, depth + 1)
  }

  for (const b of blocks) {
    if (b.kind === 'section') {
      sectionBreaks.push({ afterRow: rows.length, title: b.section.label })
      for (const n of b.section.nodes) pushNode(n, 0)
    } else {
      const label = b.row.sub ? `${b.row.label} (${b.row.sub})` : b.row.label
      rows.push(cells(label, b.row.current, b.row.previous))
    }
  }

  return {
    headerRow: [], // caller supplies labels (period names differ per report)
    rows,
    sectionBreaks,
  }
}
