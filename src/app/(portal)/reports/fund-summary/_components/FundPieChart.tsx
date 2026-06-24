'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Slice {
  name: string
  value: number
}

interface Props {
  slices: Slice[]
}

const COLORS = ['#CC5A2E', '#3D6B45', '#A07020', '#5A6B8A', '#6B5F52', '#9E8F7F']

export default function FundPieChart({ slices }: Props) {
  const filtered = slices.filter(s => s.value > 0)
  if (filtered.length === 0) return null

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            strokeWidth={1}
            stroke="#FBF8F2"
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
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
          <Legend
            wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-sans)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
