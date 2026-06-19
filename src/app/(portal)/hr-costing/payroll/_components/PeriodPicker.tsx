'use client'

import { useRouter } from 'next/navigation'

interface Props {
  period: string
  /** Appended to the period URL — e.g. '/import' keeps you on the import
   *  page while switching months. Defaults to the grid. */
  suffix?: string
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function PeriodPicker({ period, suffix = '' }: Props) {
  const router = useRouter()
  const ym = period.slice(0, 7)

  const go = (v: string) => {
    if (/^\d{4}-\d{2}$/.test(v)) {
      router.push(`/hr-costing/payroll/${v}-01${suffix}`)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="font-sans text-xs uppercase tracking-wide text-muted mr-1">Period</label>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => go(shiftMonth(ym, -1))}
        className="px-2 py-2 bg-paper border border-hairline rounded-md text-sm text-graphite hover:text-accent hover:border-accent-border transition-colors"
      >
        ‹
      </button>
      <input
        type="month"
        key={ym}
        defaultValue={ym}
        onChange={e => go(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <button
        type="button"
        aria-label="Next month"
        onClick={() => go(shiftMonth(ym, 1))}
        className="px-2 py-2 bg-paper border border-hairline rounded-md text-sm text-graphite hover:text-accent hover:border-accent-border transition-colors"
      >
        ›
      </button>
    </div>
  )
}
