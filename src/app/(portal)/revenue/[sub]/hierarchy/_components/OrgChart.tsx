'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
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
} from '@/lib/commission/org-layout'
import { setPosition } from '../../../hierarchy-actions'

export interface OrgRank {
  id: string
  rankKey: string
  label: string
  productRate: number
  canRecruit: boolean
  sortOrder: number
}

export interface OrgPerson {
  staffId: string
  name: string
  code: string | null
  uplineStaffId: string | null
  rankId: string | null
  rankLabel: string | null
  productRate: number | null
  canRecruit: boolean
  rateMode: 'fixed' | 'variable' | null
  placedSince: string | null
}

interface CardData extends Record<string, unknown> {
  person: OrgPerson
  invalidTarget: boolean
  selected: boolean
}

/**
 * The org chart canvas.
 *
 * Two ways to move somebody, because the brief asked for both: drop their card
 * onto a manager, or draw a line from the manager's bottom handle to their top
 * handle. Both funnel into the same `setPosition`, which is what writes the new
 * dated row.
 *
 * Illegal drops are refused HERE, before the round trip, so the refusal is
 * instant and explains itself: a rank that may not recruit cannot take
 * downlines, and nobody may be dropped under their own downline. The database
 * trigger is still the backstop — a cycle would be a silent money bug in the
 * override roll-up, not a crash, so it is guarded twice.
 */
export default function OrgChart(props: { people: OrgPerson[]; ranks: OrgRank[]; schemeId: string }) {
  return (
    <ReactFlowProvider>
      <Chart {...props} />
    </ReactFlowProvider>
  )
}

function Chart({
  people,
  ranks,
  schemeId,
}: {
  people: OrgPerson[]
  ranks: OrgRank[]
  schemeId: string
}) {
  const router = useRouter()
  const { getIntersectingNodes } = useReactFlow()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const byId = useMemo(() => new Map(people.map(p => [p.staffId, p])), [people])

  const graph: OrgNodeInput[] = useMemo(
    () => people.map(p => ({ id: p.staffId, parentId: p.uplineStaffId, label: p.name })),
    [people],
  )

  const layout = useMemo(() => layoutTree(graph), [graph])

  /** Everything the person being dragged may not be dropped on. */
  const forbidden = useMemo(() => {
    if (!dragging) return new Set<string>()
    const out = descendantsOf(graph, dragging)
    out.add(dragging)
    for (const p of people) if (!p.canRecruit) out.add(p.staffId)
    return out
  }, [dragging, graph, people])

  const nodes: Node<CardData>[] = useMemo(
    () =>
      people.map(p => {
        const pos = layout.positions.get(p.staffId)!
        return {
          id: p.staffId,
          type: 'person',
          position: { x: pos.x, y: pos.y },
          data: { person: p, invalidTarget: forbidden.has(p.staffId), selected: selected === p.staffId },
          draggable: true,
        }
      }),
    [people, layout, forbidden, selected],
  )

  const edges: Edge[] = useMemo(
    () =>
      people
        .filter(p => p.uplineStaffId && byId.has(p.uplineStaffId))
        .map(p => ({
          id: `${p.uplineStaffId}->${p.staffId}`,
          source: p.uplineStaffId!,
          target: p.staffId,
          type: 'smoothstep',
          style: { stroke: 'var(--hairline-strong, #b9b0a2)', strokeWidth: 1.5 },
        })),
    [people, byId],
  )

  const move = useCallback(
    (childId: string, parentId: string | null) => {
      const child = byId.get(childId)
      if (!child) return
      if (child.uplineStaffId === parentId) return

      if (parentId) {
        const parent = byId.get(parentId)
        if (!parent) return
        if (!parent.canRecruit) {
          setError(`${parent.name} is a ${parent.rankLabel ?? 'rank'} — that rank cannot hold downlines.`)
          return
        }
        if (wouldCycle(graph, childId, parentId)) {
          setError(`That would put ${child.name} under their own downline.`)
          return
        }
      }
      if (!child.rankId) {
        setError(`${child.name} has no rank yet — give them a rank on the Rules tab first.`)
        return
      }

      setError(null)
      startTransition(async () => {
        try {
          await setPosition({
            staffId: childId,
            schemeId,
            rankId: child.rankId!,
            uplineStaffId: parentId,
            rateMode: child.rateMode,
          })
          setNote(
            parentId
              ? `${child.name} now reports to ${byId.get(parentId)!.name}.`
              : `${child.name} is now top of their own tree.`,
          )
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move them')
        }
      })
    },
    [byId, graph, router, schemeId],
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
      {layout.detached.length > 0 ? (
        <div className="bg-surface-2 border border-hairline text-graphite rounded-md p-3 mb-4 text-sm font-sans">
          {layout.detached.length} person(s) have an upline that no longer exists and are shown at
          the top level. Place them to fix it.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 mb-3">
        <p className="font-serif italic text-muted text-xs">
          {people.length} salespeople · {layout.roots.length} tree(s)
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
            Click a card to select it, then detach it to the top if it should report to nobody.
          </span>
        )}
      </div>

      <div
        className="border border-hairline rounded-md bg-surface"
        style={{ height: Math.min(760, Math.max(420, layout.height + NODE_HEIGHT * 2)) }}
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
          proOptions={{ hideAttribution: false }}
          nodesConnectable
          nodesDraggable
          elementsSelectable
        >
          <Background gap={24} color="var(--hairline, #ddd6c9)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted">Ladder</span>
        {ranks.map(r => (
          <span key={r.id} className="font-serif italic text-xs text-graphite">
            {r.label}
            {!r.canRecruit ? (
              <span className="ml-1 font-mono text-[0.55rem] uppercase text-muted">no downlines</span>
            ) : null}
          </span>
        ))}
      </div>

      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        A greyed card cannot take the person being dragged — either it is one of their own
        downlines, or its rank is not allowed to recruit. Rates shown are the rank&apos;s; a
        salesperson on <em>scheme target</em> may be paid a higher one in a month their group sales
        clear it.
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
        'rounded-md border px-3 py-2 transition-colors',
        invalidTarget
          ? 'border-hairline bg-surface-2/50 opacity-40'
          : selected
            ? 'border-accent bg-surface shadow-sm'
            : 'border-hairline bg-surface hover:border-accent-border',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--accent)] !w-2 !h-2" />

      <div className="font-serif text-sm text-ink leading-tight truncate">{person.name}</div>
      <div className="font-mono text-[0.6rem] text-muted mt-0.5">{person.code ?? '—'}</div>

      <div className="flex items-baseline justify-between mt-1.5">
        <span className="font-serif italic text-xs text-graphite truncate">
          {person.rankLabel ?? 'not placed'}
        </span>
        <span className="num text-xs text-num-ink">
          {person.productRate === null ? '—' : `${(person.productRate * 100).toFixed(0)}%`}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          className={[
            'font-mono text-[0.55rem] uppercase tracking-wide px-1.5 py-0.5 rounded',
            person.rateMode === 'fixed'
              ? 'bg-surface-2 text-graphite'
              : 'bg-accent/10 text-accent',
          ].join(' ')}
        >
          {person.rateMode === 'fixed' ? 'manual' : 'scheme'}
        </span>
        {!person.canRecruit ? (
          <span className="font-mono text-[0.55rem] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-2 text-muted">
            no downlines
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-[var(--accent)] !w-2 !h-2" />
    </div>
  )
}
