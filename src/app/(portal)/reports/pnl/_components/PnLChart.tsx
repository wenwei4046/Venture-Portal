'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  revenue: number
  expenses: number
  netProfit: number
}

export default function PnLChart({ revenue, expenses, netProfit }: Props) {
  const data = [
    { name: 'Revenue', value: revenue },
    { name: 'Expenses', value: expenses },
    { name: 'Net Profit', value: netProfit },
  ]

  const colors = ['#3D6B45', '#A3371A', netProfit >= 0 ? '#3D6B45' : '#A3371A']

  return (
    <div className="h-[200px] mt-8 mb-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={48}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fontFamily: 'var(--font-serif)', fill: '#6B5F52' }}
            axisLine={{ stroke: '#DFD4BE' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#9E8F7F' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            formatter={(value: number) => [`RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`, '']}
            contentStyle={{
              background: '#FBF8F2',
              border: '1px solid #DFD4BE',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
