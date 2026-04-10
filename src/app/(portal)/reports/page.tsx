import { requireRole } from '@/lib/auth'
import Link from 'next/link'

const reports = [
  {
    href: '/reports/pnl',
    title: 'HV Profit & Loss',
    description: 'Revenue vs expenses. Monthly, quarterly, or yearly view.',
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
    description: 'Benefit and project claims by status and amount.',
  },
]

export default async function ReportsPage() {
  await requireRole(['principal', 'finance', 'hr'])

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Reports</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          财务报表。<em>All modules consolidated.</em>
        </p>
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
