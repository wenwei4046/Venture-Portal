'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
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
import { setReportsTo } from '../actions'

export interface ChartPerson {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  /** Where their title stands on the ladder. Null when it is not placed —
   *  the ladder then has nothing to say about them. */
  levelRank: number | null
  levelName: string | null
  reportsTo: string | null
  /** Their Revenue upline, if they have one. Drawn, never written here. */
  commUplineId: string | null
}

interface CardData extends Record<string, unknown> {
  person: ChartPerson
  invalidTarget: boolean
  selected: boolean
  dimmed: boolean
}

const ALL = '__all__'

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
 */
export default function TeamOrgChart(props: {
  people: ChartPerson[]
  commissionHref: string | null
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
}: {
  people: ChartPerson[]
  commissionHref: string | null
}) {
  const router = useRouter()
  const { getIntersectingNodes } = useReactFlow()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [focusDept, setFocusDept] = useState<string>(ALL)

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people) if (p.department) set.add(p.department)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [people])

  // Sorted by department then name, so unattached people cluster with their
  // own department instead of interleaving across the top row. The label is
  // only ever used for ordering — the card draws the real one.
  const graph: OrgNodeInput[] = useMemo(
    () =>
      people.map(p => ({
        id: p.id,
        parentId: p.reportsTo,
        label: `${p.department ?? 'zzz'} ${p.name}`,
      })),
    [people],
  )

  const layout = useMemo(() => layoutTree(graph), [graph])

  /** Everything the person being dragged may not be dropped on: their own
   *  reports, and anybody the ladder ranks below them. */
  const forbidden = useMemo(() => {
    if (!dragging) return new Set<string>()
    const out = descendantsOf(graph, dragging)
    out.add(dragging)
    const mover = byId.get(dragging)
    if (mover && mover.levelRank !== null) {
      for (const p of people) {
        if (!ladderAllows(mover.levelRank, p.levelRank)) out.add(p.id)
      }
    }
    return out
  }, [dragging, graph, byId, people])

  const nodes: Node<CardData>[] = useMemo(
    () =>
      people.map(p => {
        const pos = layout.positions.get(p.id)!
        return {
          id: p.id,
          type: 'person',
          position: { x: pos.x, y: pos.y },
          data: {
            person: p,
            invalidTarget: forbidden.has(p.id),
            selected: selected === p.id,
            dimmed: focusDept !== ALL && p.department !== focusDept,
          },
          draggable: true,
        }
      }),
    [people, layout, forbidden, selected, focusDept],
  )

  const edges: Edge[] = useMemo(() => {
    // A line the ladder would refuse today — drawn after the ladder changed
    // under it — is painted in the danger colour rather than hidden. The
    // trigger does not go back over old lines, so the chart has to.
    const reporting: Edge[] = people
      .filter(p => p.reportsTo && byId.has(p.reportsTo))
      .map(p => {
        const manager = byId.get(p.reportsTo!)!
        const broken = !ladderAllows(p.levelRank, manager.levelRank)
        return {
          id: `r:${p.reportsTo}->${p.id}`,
          source: p.reportsTo!,
          target: p.id,
          type: 'smoothstep',
          style: broken
            ? { stroke: 'var(--danger)', strokeWidth: 1.75 }
            : { stroke: 'var(--hairline-strong, #b9b0a2)', strokeWidth: 1.5 },
        }
      })

    // The commission line only when it differs from the reporting line — an
    // identical dashed edge under a solid one says nothing.
    const commission: Edge[] = people
      .filter(
        p =>
          p.commUplineId &&
          byId.has(p.commUplineId) &&
          p.commUplineId !== p.reportsTo,
      )
      .map(p => ({
        id: `c:${p.commUplineId}->${p.id}`,
        source: p.commUplineId!,
        target: p.id,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'var(--accent)',
          strokeWidth: 1.25,
          strokeDasharray: '5 4',
          opacity: 0.65,
        },
      }))

    return [...reporting, ...commission]
  }, [people, byId])

  const move = useCallback(
    (childId: string, parentId: string | null) => {
      const child = byId.get(childId)
      if (!child) return
      if (child.reportsTo === parentId) return

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
      }

      setError(null)
      startTransition(async () => {
        try {
          await setReportsTo(childId, parentId)
          setNote(
            parentId
              ? `${child.name} now reports to ${byId.get(parentId)!.name}.`
              : `${child.name} now reports to nobody.`,
          )
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move them')
        }
      })
    },
    [byId, graph, router],
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

  const nodeTypes = useMemo(() => ({ person: PersonCard }), [])

  const unplaced = people.filter(p => !p.reportsTo).length
  const crossed = people.filter(
    p => p.commUplineId && p.commUplineId !== p.reportsTo && byId.has(p.commUplineId),
  ).length
  const broken = people.filter(
    p =>
      p.reportsTo &&
      byId.has(p.reportsTo) &&
      !ladderAllows(p.levelRank, byId.get(p.reportsTo)!.levelRank),
  ).length

  return (
    <div>
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}
      {note && !error ? (
        <div className="bg-surface-2 border border-hairline text-ink rounded-md p-3 mb-4 text-sm font-sans">
          {note}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setFocusDept(ALL)}
          aria-pressed={focusDept === ALL}
          className={`font-serif italic text-sm px-3 py-1.5 rounded-control border transition-colors ${
            focusDept === ALL
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
              onClick={() => setFocusDept(active ? ALL : d)}
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
          {people.length} people · {layout.roots.length} tree
          {layout.roots.length === 1 ? '' : 's'} · {unplaced} reporting to nobody
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
            setDragging(node.id)
          }}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_e, node) => setSelected(s => (s === node.id ? null : node.id))}
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
          <Background gap={24} color="var(--hairline, #ddd6c9)" />
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
              <line x1="0" y1="3" x2="26" y2="3" stroke="var(--danger)" strokeWidth="1.75" />
            </svg>
            Breaks the ladder · {broken}
            <Link
              href="/team/roles"
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
              stroke="var(--accent)"
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
        under Roles → Levels. The dashed line is read-only here: it decides
        override commission, and a month already run keeps the chart it was run
        against.
      </p>
    </div>
  )
}

function PersonCard({ data }: NodeProps<Node<CardData>>) {
  const { person, invalidTarget, selected, dimmed } = data

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
        dimmed && !invalidTarget ? 'opacity-35' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--accent)] !w-2 !h-2" />

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
      <div className="font-mono text-[0.55rem] uppercase tracking-wide text-muted truncate mt-1">
        {person.department ?? 'no department'}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-[var(--accent)] !w-2 !h-2" />
    </div>
  )
}
