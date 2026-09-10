'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  enrolPlan,
  forbiddenTargets,
  refusalLabel,
  treeGroups,
  type EnrolChoice,
  type EnrolPlan,
  type EnrolStep,
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
   * A target already chosen by a drop. The popover then skips the list and
   * only confirms: the rank an unplaced mover is to be given, because
   * `comm_hierarchy.rank_id` is NOT NULL and no rank can be invented for
   * them — and, when the target holds no position either, who goes on the
   * ladder first and at what rank.
   */
  placeUnder?: string | null
  /**
   * `enrol` is present only when the pick puts somebody else on the ladder
   * on the way — the target, and whoever above them on the reporting line
   * was not on it yet (`enrolPlan`), each with the rank the reader chose.
   */
  onPick: (uplineStaffId: string | null, rankId: string, enrol?: EnrolChoice[]) => void
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
    reportsTo: p.reportsTo,
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

/** "A, B and C" — for a sentence about who goes on the ladder first. */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The button that does it: one person, or the whole line. */
function placeLabel(count: number): string {
  if (count <= 1) return 'Place'
  if (count === 2) return 'Place both'
  return `Place all ${count}`
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
 * An upline who holds no position yet is NOT greyed (2026-09-10). Their row
 * says "placed first", and picking it turns the list into the plan: them on
 * the ladder, at their title's rank, and whoever above them on the reporting
 * line was not on it either — then the mover under them. Every rank is a
 * select, and one button does all of it, so what used to be a refusal and a
 * trip through two other popovers is one confirmed gesture that shows every
 * position it is about to open.
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
  /** The upline picked from the list (or handed in by a drop), awaiting the plan's confirmation. */
  const [chosen, setChosen] = useState<string | null>(placeUnder)
  /** Ranks chosen for the people the plan puts on the ladder; the default is read when absent. */
  const [enrolRanks, setEnrolRanks] = useState<Record<string, string>>({})

  const byId = useMemo(() => new Map(people.map(p => [p.staffId, p])), [people])
  const subjects = useMemo(() => people.map(subjectOf), [people])
  const forbidden = useMemo(
    () => forbiddenTargets(graph, subjects, mover.staffId),
    [graph, subjects, mover.staffId],
  )
  const plans = useMemo(
    () => new Map<string, EnrolPlan>(people.map(p => [p.staffId, enrolPlan(subjects, p.staffId)])),
    [people, subjects],
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
  const sortedRanks = useMemo(() => [...ranks].sort((a, b) => a.sortOrder - b.sortOrder), [ranks])

  const needle = q.trim().toLowerCase()
  const matches = (p: OrgPerson) => !needle || p.name.toLowerCase().includes(needle)

  // Placed under nobody already, on purpose — the detach row has nothing to do.
  const atTop = !unplaced && mover.uplineStaffId === null

  const target = chosen ? (byId.get(chosen) ?? null) : null
  const steps: EnrolStep[] = target ? (plans.get(target.staffId)?.steps ?? []) : []
  const wide = target !== null

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = wide ? 392 : 300
    const h = el.offsetHeight
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - w - 12))
    let top = anchor.bottom + 6
    if (top + h > window.innerHeight - 12) top = Math.max(12, anchor.top - h - 6)
    setPos({ left, top })
  }, [anchor, q, chosen, wide])

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

  const rankOf = (s: EnrolStep): string =>
    enrolRanks[s.staffId] ?? defaultRankFor(ranks, byId.get(s.staffId)?.titleId ?? null)?.id ?? ''

  const pick = (uplineStaffId: string | null) => {
    if (!rankId) return
    onPick(uplineStaffId, rankId)
  }

  /** A row was chosen: straight through when nobody else needs placing, else the plan. */
  const choose = (staffId: string) => {
    if ((plans.get(staffId)?.steps.length ?? 0) > 0) setChosen(staffId)
    else pick(staffId)
  }

  const canPlace = !!rankId && steps.every(s => rankOf(s) !== '')
  const confirm = () => {
    if (!target || !canPlace) return
    if (steps.length === 0) {
      onPick(target.staffId, rankId)
      return
    }
    onPick(
      target.staffId,
      rankId,
      steps.map(s => ({ ...s, rankId: rankOf(s) })),
    )
  }

  const rankOptions = (titleId: string | null) =>
    sortedRanks.map(r => (
      <option key={r.id} value={r.id}>
        {r.label}
        {r.titleId === titleId ? ' · their title' : ''}
      </option>
    ))

  const rankRow =
    unplaced && !target ? (
      <label className="prank">
        <span>Place as</span>
        <select value={rankId} onChange={e => setRankId(e.target.value)} aria-label="Rank to place them at">
          {rankOptions(mover.titleId)}
        </select>
      </label>
    ) : null

  const row = (p: OrgPerson, depth: number) => {
    if (!matches(p)) return null
    const kind: RefusalKind | undefined = forbidden.get(p.staffId)
    const current = !unplaced && mover.uplineStaffId === p.staffId
    const first = !kind && !current && (plans.get(p.staffId)?.steps.length ?? 0) > 0
    return (
      <button
        key={p.staffId}
        type="button"
        role="option"
        aria-selected={current}
        disabled={!!kind || current}
        onClick={() => choose(p.staffId)}
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
        ) : first ? (
          <span className="pre">placed first</span>
        ) : null}
      </button>
    )
  }

  /**
   * The sentence above the plan: who goes on the ladder first, and where the
   * line puts them. Absent when only the mover is being placed.
   */
  const lead = (() => {
    if (steps.length === 0) return null
    const names = steps.map(s => byId.get(s.staffId)?.name ?? '?')
    if (steps.length === 1) {
      const anchorId = steps[0].uplineStaffId
      const where = anchorId
        ? `under ${byId.get(anchorId)?.name ?? 'their manager'}, where they already report`
        : 'at the top of their own tree'
      return `${names[0]} holds no position yet, so they go on the ladder first, ${where}.`
    }
    return `${listNames(names)} hold no position yet, so they go on the ladder first, along the line they already report on.`
  })()

  const body = target ? (
    <div className="pplan">
      {lead ? <p className="plead">{lead}</p> : null}
      <ol className="psteps">
        {steps.map((s, i) => {
          const p = byId.get(s.staffId)
          if (!p) return null
          const under = s.uplineStaffId
            ? `under ${byId.get(s.uplineStaffId)?.name ?? '?'}`
            : 'top of own tree'
          return (
            <li key={s.staffId}>
              <span className="n">{i + 1}</span>
              <span className="who">
                <span className="nm">{p.name}</span>
                <span className="tt">
                  {p.titleName ?? 'no title'} · {under}
                </span>
              </span>
              <select
                value={rankOf(s)}
                onChange={e => setEnrolRanks(r => ({ ...r, [s.staffId]: e.target.value }))}
                aria-label={`Rank to place ${p.name} at`}
              >
                {rankOptions(p.titleId)}
              </select>
            </li>
          )
        })}
        <li>
          <span className="n">{steps.length + 1}</span>
          <span className="who">
            <span className="nm">{mover.name}</span>
            <span className="tt">
              {mover.titleName ?? 'no title'} · under {target.name}
            </span>
          </span>
          {unplaced ? (
            <select value={rankId} onChange={e => setRankId(e.target.value)} aria-label="Rank to place them at">
              {rankOptions(mover.titleId)}
            </select>
          ) : (
            <span className="kept">{(mover.rankLabel ?? '').replace(/^rank\s+/i, '')} · kept</span>
          )}
        </li>
      </ol>
      <div className="pact">
        <button
          type="button"
          className="border border-hairline rounded-control px-3 py-1.5 text-xs font-sans text-graphite hover:text-ink bg-surface"
          onClick={placeUnder ? onClose : () => setChosen(null)}
        >
          {placeUnder ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="primary-act rounded-control px-3 py-1.5 text-xs font-sans text-band-ink bg-walnut hover:opacity-90 disabled:opacity-45"
          disabled={!canPlace}
          onClick={confirm}
        >
          {placeLabel(steps.length + 1)}
        </button>
      </div>
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
      className={`org-pop font-sans${wide ? ' wide' : ''}`}
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
