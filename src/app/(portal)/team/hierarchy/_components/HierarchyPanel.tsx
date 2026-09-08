'use client'

import { useMemo, useState } from 'react'
import type { Rung } from '@/lib/ladder'
import type { ChartPerson } from './TeamOrgChart'

/**
 * Somebody the commission engine holds an open position for.
 *
 * Declared here because this is where the panel's own contract lives; the tree
 * itself is now drawn by `RevenueOrgChart`, which imports this type.
 */
export interface SalesPerson {
  staffId: string
  name: string
  uplineStaffId: string | null
  rankId: string | null
  /** "Rank B" — the rung's label, a trigger-kept copy of its rank's. */
  rankLabel: string | null
  /** "8%" — already formatted; the panel does no arithmetic. */
  rateLabel: string | null
  schemeId: string
  /** Their department on the staff record, so the rail can answer the same
   *  department chips the canvas does. Commission is a Revenue Department
   *  concept today, which is exactly why the rail has to say so out loud when
   *  another department is in focus rather than sit there unchanged. */
  department: string | null
}

/** A rank a table cell may pick, inside one scheme. */
export interface RankOption {
  id: string
  label: string
  rateLabel: string
  sortOrder: number
}

/**
 * The panel beside the graph.
 *
 * The ladder used to be the tab you had to leave the chart to open, and is now
 * next to it (user, 2026-09-07) — it is read WHILE looking at the graph, and a
 * tab would put it back where it was, one view remembered rather than seen.
 * It folds away when the canvas needs the width.
 *
 * The salespeople were a flat list here until the user rejected it: a list can
 * say a hierarchy exists but not what shape it is, and the shape is the whole
 * question. Their tree is now a chart of its own — `RevenueOrgChart`, in the
 * column between the canvas and this panel.
 */
export default function HierarchyPanel({
  rungs,
  titles,
  breaks,
  people,
  onLevels,
  onFocus,
}: {
  rungs: Rung[]
  titles: Array<{ id: string; name: string; levelId: string | null; people: number; isActive: boolean }>
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: Array<{ id: string; managerId: string }>
  people: ChartPerson[]
  onLevels: () => void
  /** Highlight somebody on the canvas. Null clears it. */
  onFocus: (staffId: string | null) => void
}) {
  const [rulesOpen, setRulesOpen] = useState(true)

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  const rungsTopDown = useMemo(() => [...rungs].sort((a, b) => b.rank - a.rank), [rungs])
  const titleCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of titles) {
      if (!t.levelId || !t.isActive) continue
      map.set(t.levelId, (map.get(t.levelId) ?? 0) + 1)
    }
    return map
  }, [titles])

  return (
    <aside className="w-full space-y-4">
      <Section
        label="Rules"
        count={breaks.length > 0 ? `${breaks.length} BROKEN` : `${rungs.length} RUNGS`}
        tone={breaks.length > 0 ? 'alert' : undefined}
        open={rulesOpen}
        onToggle={() => setRulesOpen(o => !o)}
      >
        <p className="px-3 pt-3 pb-2 font-serif italic text-muted text-xs leading-relaxed">
          Nobody may be put under a title the ladder ranks below theirs. One scale for the whole
          company, most senior first.
        </p>
        <ol className="px-3 pb-2">
          {rungsTopDown.map(r => (
            <li
              key={r.id}
              className="flex items-baseline gap-2 py-1 border-b border-hairline last:border-0"
            >
              <span className="font-mono text-[10px] text-muted w-5 shrink-0">L{r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-ink">
                {r.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted">
                {titleCount.get(r.id) ?? 0}
              </span>
            </li>
          ))}
        </ol>

        {breaks.length > 0 ? (
          <div className="px-3 py-2 border-t border-hairline">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-alert mb-1.5">
              Lines the ladder would refuse
            </div>
            {/* A ladder edited after the chart was drawn leaves these behind:
                the trigger only checks a line when it is drawn, so it never
                goes back over the ones already there. */}
            <ul className="space-y-1">
              {breaks.slice(0, 6).map(b => (
                <li key={`${b.id}-${b.managerId}`}>
                  <button
                    type="button"
                    onClick={() => onFocus(b.id)}
                    className="text-left font-serif italic text-xs text-graphite hover:text-ink"
                  >
                    {byId.get(b.id)?.name ?? 'somebody'} under{' '}
                    {byId.get(b.managerId)?.name ?? 'somebody'}
                  </button>
                </li>
              ))}
            </ul>
            {breaks.length > 6 ? (
              <p className="mt-1 font-mono text-[10px] text-muted">
                and {breaks.length - 6} more
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="px-3 py-2 border-t border-hairline">
          <button
            type="button"
            onClick={onLevels}
            className="font-serif italic text-xs text-accent hover:underline"
          >
            Edit the ladder →
          </button>
        </div>
      </Section>
    </aside>
  )
}

/**
 * One folding section of the panel. The header strip is the mono-uppercase
 * label the app uses for a rail's own heading, so the aside reads as chrome
 * for the canvas rather than as a second page next to it.
 */
function Section({
  label,
  count,
  tone,
  open,
  onToggle,
  children,
}: {
  label: string
  count: string
  tone?: 'alert'
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="border border-hairline rounded-card bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-hairline hover:bg-surface-2/60 transition-colors"
      >
        <span
          className={`font-mono text-[9px] text-muted transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        >
          ▼
        </span>
        <span className="flex-1 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <span
          className={`font-mono text-[10px] ${tone === 'alert' ? 'text-alert' : 'text-muted'}`}
        >
          {count}
        </span>
      </button>
      {open ? children : null}
    </section>
  )
}
