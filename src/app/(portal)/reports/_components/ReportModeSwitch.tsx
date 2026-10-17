import Link from 'next/link'

// Single month ｜ month by month, in the report's head (2026-10-09, the
// user's Claude Design handoff — it was the 单月 ｜ 逐月 strip under the
// head). The view on show is the primary button; switching keeps the month
// and the segment.

export type ReportModePair = 'pnl' | 'cash-flow' | 'receipt-payment'

const PAIRS: Record<ReportModePair, { single: string; monthly: string; singleLabel: string; monthlyLabel: string }> = {
  pnl: { single: '/reports/income-statement', monthly: '/reports/monthly-pnl', singleLabel: 'Single month · P&L', monthlyLabel: 'Monthly P&L' },
  'cash-flow': { single: '/reports/cash-flow', monthly: '/reports/monthly-cash-flow', singleLabel: 'Single month', monthlyLabel: 'Month by month' },
  'receipt-payment': {
    single: '/reports/receipt-payment',
    monthly: '/reports/monthly-receipt-payment',
    singleLabel: 'Single month',
    monthlyLabel: 'Month by month',
  },
}

export default function ReportModeSwitch({
  pair,
  active,
  period,
  segment,
}: {
  pair: ReportModePair
  active: 'single' | 'monthly'
  /** YYYY-MM — the other view opens on the same month. */
  period: string
  segment?: string
}) {
  const p = PAIRS[pair]
  const qs = `?period=${period}${segment ? `&segment=${segment}` : ''}`
  return (
    <div className="rpt-modes" role="group" aria-label="Report view">
      <Link href={`${p.single}${qs}`} aria-current={active === 'single' ? 'page' : undefined} className={active === 'single' ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
        {p.singleLabel}
      </Link>
      <Link href={`${p.monthly}${qs}`} aria-current={active === 'monthly' ? 'page' : undefined} className={active === 'monthly' ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
        {p.monthlyLabel}
      </Link>
    </div>
  )
}
