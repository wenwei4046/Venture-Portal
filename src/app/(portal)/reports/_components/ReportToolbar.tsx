'use client'

import dayjs from 'dayjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useReportSearch } from './ReportSearchProvider'
import type { ReportSegmentOption } from './report-segments'

/**
 * The month-by-month reports' control row (2026-10-09, the user's Claude
 * Design handoff): Period From – To, Find account, Segment and Detail level
 * on one row over the matrix. Navigates on change. Find and the level come
 * through ReportSearchProvider, which the matrix reads.
 */
export default function ReportToolbar({
  from,
  to,
  fromOptions,
  toOptions,
  segment,
  segments,
}: {
  from: string
  to: string
  fromOptions: string[]
  toOptions: string[]
  segment: string
  /** Empty = no segment choice. */
  segments: ReportSegmentOption[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const find = useReportSearch()

  const go = (next: { from?: string; to?: string; segment?: string }) => {
    const qs = new URLSearchParams(sp.toString())
    const t = next.to ?? to
    const jan = `${t.slice(0, 4)}-01`
    let f = next.from ?? from
    if (f.slice(0, 4) !== t.slice(0, 4) || f > t) f = jan
    qs.set('period', t)
    if (f === jan) qs.delete('from')
    else qs.set('from', f)
    if (next.segment !== undefined) {
      if (next.segment) qs.set('segment', next.segment)
      else qs.delete('segment')
    }
    router.push(`${pathname}?${qs.toString()}`)
  }
  const month = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
  // A To older than the list still shows as itself (an old link, a typed URL).
  const tos = toOptions.includes(to) ? toOptions : [...toOptions, to]

  return (
    <div className="rpt-toolbar" role="group" aria-label="Report controls">
      <div className="rpt-field">
        <span>Period</span>
        <div className="rpt-range">
          <select aria-label="From" value={from} onChange={(e) => go({ from: e.target.value })}>
            {fromOptions.map((ym) => (
              <option key={ym} value={ym}>
                {month(ym)}
              </option>
            ))}
          </select>
          <span aria-hidden>–</span>
          <select aria-label="To" value={to} onChange={(e) => go({ to: e.target.value })}>
            {tos.map((ym) => (
              <option key={ym} value={ym}>
                {month(ym)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {find ? (
        <div className="rpt-field rpt-find">
          <span>Find account</span>
          <div className="rpt-find-box">
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
              className="search-plain"
            />
            {find.search.trim() ? (
              <>
                <small>{find.hitCount === 0 ? 'No match' : `${find.activeHit + 1} / ${find.hitCount}`}</small>
                {find.hitCount > 0 ? (
                  <>
                    <button type="button" className="rpt-step" onClick={() => find.step(-1)} aria-label="Previous match">
                      ‹
                    </button>
                    <button type="button" className="rpt-step" onClick={() => find.step(1)} aria-label="Next match">
                      ›
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {segments.length > 0 ? (
        <div className="rpt-field">
          <span>Segment</span>
          <select aria-label="Segment" value={segment} onChange={(e) => go({ segment: e.target.value })}>
            {segments.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {find && find.level != null ? (
        <div className="rpt-field">
          <span>Detail level</span>
          <div className="rpt-levels">
            {([1, 2, 3] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={find.level === l}
                onClick={() => find.setLevel(l)}
                title={l === 1 ? 'Totals only' : l === 2 ? '+ top-level accounts' : 'All account levels'}
              >
                L{l}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
