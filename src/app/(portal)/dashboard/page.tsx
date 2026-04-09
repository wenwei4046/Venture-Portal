import { requireAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

export default async function DashboardPage() {
  await requireAuth()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Treasury overview — HOUZS Venture Sdn Bhd</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Fund Pool', value: formatMoney(0), color: 'text-gray-900' },
          { label: 'Active Loans', value: '0', color: 'text-gray-900' },
          { label: 'Overdue Amount', value: formatMoney(0), color: 'text-red-600' },
          { label: 'Free Pool', value: formatMoney(0), color: 'text-green-600' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Placeholder for charts */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <p className="text-sm font-medium text-gray-700 mb-4">Fund Pool Composition</p>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-md">
          Chart — Phase 1 implementation
        </div>
      </div>
    </div>
  )
}
