'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  forbiddenTargets,
  refusalLabel,
  treeGroups,
  type MoveSubject,
  type RefusalKind,
} from '@/lib/commission/chart-moves'
import type { OrgNodeInput } from '@/lib/org-layout'
import type { OrgPerson, OrgRank } from './OrgChart'

/** Where the popover hangs from — the card's Upline row, or the selection bar's button. */
export interface PopAnchor {
  left: number
  top: number
  bottom: number
}

export interface MovePopoverProps {
  mover: OrgPerson
  people: OrgPerson[]
  ranks: OrgRank[]
  /** The commission graph: decides who is a downline. */
  graph: OrgNodeInput[]
  /** The layout graph: decides which tree a row is listed under. */
  layoutGraph: OrgNodeInput[]
  anchor: PopAnchor
  /**
   * A target already chosen by a drop. The popover then only confirms the
   * rank — an unplaced person dropped on a manager still has to be given
   * one, because `comm_hierarchy.rank_id` is NOT NULL and no rank can be
   * invented for them.
   */
  placeUnder?: string | null
  onPick: (uplineStaffId: string | null, rankId: string) => void
  onClose: () => void
}

export function subjectOf(p: OrgPerson): MoveSubject {
  return {
    staffId: p.staffId,
    name: p.name,
    titleName: p.titleName,
    rankLabel: p.rankLabel,
    placed: p.rankId !== null,
    canRecruit: p.canRecruit,
  }
}

/**
 * The rank an unplaced person is offered first: the lowest rung of the title
 * they hold — the same answer `titlePosition` gives — or the ladder's bottom
 * rung when their title is not on it.
 */
export function defaultRankFor(ranks: readonly OrgRank[], titleId: string | null): OrgRank | null {
  const ordered = [...ranks].sort((a, b) => a.sortOrder - b.sortOrder)
  if (titleId) {
    const own = ordered.find(r => r.titleId === titleId)
    if (own) return own
  }
  return ordered[0] ?? null
}

/**
 * The button the chart never had.
 *
 * Every card's last row reads "Upline · NAME ▾" and opens this: everyone on
 * the chart, grouped by tree, the current upline marked, and anybody who may
 * not take the mover greyed with the reason beside the name — the same rule
 * a drop is judged by (`chart-moves.ts`), so the two can never disagree. The
 * last row, "Top of their own tree", is the detach that used to live in a
 * text link above the canvas.
 *
 * Rendered through a portal so the React Flow viewport's transform and
 * overflow cannot clip it; positioned below the anchor, or above when the
 * window has no room below.
 */
export default function MovePopover({
  mover,
  people,
  ranks,
  graph,
  layoutGraph,
  anchor,
  placeUnder = null,
  onPick,
  onClose,
}: MovePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const unplaced = mover.rankId === null
  const [rankId, setRankId] = useState<string>(
    () => mover.rankId ?? defaultRankFor(ranks, mover.titleId)?.id ?? '',
  )

  const byId = useMemo(() => new Map(people.map(p => [p.staffId, p])), [people])
  const subjects = useMemo(() => people.map(subjectOf), [people])
  const forbidden = useMemo(
    () => forbiddenTargets(graph, subjects, mover.staffId),
    [graph, subjects, mover.staffId],
  )
  const groups = useMemo(() => treeGroups(layoutGraph), [layoutGraph])
  const listed = useMemo(() => new Set(groups.flatMap(g => g.members.map(m => m.id))), [groups])
  // Anybody the layout graph does not carry (the shelf) is still somebody
  // the reader may look for — listed last, under their own heading.
  const shelf = useMemo(
    () =>
      people
        .filter(p => !listed.has(p.staffId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people, listed],
  )

  const needle = q.trim().toLowerCase()
  const matches = (p: OrgPerson) => !needle || p.name.toLowerCase().includes(needle)

  // Placed under nobody already, on purpose — the detach row has nothing to do.
  const atTop = !unplaced && mover.uplineStaffId === null

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = 300
    const h = el.offsetHeight
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - w - 12))
    let top = anchor.bottom + 6
    if (top + h > window.innerHeight - 12) top = Math.max(12, anchor.top - h - 6)
    setPos({ left, top })
  }, [anchor, q, placeUnder])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const t = e.target as Node
      if (el.contains(t)) return
      // The anchor button toggles the popover itself; closing here as well
      // would reopen it on the same click.
      if ((t as Element).closest?.('[data-org-open]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    // Capture phase: when the popover was opened from a card, focus is still
    // on a button inside a React Flow node, and the node swallows Escape on
    // its way up (it is the canvas's own "deselect" key). Listening before
    // the bubble means the popover closes no matter who else wants the key.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  // `autoFocus` cannot land on an input that is still `visibility: hidden`
  // while the popover measures itself; focus it once it has a place.
  useEffect(() => {
    if (!pos) return
    const el = ref.current?.querySelector<HTMLElement>('input.ps, button.primary-act')
    el?.focus()
  }, [pos])

  const pick = (uplineStaffId: string | null) => {
    if (!rankId) return
    onPick(uplineStaffId, rankId)
  }

  const rankRow = unplaced ? (
    <label className="prank">
      <span>Place as</span>
      <select value={rankId} onChange={e => setRankId(e.target.value)} aria-label="Rank to place them at">
        {[...ranks]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(r => (
            <option key={r.id} value={r.id}>
              {r.label}
              {r.titleId === mover.titleId ? ' · their title' : ''}
            </option>
          ))}
      </select>
    </label>
  ) : null

  const target = placeUnder ? byId.get(placeUnder) : null

  const row = (p: OrgPerson, depth: number) => {
    if (!matches(p)) return null
    const kind: RefusalKind | undefined = forbidden.get(p.staffId)
    const current = !unplaced && mover.uplineStaffId === p.staffId
    return (
      <button
        key={p.staffId}
        type="button"
        role="option"
        aria-selected={current}
        disabled={!!kind || current}
        onClick={() => pick(p.staffId)}
        className="row"
        style={{ paddingLeft: 12 + depth * 12 }}
      >
        <span className="nm">{p.name}</span>
        <span className="tt">
          {p.titleName ?? 'no title'}
          {p.rankLabel ? ` · ${p.rankLabel.replace(/^rank\s+/i, '')}` : ''}
        </span>
        {current ? (
          <span className="cur">current</span>
        ) : kind ? (
          <span className="why">{refusalLabel(kind)}</span>
        ) : null}
      </button>
    )
  }

  const body = target ? (
    <div className="pact">
      <button type="button" className="border border-hairline rounded-control px-3 py-1.5 text-xs font-sans text-graphite hover:text-ink bg-surface" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="primary-act rounded-control px-3 py-1.5 text-xs font-sans text-band-ink bg-walnut hover:opacity-90 disabled:opacity-45" disabled={!rankId} onClick={() => pick(target.staffId)}>
        Place
      </button>
    </div>
  ) : (
    <>
      <input
        type="search"
        className="ps"
        placeholder="Type a name…"
        aria-label="Filter by name"
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const first = ref.current?.querySelector<HTMLButtonElement>('.plist button.row:not(:disabled)')
          first?.click()
        }}
      />
      <div className="plist" role="listbox" aria-label="Move under">
        {groups.map(g => {
          const rows = g.members.map(m => {
            const p = byId.get(m.id)
            return p ? row(p, m.depth) : null
          })
          if (rows.every(r => r === null)) return null
          const root = byId.get(g.rootId)
          return (
            <Fragment key={g.rootId}>
              <div className="grp">{root ? `${root.name}’s tree` : 'Tree'}</div>
              {rows}
            </Fragment>
          )
        })}
        {shelf.some(matches) ? (
          <>
            <div className="grp">Not placed</div>
            {shelf.map(p => row(p, 0))}
          </>
        ) : null}
        {!needle || 'top of their own tree'.includes(needle) ? (
          <button
            type="button"
            role="option"
            aria-selected={atTop}
            disabled={atTop}
            onClick={() => pick(null)}
            className="row topr"
          >
            <span className="nm">Top of their own tree</span>
            {atTop ? <span className="cur">current</span> : <span className="why">detach</span>}
          </button>
        ) : null}
        {needle && !people.some(matches) && !'top of their own tree'.includes(needle) ? (
          <p className="pnone">Nobody on the chart matches that.</p>
        ) : null}
      </div>
    </>
  )

  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${unplaced ? 'Place' : 'Move'} ${mover.name}`}
      className="org-pop font-sans"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="ph">
        {unplaced ? 'Place' : 'Move'} <b>{mover.name}</b>{' '}
        {target ? (
          <>
            under <b>{target.name}</b>
          </>
        ) : (
          'under…'
        )}
      </div>
      {rankRow}
      {body}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}
