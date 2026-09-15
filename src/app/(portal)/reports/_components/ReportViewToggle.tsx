import Link from 'next/link'

// 单月 ｜ 逐月 switch (user 2026-09-15: "把一个月一个月的和 monthly 的放在一
// 起"). Each of the three statement pairs — single-period page vs month-by-
// month matrix — shows this strip under its page head; switching keeps the
// period and department the user already picked. The sidebar lists only the
// single-period page of each pair now.

export type ReportPair = 'pnl' | 'cash-flow' | 'receipt-payment'

const PAIRS: Record<ReportPair, { single: string; monthly: string; singleLabel: string; monthlyLabel: string }> = {
  pnl: {
    single: '/reports/income-statement',
    monthly: '/reports/monthly-pnl',
    singleLabel: '单月 · P&L',
    monthlyLabel: '逐月 · Monthly P&L',
  },
  'cash-flow': {
    single: '/reports/cash-flow',
    monthly: '/reports/monthly-cash-flow',
    singleLabel: '单月 · Cash Flow',
    monthlyLabel: '逐月 · Monthly Cash Flow',
  },
  'receipt-payment': {
    single: '/reports/receipt-payment',
    monthly: '/reports/monthly-receipt-payment',
    singleLabel: '单月 · Receipt & Payment',
    monthlyLabel: '逐月 · Monthly R&P',
  },
}

export default function ReportViewToggle({
  pair,
  active,
  period,
  segment,
}: {
  pair: ReportPair
  active: 'single' | 'monthly'
  /** YYYY-MM — carried across so the other view opens on the same month. */
  period: string
  segment?: string
}) {
  const p = PAIRS[pair]
  const qs = `?period=${period}${segment ? `&segment=${segment}` : ''}`
  const pill = (on: boolean) =>
    `px-3 py-1.5 text-sm font-serif italic transition-colors ${
      on ? 'bg-accent text-white' : 'bg-surface text-graphite hover:text-ink hover:bg-surface-2'
    }`
  return (
    <div className="inline-flex rounded-md border border-hairline overflow-hidden mb-6" role="tablist" aria-label="Report view">
      <Link href={`${p.single}${qs}`} role="tab" aria-selected={active === 'single'} className={pill(active === 'single')}>
        {p.singleLabel}
      </Link>
      <Link href={`${p.monthly}${qs}`} role="tab" aria-selected={active === 'monthly'} className={pill(active === 'monthly')}>
        {p.monthlyLabel}
      </Link>
    </div>
  )
}
