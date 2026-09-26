'use client'

// Query-string flavour of the payroll PeriodPicker — director-salary routes
// carry the month as ?period=YYYY-MM instead of a path segment. Navigates on
// change so the page (and every link on it, incl. Import InfoTech) always
// matches the picked month. Replaces the old bare <form>, which only
// navigated on Enter and silently left the page on the previous month.

import { useRouter } from 'next/navigation'

interface Props {
  period: string
  /** Route the picker navigates within, e.g. '/director-salary'. */
  basePath: string
  /** Extra query appended after period, e.g. '&tab=submission'. */
  extraQuery?: string
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function DirectorPeriodPicker({ period, basePath, extraQuery = '' }: Props) {
  const router = useRouter()
  const ym = period.slice(0, 7)

  const go = (v: string) => {
    if (/^\d{4}-\d{2}$/.test(v)) {
      router.push(`${basePath}?period=${v}${extraQuery}`)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-medium uppercase tracking-[0.06em] mr-1">Period</label>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => go(shiftMonth(ym, -1))}
        className="px-2.5 py-2 bg-surface hover:bg-surface-2 border border-hairline hover:border-accent-border rounded-control text-sm text-ink transition-colors"
      >
        ‹
      </button>
      <input
        type="month"
        key={ym}
        defaultValue={ym}
        onChange={e => go(e.target.value)}
        className="px-3 py-2 bg-surface border border-hairline rounded-control text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <button
        type="button"
        aria-label="Next month"
        onClick={() => go(shiftMonth(ym, 1))}
        className="px-2.5 py-2 bg-surface hover:bg-surface-2 border border-hairline hover:border-accent-border rounded-control text-sm text-ink transition-colors"
      >
        ›
      </button>
    </div>
  )
}
