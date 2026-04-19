'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Props {
  data: { month: string; opex: number }[]
}

function fmtRm(value: number): string {
  if (value >= 1000) return `RM ${(value / 1000).toFixed(1)}k`
  return `RM ${value.toFixed(0)}`
}

export default function OpexTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <XAxis dataKey="month" stroke="#8c7e62" fontSize={11} />
        <YAxis stroke="#8c7e62" fontSize={11} tickFormatter={fmtRm} />
        <Tooltip formatter={(v: number) => fmtRm(v)} />
        <Bar dataKey="opex" fill="#a86c5e" name="OPEX" />
      </BarChart>
    </ResponsiveContainer>
  )
}
