'use client'

import { useRouter } from 'next/navigation'

interface Props {
  period: string
}

export default function PeriodPicker({ period }: Props) {
  const router = useRouter()
  const ym = period.slice(0, 7)

  return (
    <div className="flex items-center gap-3">
      <label className="font-sans text-xs uppercase tracking-wide text-muted">Period</label>
      <input
        type="month"
        defaultValue={ym}
        onChange={e => {
          const v = e.target.value
          if (/^\d{4}-\d{2}$/.test(v)) {
            router.push(`/hr-costing/payroll/${v}-01`)
          }
        }}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
    </div>
  )
}
