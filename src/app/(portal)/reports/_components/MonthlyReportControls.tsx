'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { REPORT_SEGMENTS } from './report-segments'

// Left-rail controls for the monthly matrix reports: "up to month" picker +
// a segment radio list with colour dots (mirrors the GL statements' rail).
// Navigates on change — no Apply button.
export default function MonthlyReportControls({
  period,
  segment,
}: {
  period: string
  segment: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const navigate = (next: { period?: string; segment?: string }) => {
    const qs = new URLSearchParams(sp.toString())
    if (next.period) qs.set('period', next.period)
    if (next.segment !== undefined) {
      if (next.segment) qs.set('segment', next.segment)
      else qs.delete('segment')
    }
    router.push(`${pathname}?${qs.toString()}`)
  }

  return (
    <aside className="shrink-0 w-52 space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted font-sans mb-2">Up to month</div>
        <input
          type="month"
          defaultValue={period}
          onChange={(e) => e.target.value && navigate({ period: e.target.value })}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        />
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-muted font-sans mb-2">Segment</div>
        <div className="space-y-0.5">
          {REPORT_SEGMENTS.map((s) => {
            const active = segment === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => navigate({ segment: s.value })}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                  active ? 'bg-accent-bg text-ink font-medium' : 'text-graphite hover:bg-surface-2'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full border ${active ? 'border-accent' : 'border-transparent'}`}
                >
                  <span className={`block w-full h-full rounded-full ${s.dot ?? 'bg-muted'}`} aria-hidden />
                </span>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
