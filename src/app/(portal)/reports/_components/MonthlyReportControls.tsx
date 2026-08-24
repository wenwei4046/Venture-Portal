'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { REPORT_SEGMENTS, type ReportSegmentOption } from './report-segments'
import { useReportSearch } from './ReportSearchProvider'

// Left-rail controls for the monthly matrix reports: "up to month" picker +
// a segment radio list with colour dots (mirrors the GL statements' rail).
// Navigates on change — no Apply button.
export default function MonthlyReportControls({
  period,
  segment,
  hideSegment = false,
  extraSegments = [],
}: {
  period: string
  segment: string
  // Dept managers are locked to their own segment (RLS) — hide the picker.
  hideSegment?: boolean
  /** Dynamically provisioned full departments (dept-registry), appended to
   *  the built-in rail. Server pages pass extraReportSegments(...). */
  extraSegments?: ReportSegmentOption[]
}) {
  const allSegments = [...REPORT_SEGMENTS, ...extraSegments]
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  // Present only when the page wraps its rail + matrix in ReportSearchProvider.
  const find = useReportSearch()
  const railBtn =
    'px-2 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'

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

      {find ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted font-sans mb-2">Find account</div>
          <div className="relative">
            <input
              type="search"
              value={find.search}
              onChange={(e) => find.setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  find.step(e.shiftKey ? -1 : 1)
                } else if (e.key === 'Escape') {
                  find.setSearch('')
                }
              }}
              placeholder="Code or name…"
              aria-label="Find account by code or name"
              className="search-plain w-full px-2.5 py-1.5 pr-7 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
            />
            {find.search ? (
              <button
                type="button"
                onClick={() => find.setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-danger font-mono text-sm px-1"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
          {find.search.trim() ? (
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="font-mono text-[11px] text-muted">
                {find.hitCount === 0
                  ? 'No match'
                  : `${find.activeHit + 1} / ${find.hitCount} match${find.hitCount === 1 ? '' : 'es'}`}
              </span>
              {find.hitCount > 0 ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => find.step(-1)} className={railBtn} aria-label="Previous match">
                    ‹
                  </button>
                  <button type="button" onClick={() => find.step(1)} className={railBtn} aria-label="Next match">
                    ›
                  </button>
                </span>
              ) : null}
            </div>
          ) : (
            <p className="font-serif italic text-muted text-[11px] mt-1.5 leading-snug">
              Highlights only — nothing is hidden, so every total still covers the full report.
            </p>
          )}
        </div>
      ) : null}

      {!hideSegment && (
      <div>
        <div className="text-xs uppercase tracking-wide text-muted font-sans mb-2">Segment</div>
        <div className="space-y-0.5">
          {allSegments.map((s) => {
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
      )}
    </aside>
  )
}
