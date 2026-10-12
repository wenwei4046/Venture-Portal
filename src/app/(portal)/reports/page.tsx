import { requirePermission, requirePage } from '@/lib/auth'
import Link from 'next/link'

// Each card is its report's name alone (2026-10-12, user: the descriptions made
// the view messy).
const reports = [
  { href: '/reports/cash-flow', title: 'Cash Flow' },
  { href: '/reports/income-statement', title: 'Income Statement' },
  { href: '/reports/balance-sheet', title: 'Balance Sheet' },
  { href: '/reports/trial-balance', title: 'Trial Balance' },
  { href: '/reports/ledger', title: 'General Ledger' },
  // Fund Summary + Claims Summary removed from the index (user 2026-09-15);
  // /reports/fund-summary and /reports/claims still resolve by URL.
  { href: '/reports/base-rate', title: 'Base Rate History' },
  { href: '/reports/debtor-aging', title: 'Debtor Aging' },
  { href: '/reports/loan-aging', title: 'Loan Aging' },
  { href: '/reports/company-statement', title: 'Company Statement' },
]

export default async function ReportsPage() {
  await requirePage('/reports')
  await requirePermission('reports', 'hr_costing')

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
            <h2 className="font-serif text-xl text-ink">{r.title}</h2>
          </Link>
        ))}
      </div>
    </div>
  )
}
