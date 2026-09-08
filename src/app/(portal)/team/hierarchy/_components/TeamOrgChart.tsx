'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  descendantsOf,
  layoutTree,
  wouldCycle,
  NODE_HEIGHT,
  NODE_WIDTH,
  type OrgNodeInput,
} from '@/lib/org-layout'
import { ladderAllows, ladderRefusal } from '@/lib/ladder'
import { boundaryRefusal } from '@/lib/hierarchy-boundary'
import { ratePct } from '@/lib/commission/ranks'
import type { MirrorOutcome } from '@/lib/hierarchy-mirror'
import { setReportsTo } from '../actions'
import MirrorOfferPrompt, { nextOffer, offerKey, type OfferState } from './MirrorOfferPrompt'
import type { RankOption, SalesPerson } from './HierarchyPanel'

export interface ChartPerson {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  /** True in a department the commission engine pays. The reporting line may
   *  not cross that department's edge — `lib/hierarchy-boundary.ts`. */
  commissionDept: boolean
  /** Where their title stands on the ladder. Null when it is not placed —
   *  the ladder then has nothing to say about them. */
  levelRank: number | null
  levelName: string | null
  reportsTo: string | null
  /** Their Revenue upline, if they have one. Drawn, never written here. */
  commUplineId: string | null
  /** The rung a month pays them from — "Rank B" — or null off commission. */
  rankLabel: string | null
  /** That rung's product rate as a fraction. The card formats it. */
  rankRate: number | null
}

interface CardData extends Record<string, unknown> {
  person: ChartPerson
  invalidTarget: boolean
  selected: boolean
}

/** No department chosen — the whole company. Exported because the page owns
 *  the choice now: the rail beside this canvas has to answer the same filter. */
export const ALL_DEPARTMENTS = '__all__'

/**
 * The company org canvas.
 *
 * Same two gestures as the Revenue hierarchy, because they are the ones people
 * have already learned: drop a card onto a manager, or draw a line from a
 * manager's bottom handle to somebody's top handle. Both call `setReportsTo`.
 *
 * Illegal moves are refused HERE, before the round trip, so the refusal is
 * instant and names the reason. Two things are illegal: putting somebody under
 * one of their own reports, and — since 2026-09-03 — putting somebody under a
 * title the ladder ranks below theirs. The database trigger is still the
 * backstop for both; being right twice is cheap.
 *
 * The ladder is a rule about titles, not a second chart: it says how high,
 * never where. Moving a person between departments is still a drag here.
 *
 * Since 2026-09-07 a drag writes BOTH lines. The dashed commission upline used
 * to be drawn here and changed somewhere else, which let the two drift apart in
 * silence; `setReportsTo` now moves it too, and the banner says so — including
 * when it could not, which is the case that matters.
 */
export default function TeamOrgChart(props: {
  people: ChartPerson[]
  commissionHref: string | null
  /** Who is lit up. Owned by the page so the panel beside the canvas and the
   *  canvas itself point at the same person — clicking a name in the list
   *  scrolls the chart to them, clicking a card highlights the name. */
  focused: string | null
  onFocus: (staffId: string | null) => void
  /** Ranks per scheme, for the enrol offer's picker. `{}` for an account
   *  without `revenue` — which is the same account the offer is never made
   *  to, so an empty map here is correct rather than a missing prop. */
  ranksByScheme: Record<string, RankOption[]>
  /** The commission positions, carried only so an enrol offer can default its
   *  scheme picker to the MOVER's own. Nothing here is drawn. */
  salespeople: SalesPerson[]
  /** The department in focus, or ALL_DEPARTMENTS. Owned by the page: the chips
   *  filter the rail beside this canvas as well, and two copies of one choice
   *  is how the two halves of a view drift apart. */
  focusDept: string
  onFocusDept: (department: string) => void
}) {
  return (
    <ReactFlowProvider>
      <Chart {...props} />
    </ReactFlowProvider>
  )
}

function Chart({
  people,
  commissionHref,
  focused,
  onFocus,
  ranksByScheme,
  salespeople,
  focusDept,
  onFocusDept,
}: {
  people: ChartPerson[]
  commissionHref: string | null
  focused: string | null
  onFocus: (staffId: string | null) => void
  ranksByScheme: Record<string, RankOption[]>
  salespeople: SalesPerson[]
  focusDept: string
  onFocusDept: (department: string) => void
}) {
  const router = useRouter()
  const { getIntersectingNodes, setCenter } = useReactFlow()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /**
   * The way out attached to a refusal, whichever kind it is.
   *
   * This used to keep DETACH offers and drop enrol ones, because the rank
   * options were built on the page behind a `seesMoney` gate and handed to the
   * table alone — so on this tab the enrol refusal was a sentence with the
   * button silently thrown away. The options are threaded here now, and an
   * offer discarded is a way out the reader never learns exists.
   */
  const [offer, setOffer] = useState<OfferState | null>(null)
  const [warn, setWarn] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const selected = focused

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  // Which scheme somebody earns under. An enrol offer defaults its picker to
  // the MOVER's, not to whichever scheme sorts first: an override belongs to
  // one scheme, so a manager enrolled into a different one is refused by the
  // very mirror the offer is trying to complete.
  const schemeOf = useMemo(
    () => new Map(salespeople.map(s => [s.staffId, s.schemeId])),
    [salespeople],
  )

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people) if (p.department) set.add(p.department)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [people])

  // Focusing a department now REMOVES the rest rather than fading them (user,
  // 2026-09-08: nobody reports across a department boundary today, so a dimmed
  // card is a card in the way). Everything the canvas draws is derived from
  // this list, not from `people`.
  //
  // Hiding somebody cannot hide a mistake: `hr_staff_reports_to_no_cycle`
  // refuses a loop in the database whether or not the chart could see it, and
  // a line that leaves the department is counted below rather than drawn as a
  // person who reports to nobody.
  const visible = useMemo(
    () => (focusDept === ALL_DEPARTMENTS ? people : people.filter(p => p.department === focusDept)),
    [people, focusDept],
  )
  const visibleIds = useMemo(() => new Set(visible.map(p => p.id)), [visible])

  // Sorted by department then name, so unattached people cluster with their
  // own department instead of interleaving across the top row. The label is
  // only ever used for ordering — the card draws the real one.
  const graph: OrgNodeInput[] = useMemo(
    () =>
      visible.map(p => ({
        id: p.id,
        parentId: p.reportsTo,
        label: `${p.department ?? 'zzz'} ${p.name}`,
      })),
    [visible],
  )

  const layout = useMemo(() => layoutTree(graph), [graph])

  /** Everything the person being dragged may not be dropped on: their own
   *  reports, anybody the ladder ranks below them, and — since 2026-09-08 —
   *  everybody on the other side of a commission department's edge. The
   *  boundary is checked here as well as on the server because it is the only
   *  one of the three with no database trigger behind it: a card that cannot
   *  be dropped on is a rule explained before it is broken, and the server
   *  message is what somebody gets when they got past this. */
  const forbidden = useMemo(() => {
    if (!dragging) return new Set<string>()
    const out = descendantsOf(graph, dragging)
    out.add(dragging)
    const mover = byId.get(dragging)
    if (mover) {
      for (const p of visible) {
        if (mover.levelRank !== null && !ladderAllows(mover.levelRank, p.levelRank)) out.add(p.id)
        if (p.commissionDept !== mover.commissionDept) out.add(p.id)
      }
    }
    return out
  }, [dragging, graph, byId, visible])

  const nodes: Node<CardData>[] = useMemo(
    () =>
      visible.map(p => {
        const pos = layout.positions.get(p.id)!
        return {
          id: p.id,
          type: 'person',
          position: { x: pos.x, y: pos.y },
          data: {
            person: p,
            invalidTarget: forbidden.has(p.id),
            selected: selected === p.id,
          },
          draggable: true,
        }
      }),
    [visible, layout, forbidden, selected],
  )

  const edges: Edge[] = useMemo(() => {
    // A line the ladder would refuse today — drawn after the ladder changed
    // under it — is painted in the danger colour rather than hidden. The
    // trigger does not go back over old lines, so the chart has to.
    const reporting: Edge[] = visible
      .filter(p => p.reportsTo && visibleIds.has(p.reportsTo))
      .map(p => {
        const manager = byId.get(p.reportsTo!)!
        const broken = !ladderAllows(p.levelRank, manager.levelRank)
        return {
          id: `r:${p.reportsTo}->${p.id}`,
          source: p.reportsTo!,
          target: p.id,
          type: 'smoothstep',
          style: broken
            ? { stroke: 'rgb(var(--danger))', strokeWidth: 1.75 }
            : { stroke: 'var(--hairline-strong, #b9b0a2)', strokeWidth: 1.5 },
        }
      })

    // The commission line only when it differs from the reporting line — an
    // identical dashed edge under a solid one says nothing.
    const commission: Edge[] = visible
      .filter(
        p =>
          p.commUplineId &&
          visibleIds.has(p.commUplineId) &&
          p.commUplineId !== p.reportsTo,
      )
      .map(p => ({
        id: `c:${p.commUplineId}->${p.id}`,
        source: p.commUplineId!,
        target: p.id,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'rgb(var(--accent))',
          strokeWidth: 1.25,
          strokeDasharray: '5 4',
          opacity: 0.65,
        },
      }))

    return [...reporting, ...commission]
  }, [visible, visibleIds, byId])

  const move = useCallback(
    (childId: string, parentId: string | null) => {
      const child = byId.get(childId)
      if (!child) return
      // Genuinely nothing to do: the reporting line already points there AND so
      // does the commission line. When only the first is true the round trip is
      // the whole point — somebody already reporting to nobody while still
      // earning under a manager has no other gesture on this page that can
      // clear that, and the detach offer is raised by the server or not at all.
      // Returning early there is how that state became unreachable.
      if (child.reportsTo === parentId && child.commUplineId === parentId) return

      if (parentId) {
        const parent = byId.get(parentId)
        if (!parent) return
        if (wouldCycle(graph, childId, parentId)) {
          setError(`That would put ${child.name} under their own report.`)
          return
        }
        if (!ladderAllows(child.levelRank, parent.levelRank)) {
          setError(
            ladderRefusal(
              { name: child.name, title: child.title, level: child.levelName },
              { name: parent.name, title: parent.title, level: parent.levelName },
            ),
          )
          return
        }
        // `forbidden` already refuses this drop, so reaching here means the
        // gesture arrived by some other route — the table's picker, a keyboard
        // drop, a page held open across a department change. Said in full
        // rather than swallowed: the same sentence the server would return.
        const crossing = boundaryRefusal(child, parent)
        if (crossing) {
          setError(crossing)
          return
        }
      }

      setError(null)
      setOffer(null)
      setWarn(false)
      startTransition(async () => {
        try {
          const outcome = await setReportsTo(childId, parentId)
          // Whatever the server attached — a detach the commission tree did not
          // follow, or a manager who is not on the ladder. Never taken for them
          // either way: the two trees hold different people, and acting on an
          // absence in one is bug B7.
          setOffer(outcome.offer ? { offer: outcome.offer, moverId: childId } : null)
          const moved = parentId
            ? `${child.name} now reports to ${byId.get(parentId)!.name}.`
            : `${child.name} now reports to nobody.`
          // The commission half of the write speaks for itself when it has
          // something to say — a skipped or failed mirror means the two lines
          // now disagree, and this banner is the only place that is visible.
          setNote(
            outcome.note
              ? `${moved} ${outcome.note}`
              : outcome.mirrored
                ? `${moved} Their commission upline moved with them.`
                : moved,
          )
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move them')
        }
      })
    },
    [byId, graph, router],
  )

  /**
   * What came back from accepting an offer.
   *
   * The note is rendered whether or not the write landed: `detachCommissionUpline`
   * reports on a money write even when it succeeded, and `mirrored` picks the
   * banner's tone rather than whether it speaks at all.
   */
  const acceptOutcome = useCallback(
    (outcome: MirrorOutcome) => {
      setError(null)
      setNote(outcome.note)
      setWarn(!outcome.mirrored)
      setOffer(current => {
        if (!current) return null
        const next = nextOffer(current.offer, outcome)
        return next ? { offer: next, moverId: current.moverId } : null
      })
      router.refresh()
    },
    [router],
  )

  const onNodeDragStop: OnNodeDrag<Node<CardData>> = useCallback(
    (_event, node) => {
      setDragging(null)
      const hits = getIntersectingNodes(node).filter(n => !forbidden.has(n.id))
      const target = hits[0]
      if (target) move(node.id, target.id)
      else router.refresh() // snap the card back to its laid-out place
    },
    [forbidden, getIntersectingNodes, move, router],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      // A line is drawn from the MANAGER down to the person.
      if (c.source && c.target) move(c.target, c.source)
    },
    [move],
  )

  // Somebody picked in the panel is scrolled to rather than merely tinted:
  // a tree wider than the viewport can highlight a card the reader cannot
  // see, which reads as the click having done nothing. Only on a CHANGE of
  // focus — re-centring on every render would fight the reader's own panning.
  const centred = useRef<string | null>(null)
  useEffect(() => {
    if (focused === centred.current) return
    centred.current = focused
    if (!focused) return
    const pos = layout.positions.get(focused)
    if (!pos) return
    void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
      zoom: 1,
      duration: 320,
    })
  }, [focused, layout, setCenter])

  const nodeTypes = useMemo(() => ({ person: PersonCard }), [])

  // Every count describes the canvas, not the company — a line that says
  // "9 people" over a chart showing 3 is worse than no line at all.
  const unplaced = visible.filter(p => !p.reportsTo).length
  const crossed = visible.filter(
    p => p.commUplineId && p.commUplineId !== p.reportsTo && visibleIds.has(p.commUplineId),
  ).length
  const broken = visible.filter(
    p =>
      p.reportsTo &&
      byId.has(p.reportsTo) &&
      !ladderAllows(p.levelRank, byId.get(p.reportsTo)!.levelRank),
  ).length
  const hidden = people.length - visible.length
  // Reports to somebody outside the focused department. None today, which is
  // why filtering is safe at all — but drawn as a root and left uncounted it
  // would read as "reports to nobody", which is a different fact.
  const outside = visible.filter(p => p.reportsTo && !visibleIds.has(p.reportsTo)).length

  return (
    <div>
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}
      {/* The note still yields to an error, as it always has — but the OFFER
          outlives one. A throw here leaves the reporting line already written,
          so the gesture that raised the offer cannot raise it again: repeating
          a detach that has already happened is a no-op, and losing the button
          would be a dead end rather than a fresh start. */}
      {(note && !error) || offer ? (
        <div
          className={`rounded-md p-3 mb-4 text-sm font-sans border ${
            warn ? 'bg-alert-bg border-alert/40 text-alert' : 'bg-surface-2 border-hairline text-ink'
          }`}
        >
          {error ? null : note}
          {/* Inside the banner, above the canvas: an affordance that opened
              between the cards would move the tree under the cursor that just
              dropped one. */}
          {offer ? (
            <MirrorOfferPrompt
              key={offerKey(offer)}
              state={offer}
              ranksByScheme={ranksByScheme}
              preferredSchemeId={schemeOf.get(offer.moverId) ?? null}
              onOutcome={acceptOutcome}
              onError={message => {
                setError(message)
                setNote(null)
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => onFocusDept(ALL_DEPARTMENTS)}
          aria-pressed={focusDept === ALL_DEPARTMENTS}
          className={`font-serif italic text-sm px-3 py-1.5 rounded-control border transition-colors ${
            focusDept === ALL_DEPARTMENTS
              ? 'bg-accent border-accent text-white'
              : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
          }`}
        >
          Whole company
        </button>
        {departments.map(d => {
          const active = focusDept === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => onFocusDept(active ? ALL_DEPARTMENTS : d)}
              aria-pressed={active}
              className={`font-serif italic text-sm px-3 py-1.5 rounded-control border transition-colors ${
                active
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-3">
        <p className="font-serif italic text-muted text-xs">
          {visible.length} people · {layout.roots.length} tree
          {layout.roots.length === 1 ? '' : 's'} · {unplaced} reporting to nobody
          {outside > 0 ? (
            <span className="text-alert">
              {' '}
              · {outside} {outside === 1 ? 'reports' : 'report'} outside {focusDept}
            </span>
          ) : null}
          {hidden > 0 ? ` · ${hidden} in other departments` : ''}
          {broken > 0 ? (
            <span className="text-danger">
              {' '}
              · {broken} {broken === 1 ? 'line breaks' : 'lines break'} the ladder
            </span>
          ) : null}
          {pending ? ' · saving…' : ''}
        </p>
        {selected ? (
          <button
            type="button"
            onClick={() => move(selected, null)}
            className="text-xs font-sans text-accent hover:underline"
          >
            Detach {byId.get(selected)?.name} to the top level
          </button>
        ) : (
          <span className="font-serif italic text-muted text-xs">
            Click a card to select it, then detach it if it should report to nobody.
          </span>
        )}
      </div>

      <div
        className="border border-hairline rounded-card bg-surface"
        style={{ height: Math.min(760, Math.max(340, layout.height + NODE_HEIGHT * 2.5)) }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeDragStart={(_e, node) => {
            setNote(null)
            setOffer(null)
            setWarn(false)
            setDragging(node.id)
          }}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_e, node) => onFocus(focused === node.id ? null : node.id)}
          onConnect={onConnect}
          fitView
          // Before anybody is placed the graph is one very wide row, and a
          // plain fitView would squeeze 24 cards into an unreadable strip.
          // Floor the zoom and let the reader pan instead.
          fitViewOptions={{ padding: 0.12, minZoom: 0.55 }}
          minZoom={0.25}
          proOptions={{ hideAttribution: false }}
          nodesConnectable
          nodesDraggable
          elementsSelectable
        >
          <Background gap={24} color="rgb(var(--hairline))" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
        <span className="inline-flex items-center gap-2 font-serif italic text-xs text-graphite">
          <svg width="26" height="6" aria-hidden>
            <line x1="0" y1="3" x2="26" y2="3" stroke="var(--hairline-strong, #b9b0a2)" strokeWidth="1.5" />
          </svg>
          Reports to
        </span>
        {broken > 0 ? (
          <span className="inline-flex items-center gap-2 font-serif italic text-xs text-danger">
            <svg width="26" height="6" aria-hidden>
              <line x1="0" y1="3" x2="26" y2="3" stroke="rgb(var(--danger))" strokeWidth="1.75" />
            </svg>
            Breaks the ladder · {broken}
            <Link
              href="/team/hierarchy?tab=levels"
              scroll={false}
              className="ml-1 not-italic font-sans text-[11px] text-accent hover:underline"
            >
              see Levels →
            </Link>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2 font-serif italic text-xs text-graphite">
          <svg width="26" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="26"
              y2="3"
              stroke="rgb(var(--accent))"
              strokeWidth="1.25"
              strokeDasharray="5 4"
              opacity="0.65"
            />
          </svg>
          Commission upline{crossed > 0 ? ` · ${crossed} differ` : ''}
          {commissionHref ? (
            <Link
              href={commissionHref}
              className="ml-1 not-italic font-sans text-[11px] text-accent hover:underline"
            >
              change on Revenue →
            </Link>
          ) : null}
        </span>
      </div>

      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        A greyed card cannot take the person being dragged — it is one of their
        own reports, or the ladder ranks its title below theirs. A red line is
        one the ladder would refuse today: move the line, or change the ladder
        from the Rules panel. The dashed line moves with the solid one where
        this account may write both — it decides override commission, and a
        month already run keeps the chart it was run against, so the move opens
        a new position rather than editing the old one.
      </p>
    </div>
  )
}

function PersonCard({ data }: NodeProps<Node<CardData>>) {
  const { person, invalidTarget, selected } = data

  return (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={[
        'rounded-control border px-3 py-2 transition-colors',
        invalidTarget
          ? 'border-hairline bg-surface-2/50 opacity-40'
          : selected
            ? 'border-accent bg-surface shadow-sm'
            : 'border-hairline bg-surface hover:border-accent-border',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-[rgb(var(--accent))] !w-2 !h-2" />

      <div className="font-serif text-sm text-ink leading-tight truncate">{person.name}</div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className="font-mono text-[0.6rem] text-muted">{person.code ?? '—'}</span>
        {person.levelName ? (
          <span
            className="font-mono text-[0.55rem] uppercase tracking-wide text-accent truncate"
            title={`Level ${person.levelRank} · ${person.levelName}`}
          >
            L{person.levelRank} · {person.levelName}
          </span>
        ) : null}
      </div>

      <div className="font-serif italic text-xs text-graphite truncate mt-1.5">
        {person.title ?? 'no title'}
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <span className="font-mono text-[0.55rem] uppercase tracking-wide text-muted truncate">
          {person.department ?? 'no department'}
        </span>
        {person.rankLabel ? (
          <span
            className="shrink-0 font-mono text-[0.55rem] text-graphite whitespace-nowrap"
            title="What a month pays them from"
          >
            {person.rankLabel}
            {person.rankRate !== null ? ` · ${ratePct(person.rankRate)}` : ''}
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-[rgb(var(--accent))] !w-2 !h-2" />
    </div>
  )
}
