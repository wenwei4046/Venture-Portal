'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutTree, NODE_HEIGHT, NODE_WIDTH, type OrgNodeInput } from '@/lib/org-layout'
import type { SalesPerson } from './HierarchyPanel'

interface CardData extends Record<string, unknown> {
  person: SalesPerson
  selected: boolean
}

/**
 * The Revenue department's own hierarchy, drawn beside the staff one.
 *
 * The commission ladder is a DIFFERENT tree from the reporting one — its parent
 * is `uplineStaffId`, which is who earns an override on whose sales, not who
 * signs whose leave. It used to be a flat list in the panel; a list can show
 * that a tree exists but not its shape, and the shape is the whole question
 * when the two hierarchies disagree.
 *
 * Read-only on purpose. A position is opened on the Revenue chart, where the
 * move writes a dated row the run reads; a second editable copy here would be a
 * third place to change one fact. Clicking a card only points at somebody —
 * and because `focused` is held by the page, it points at them on BOTH charts.
 */
export default function RevenueOrgChart(props: {
  salespeople: SalesPerson[]
  focused: string | null
  onFocus: (staffId: string | null) => void
  commissionHref: string | null
  /** The department the list was filtered to, when it was. An empty rail means
   *  two different things — nobody is enrolled at all, or nobody in THIS
   *  department is — and only one of them is a thing to go and fix. */
  scope?: string | null
}) {
  return (
    <ReactFlowProvider>
      <Chart {...props} />
    </ReactFlowProvider>
  )
}

function Chart({
  salespeople,
  focused,
  onFocus,
  commissionHref,
  scope,
}: {
  salespeople: SalesPerson[]
  focused: string | null
  onFocus: (staffId: string | null) => void
  commissionHref: string | null
  scope?: string | null
}) {
  const { setCenter } = useReactFlow()

  // The tree, resolved to one parent per person before it is drawn.
  //
  // A cycle the database refuses at write time can still be read back out of a
  // row written before the trigger existed, and the trigger has never gone back
  // over the rows already there. So the walk carries a `seen` set, and anybody
  // it could not reach — an upline that loops, or one who is not on commission
  // at all — is given a null parent and drawn as another root. Nobody vanishes:
  // a chart that silently omits somebody is worse than one showing them adrift,
  // and a person missing from THIS chart is a commission position nobody is
  // looking at.
  const graph: OrgNodeInput[] = useMemo(() => {
    const known = new Set(salespeople.map(s => s.staffId))
    const children = new Map<string, SalesPerson[]>()
    const roots: SalesPerson[] = []
    for (const s of salespeople) {
      if (s.uplineStaffId && s.uplineStaffId !== s.staffId && known.has(s.uplineStaffId)) {
        const list = children.get(s.uplineStaffId)
        if (list) list.push(s)
        else children.set(s.uplineStaffId, [s])
      } else {
        roots.push(s)
      }
    }

    const parentOf = new Map<string, string | null>()
    const seen = new Set<string>()
    const walk = (list: SalesPerson[], parent: string | null) => {
      for (const person of list) {
        if (seen.has(person.staffId)) continue
        seen.add(person.staffId)
        parentOf.set(person.staffId, parent)
        walk(children.get(person.staffId) ?? [], person.staffId)
      }
    }
    walk(roots, null)
    for (const s of salespeople) if (!seen.has(s.staffId)) parentOf.set(s.staffId, null)

    return salespeople.map(s => ({
      id: s.staffId,
      parentId: parentOf.get(s.staffId) ?? null,
      label: s.name,
    }))
  }, [salespeople])

  const layout = useMemo(() => layoutTree(graph), [graph])

  const nodes: Node<CardData>[] = useMemo(
    () =>
      salespeople.map(p => {
        const pos = layout.positions.get(p.staffId)!
        return {
          id: p.staffId,
          type: 'salesperson',
          position: { x: pos.x, y: pos.y },
          data: { person: p, selected: focused === p.staffId },
          draggable: false,
        }
      }),
    [salespeople, layout, focused],
  )

  // Dashed, the same dash the staff canvas draws its commission line in: one
  // relationship should not have two appearances on one screen. Drawn from the
  // resolved parent rather than the raw column, so a legacy cycle cannot put
  // back a line the layout has already broken.
  const edges: Edge[] = useMemo(
    () =>
      graph
        .filter(n => n.parentId)
        .map(n => ({
          id: `c:${n.parentId}->${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: 'smoothstep',
          style: {
            stroke: 'rgb(var(--accent))',
            strokeWidth: 1.25,
            strokeDasharray: '5 4',
            opacity: 0.65,
          },
        })),
    [graph],
  )

  // Somebody picked on the staff chart is scrolled to here rather than merely
  // tinted — in a 380px column their card is usually off screen, and a
  // highlight nobody can see reads as the click having done nothing. Only on a
  // CHANGE of focus: re-centring on every render would fight the reader's own
  // panning.
  const centred = useRef<string | null>(null)
  useEffect(() => {
    if (focused === centred.current) return
    centred.current = focused
    if (!focused) return
    const pos = layout.positions.get(focused)
    if (!pos) return
    // Below 1 because this column is narrower than two cards: at zoom 1 the
    // person arrives with nobody beside them, and who is beside them is the
    // reason for looking.
    void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
      zoom: 0.75,
      duration: 320,
    })
  }, [focused, layout, setCenter])

  const nodeTypes = useMemo(() => ({ salesperson: SalesCard }), [])

  const link = commissionHref ? (
    <div className="mt-2">
      <Link href={commissionHref} className="font-sans text-sm text-accent hover:underline">
        Edit on the Revenue chart →
      </Link>
    </div>
  ) : null

  if (salespeople.length === 0) {
    return (
      <div>
        <div className="py-10 px-4 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-muted text-sm">
            {scope
              ? `Nobody in ${scope} is on the commission ladder.`
              : 'Nobody is on the commission ladder yet.'}
          </p>
        </div>
        {link}
      </div>
    )
  }

  return (
    <div>
      <p className="font-mono text-mono-xs text-muted mb-2">
        {salespeople.length} ON COMMISSION · {layout.roots.length} TREE
        {layout.roots.length === 1 ? '' : 'S'}
      </p>

      <div
        className="border border-hairline rounded-card bg-surface"
        style={{ height: Math.min(440, Math.max(200, layout.height + NODE_HEIGHT)) }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => onFocus(focused === node.id ? null : node.id)}
          onPaneClick={() => onFocus(null)}
          fitView
          // The column is narrower than one card, so the floor has to be lower
          // than the staff canvas's before a two-level tree fits at all.
          fitViewOptions={{ padding: 0.14, minZoom: 0.35 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: false }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
        >
          <Background gap={24} color="rgb(var(--hairline))" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="flex items-center gap-2 mt-2">
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
        <span className="font-serif italic text-muted text-sm">
          Earns the override on the sales below it
        </span>
      </div>
      {link}
    </div>
  )
}

function SalesCard({ data }: NodeProps<Node<CardData>>) {
  const { person, selected } = data

  return (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={[
        'rounded-control border px-3 py-2 transition-colors',
        selected ? 'border-accent bg-surface shadow-sm' : 'border-hairline bg-surface',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />

      <div
        className={`font-serif text-sm leading-tight truncate ${
          selected ? 'text-accent' : 'text-ink'
        }`}
      >
        {person.name}
      </div>

      {/* Rank and rate come from the commission engine, which only answers for
          an account holding the `revenue` permission — for everybody else both
          arrive null. Each is guarded on its own so a half-answered row prints
          nothing rather than a placeholder: a rate is money, and an invented
          one would be read as what the month pays. */}
      {person.rankLabel ? (
        <div className="mt-1.5">
          <span className="chip accent">
            {person.rankLabel}
            {person.rateLabel ? ` · ${person.rateLabel}` : ''}
          </span>
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!opacity-0"
      />
    </div>
  )
}
