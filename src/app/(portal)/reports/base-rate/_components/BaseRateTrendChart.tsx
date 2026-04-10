'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  quarter: string
  baseRate: number
  weightedCost: number
}

export default function BaseRateTrendChart({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null

  return (
    <div className="h-[200px] mb-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#9E8F7F' }}
            axisLine={{ stroke: '#DFD4BE' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#9E8F7F' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(2)}%`}
            domain={['dataMin - 0.001', 'dataMax + 0.001']}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${(value * 100).toFixed(3)}%/mo`,
              name === 'baseRate' ? 'Base Rate' : 'Weighted Cost',
            ]}
            contentStyle={{
              background: '#FBF8F2',
              border: '1px solid #DFD4BE',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <Line
            type="monotone"
            dataKey="baseRate"
            stroke="#CC5A2E"
            strokeWidth={2}
            dot={{ r: 3, fill: '#CC5A2E' }}
          />
          <Line
            type="monotone"
            dataKey="weightedCost"
            stroke="#6B5F52"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={{ r: 2, fill: '#6B5F52' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
