'use client'

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface CompositionDatum {
  name: string
  value: number
}

interface TrendDatum {
  month: string
  revenue: number
  cost: number
}

interface Props {
  composition: CompositionDatum[]
  trend: TrendDatum[]
  // Optional overrides for the trend bars. Defaults match Marketing's P&L:
  // {revenue: 'Revenue', cost: 'Total cost'}. Pass custom labels to repurpose
  // for views like "Venture Pool In" where the bars represent In/Out.
  trendLabels?: { revenue: string; cost: string }
  compositionTitle?: string
  trendTitle?: string
  trendSubtitle?: string
}

const COLORS = ['#a86c5e', '#7d6f56', '#4f5d4f', '#a89c83']

function fmtRm(value: number): string {
  if (value >= 1000) return `RM ${(value / 1000).toFixed(1)}k`
  return `RM ${value.toFixed(0)}`
}

export default function PnlCharts({
  composition,
  trend,
  trendLabels,
  compositionTitle = 'Cost composition',
  trendTitle = '12-month trend',
  trendSubtitle = 'Revenue vs total cost (expenses + OPEX)',
}: Props) {
  const revenueLabel = trendLabels?.revenue ?? 'Revenue'
  const costLabel = trendLabels?.cost ?? 'Total cost'
  const totalComp = composition.reduce((s, d) => s + d.value, 0)
  const nonZeroMonths = trend.filter((t) => t.revenue > 0 || t.cost > 0).length
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="border border-hairline rounded-md bg-surface p-6">
        <h3 className="font-serif text-lg text-ink mb-1">{compositionTitle}</h3>
        <p className="font-serif italic text-graphite text-xs mb-4">This month</p>
        {totalComp === 0 ? (
          <p className="font-serif italic text-muted text-sm py-12 text-center">No costs this month.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={composition}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={80}
                label={(props: { percent?: number }) =>
                  `${((props.percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {composition.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtRm(v)} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border border-hairline rounded-md bg-surface p-6">
        <h3 className="font-serif text-lg text-ink mb-1">{trendTitle}</h3>
        <p className="font-serif italic text-graphite text-xs mb-4">
          {trendSubtitle}
          {nonZeroMonths > 0 && nonZeroMonths < 12 ? (
            <span className="text-muted"> · {nonZeroMonths} of 12 months have data</span>
          ) : null}
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend}>
            <XAxis dataKey="month" stroke="#8c7e62" fontSize={11} />
            <YAxis stroke="#8c7e62" fontSize={11} tickFormatter={fmtRm} />
            <Tooltip formatter={(v: number) => fmtRm(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" fill="#7d6f56" name={revenueLabel} />
            <Bar dataKey="cost" fill="#a86c5e" name={costLabel} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
