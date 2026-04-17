'use client'

import { useState } from 'react'
import PayrollRow from './PayrollRow'

export interface PayrollRowData {
  id: string
  staff_name: string
  dept_name: string
  status: string
  source: string
  basic_salary: number
  statutory_allowance: number
  non_statutory_allowance: number
  ot_hours: number
  ot_amount: number
  commission_amount: number
  unpaid_leave_days: number
  prorata_days_worked: number
  prorata_days_in_month: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  gross: number
  net: number
}

interface Props {
  rows: PayrollRowData[]
}

export default function PayrollGrid({ rows }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="mb-12">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="text-left py-3 pr-3 font-medium">Name</th>
              <th className="text-left py-3 pr-3 font-medium">Dept</th>
              <th className="text-right py-3 pr-3 font-medium">Basic</th>
              <th className="text-right py-3 pr-3 font-medium">Stat. Allow.</th>
              <th className="text-right py-3 pr-3 font-medium">Non-Stat.</th>
              <th className="text-right py-3 pr-3 font-medium">OT</th>
              <th className="text-right py-3 pr-3 font-medium">Comm.</th>
              <th className="text-right py-3 pr-3 font-medium">Unpaid</th>
              <th className="text-right py-3 pr-3 font-medium">Gross</th>
              <th className="text-right py-3 pr-3 font-medium">Net</th>
              <th className="text-right py-3 pr-2 font-medium w-14"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <PayrollRow
                key={r.id}
                row={r}
                expanded={expandedId === r.id}
                onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-serif italic text-muted text-xs mt-4">
        Click the row arrow to see the full pro-rata + statutory breakdown. Edit values inline, click Save on the row. Statutory re-computes automatically.
      </p>
    </div>
  )
}
