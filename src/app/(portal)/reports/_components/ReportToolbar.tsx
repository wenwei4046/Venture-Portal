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
 *
 * 2026-10-10: a single month's statement picks its month "vs" a month to
 * compare (`mode="single"`); a balance reads "As at" one month (`"asat"`).
 * 2026-10-25: a department's page keeps its period in its own row over the
 * charts, so its statement's row has Find and the level alone (`"none"`).
 */
export default function ReportToolbar({
  mode = 'range',
  from = '',
  to = '',
  fromOptions = [],
  toOptions = [],
  period = '',
  compare = '',
  monthOptions = [],
  segment,
  segments,
}: {
  mode?: 'range' | 'single' | 'asat' | 'none'
  from?: string
  to?: string
  fromOptions?: string[]
  toOptions?: string[]
  /** single / asat: the month shown ('YYYY-MM'). */
  period?: string
  /** single: the month compared with, or ''. */
  compare?: string
  /** single / asat: the months to choose from, latest first. */
  monthOptions?: string[]
  segment: string
  /** Empty = no segment choice. */
  segments: Array<Pick<ReportSegmentOption, 'value' | 'label'>>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const find = useReportSearch()

  const go = (next: { from?: string; to?: string; segment?: string }) => {
    if (mode !== 'range') return goMonth({ segment: next.segment })
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
  // A single month or an As at: the month, the compare, the segment.
  const goMonth = (next: { period?: string; compare?: string; segment?: string }) => {
    const qs = new URLSearchParams(sp.toString())
    qs.set('period', next.period ?? period)
    const cmp = mode === 'single' ? (next.compare ?? compare) : ''
    if (cmp) qs.set('compare', cmp)
    else qs.delete('compare')
    if (next.segment !== undefined) {
      if (next.segment) qs.set('segment', next.segment)
      else qs.delete('segment')
    }
    router.push(`${pathname}?${qs.toString()}`)
  }
  const month = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
  // A To older than the list still shows as itself (an old link, a typed URL).
  const tos = toOptions.includes(to) ? toOptions : [...toOptions, to]
  const months = monthOptions.includes(period) ? monthOptions : [period, ...monthOptions]
  const compares = !compare || monthOptions.includes(compare) ? monthOptions : [...monthOptions, compare]

  return (
    <div className="rpt-toolbar" role="group" aria-label="Report controls">
      {mode === 'range' ? (
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
            <span className="rpt-range-word">to</span>
            <select aria-label="To" value={to} onChange={(e) => go({ to: e.target.value })}>
              {tos.map((ym) => (
                <option key={ym} value={ym}>
                  {month(ym)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : mode === 'none' ? null : (
        <div className="rpt-field">
          <span>{mode === 'asat' ? 'As at' : 'Period'}</span>
          <div className="rpt-range">
            <select aria-label={mode === 'asat' ? 'As at' : 'Period'} value={period} onChange={(e) => goMonth({ period: e.target.value })}>
              {months.map((ym) => (
                <option key={ym} value={ym}>
                  {month(ym)}
                </option>
              ))}
            </select>
            {mode === 'single' ? (
              <>
                <span className="rpt-range-word">vs</span>
                <select aria-label="Compare" value={compare} onChange={(e) => goMonth({ compare: e.target.value })}>
                  <option value="">No compare</option>
                  {compares.map((ym) => (
                    <option key={ym} value={ym}>
                      {month(ym)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        </div>
      )}

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
            {/* L4 where the accounts open onto their lines (2026-10-26): every one opened so. */}
            {([1, 2, 3, 4] as const)
              .filter((l) => l <= find.levels)
              .map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={find.level === l}
                  onClick={() => find.setLevel(l)}
                  title={l === 1 ? 'Totals only' : l === 2 ? '+ top-level accounts' : l === 3 ? 'All account levels' : '+ every line, under its month'}
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
