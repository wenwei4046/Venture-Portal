import { requireRole } from '@/lib/auth'
import Link from 'next/link'

const reports = [
  {
    href: '/reports/cash-flow',
    title: 'Cash Flow',
    description: 'CFO view — money in, dept-level outflow, group general expenses. Categories follow Settings labels.',
  },
  {
    href: '/reports/income-statement',
    title: 'Income Statement',
    description: 'Per-department P&L (revenue − cost = margin) plus group general expenses and net profit.',
  },
  {
    href: '/reports/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, Liabilities, Equity at a point in time. Retained earnings is YTD net profit.',
  },
  {
    href: '/reports/trial-balance',
    title: 'Trial Balance',
    description: 'Snapshot of every GL account at a date. Σ Dr = Σ Cr.',
  },
  {
    href: '/reports/ledger',
    title: 'General Ledger',
    description: 'Per-account journal lines with running balance over a period.',
  },
  {
    href: '/reports/fund-summary',
    title: 'Fund Summary',
    description: 'Paid capital, free capital, allocated, free cash.',
  },
  {
    href: '/reports/base-rate',
    title: 'Base Rate History',
    description: 'Quarterly weighted cost + margin = base rate over time.',
  },
  {
    href: '/reports/claims',
    title: 'Claims Summary',
    description: 'Benefit and pool claims by status and amount.',
  },
  {
    href: '/reports/debtor-aging',
    title: 'Debtor Aging',
    description: 'Invoices billed but not yet collected, bucketed by days past due.',
  },
  {
    href: '/reports/loan-aging',
    title: 'Loan Monitor',
    description: 'This-month dues not yet settled (both ways) + outstanding balances, scheduled vs undecided.',
  },
  {
    href: '/reports/company-statement',
    title: 'Company Statement',
    description: '每家往来对象：我还要还 / 我还要收 — 本金利息分开，明细像银行 statement，显示几时还完。',
  },
]

export default async function ReportsPage() {
  await requireRole(['principal', 'finance', 'hr'])

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CONSOLIDATED
          </div>
          <h1 className="page-title">Reports</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {reports.map(r => (
          <Link
            key={r.href}
            href={r.href}
            className="block border border-hairline rounded-md bg-surface p-6 hover:bg-surface-2/40 transition-colors"
          >
            <h2 className="font-serif text-xl text-ink mb-1">{r.title}</h2>
            <p className="font-serif italic text-graphite text-sm">{r.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
