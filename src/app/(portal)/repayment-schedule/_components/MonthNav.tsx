'use client'

import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'

// Month navigator for the Repayment Schedule — step back/forward a month or
// pick one, so Finance can review a past (or upcoming) month's schedule.
// 2026-10-09 (the Finance revamp): the handoff's pill beside the title —
// ← October 2026 → — the label opening a month picker, like Daily Bank's day.
// 2026-11-02 (the user: "帮我把日期选择器和export 做在这一排"): on the tabs' row,
// This month in the row's own button.
export default function MonthNav({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const router = useRouter()
  const go = (ym: string) => router.push(`/repayment-schedule?month=${ym}`)
  const prev = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
  const next = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="db-daynav">
        <button type="button" onClick={() => go(prev)} aria-label="Previous month" title="Previous month">
          ←
        </button>
        <span className="db-daynav-label">
          {dayjs(`${month}-01`).format('MMMM YYYY')}
          <input type="month" aria-label="Pick a month" value={month} onChange={(e) => e.target.value && go(e.target.value)} />
        </span>
        <button type="button" onClick={() => go(next)} aria-label="Next month" title="Next month">
          →
        </button>
      </div>
      {!isCurrent ? (
        <button type="button" onClick={() => go(officeMonth())} className="sch-tool-btn">
          This month
        </button>
      ) : null}
    </div>
  )
}
