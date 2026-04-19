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
}

const COLORS = ['#a86c5e', '#7d6f56', '#4f5d4f', '#a89c83']

function fmtRm(value: number): string {
  if (value >= 1000) return `RM ${(value / 1000).toFixed(1)}k`
  return `RM ${value.toFixed(0)}`
}

export default function PnlCharts({ composition, trend }: Props) {
  const totalComp = composition.reduce((s, d) => s + d.value, 0)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="border border-hairline rounded-md bg-surface p-6">
        <h3 className="font-serif text-lg text-ink mb-1">Cost composition</h3>
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
                cy="50%"
                outerRadius={90}
                label={(props: { name?: string; percent?: number }) =>
                  `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {composition.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtRm(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border border-hairline rounded-md bg-surface p-6">
        <h3 className="font-serif text-lg text-ink mb-1">12-month trend</h3>
        <p className="font-serif italic text-graphite text-xs mb-4">Revenue vs total cost (expenses + OPEX)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend}>
            <XAxis dataKey="month" stroke="#8c7e62" fontSize={11} />
            <YAxis stroke="#8c7e62" fontSize={11} tickFormatter={fmtRm} />
            <Tooltip formatter={(v: number) => fmtRm(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" fill="#7d6f56" name="Revenue" />
            <Bar dataKey="cost" fill="#a86c5e" name="Total cost" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
