'use client'

import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'

// Month navigator for the Repayment Schedule — step back/forward a month or
// pick one, so Finance can review a past (or upcoming) month's schedule.
export default function MonthNav({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const router = useRouter()
  const go = (ym: string) => router.push(`/repayment-schedule?month=${ym}`)
  const prev = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
  const next = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')

  const btn =
    'px-2.5 py-2 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-graphite hover:text-ink transition-colors text-sm leading-none'

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button onClick={() => go(prev)} className={btn} aria-label="Previous month" title="Previous month">←</button>
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <button onClick={() => go(next)} className={btn} aria-label="Next month" title="Next month">→</button>
      {!isCurrent && (
        <button
          onClick={() => go(officeMonth())}
          className="px-3 py-2 text-accent hover:text-accent-hover text-sm font-sans transition-colors"
        >
          This month
        </button>
      )}
    </div>
  )
}
