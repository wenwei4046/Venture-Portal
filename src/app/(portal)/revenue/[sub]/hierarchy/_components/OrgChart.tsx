'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  getSmoothStepPath,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  descendantsOf,
  layoutTree,
  NODE_HEIGHT,
  NODE_WIDTH,
  type OrgNodeInput,
} from '@/lib/org-layout'
import {
  forbiddenTargets,
  moveRefusal,
  refusalLabel,
  refusalSentence,
  shelfIds,
  type RefusalKind,
} from '@/lib/commission/chart-moves'
import {
  readManualLayout,
  writeManualLayout,
  type ManualLayout,
  type XY,
} from '@/lib/commission/chart-layout-store'
import { moveOnChart } from '../../../hierarchy-actions'
import MovePopover, { subjectOf, type PopAnchor } from './MovePopover'

export interface OrgRank {
  id: string
  rankKey: string
  /** The title this rung belongs to — a title sits where its lowest rung sits. */
  titleId: string
  /** "Rank B · 8%" — lettered from the top of the ladder (ranks.ts). */
  label: string
  productRate: number
  canRecruit: boolean
  sortOrder: number
}

export interface OrgPerson {
  staffId: string
  name: string
  code: string | null
  /** The title they HOLD — the ratchet; may sit above the rank they are paid. */
  titleName: string | null
  titleId: string | null
  /** Where that title stands on the company ladder; null = not on it. */
  levelRank: number | null
  levelName: string | null
  /**
   * Who they report to — THE line. The same column People draws, and what
   * the commission position's upline is derived from in the database.
   */
  reportsTo: string | null
  /** The rank their position carries; null = no rank yet (their title has no rung here). */
  rankId: string | null
  /** "Rank B" — the card shows the rate beside it. */
  rankLabel: string | null
  productRate: number | null
  /** Decided by the title they hold, not the rank of the month. */
  canRecruit: boolean
  rateMode: 'fixed' | 'variable' | null
  placedSince: string | null
}

interface CardData extends Record<string, unknown> {
  person: OrgPerson
  uplineName: string | null
  /** While somebody is dragged: this card may not take them. */
  invalidTarget: boolean
  /** While somebody is dragged: this card may. */
  canTake: boolean
  selected: boolean
  /** The card under the pointer right now, and whether dropping there is refused. */
  target: boolean
  bad: boolean
  /** Just moved — a halo while the tree settles around them. */
  fresh: boolean
}

type CardNode = Node<CardData, 'person'>
type LineEdge = Edge<{ fresh: boolean }, 'line'>

/** The card's Upline row asks the chart to open the popover for it. */
const OpenUpline = createContext<(staffId: string, anchor: PopAnchor) => void>(() => {})

const SHELF_GAP = 96
const SHELF_ROW = NODE_HEIGHT + 14
const GLIDE_MS = 500
/** Overshoots a little on the way in — the card lands, it does not stop. */
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const storage = () => (typeof window === 'undefined' ? null : window.localStorage)
/** React Flow hands a drag either a mouse or a touch event; the pointer is in one of two places. */
const pointerOf = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
  if ('touches' in e) {
    const t = e.touches[0] ?? e.changedTouches[0]
    return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
  }
  return { x: e.clientX, y: e.clientY }
}

/**
 * The org chart canvas.
 *
 * Three ways to move somebody, and they all funnel into `moveOnChart`, which
 * writes who they report to — the one line — and lets the database move the
 * commission position with it:
 *
 *   the Upline row   every card's last line names their upline and is a
 *                    button — a popover lists the chart by tree, greys anybody
 *                    who may not take them and says why, and ends in "Top of
 *                    their own tree" (the detach);
 *   a drop           drag the card onto somebody; the cards that may take
 *                    them light up while it is in the air, the one under the
 *                    pointer says "→ under NAME", and a refused one says why;
 *   a line           the handles are still there for anybody who liked them.
 *
 * A card dropped on nothing STAYS there (user 2026-09-09: the snap-back read
 * as the chart refusing to be moved) — remembered per browser and scheme, and
 * forgotten by Tidy or by any move, because a moved tree has a new shape.
 *
 * Illegal drops are refused HERE, before the round trip, in the sentence the
 * server would have used (`chart-moves.ts`). The database trigger is still
 * the backstop — a cycle would be a silent money bug in the override roll-up.
 *
 * The canvas re-declares its palette (`.org-canvas` in globals.css): the old
 * card sat on a ground of its own colour, ΔL* 0.0, and the user could not
 * tell the cards from the background.
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
  const { screenToFlowPosition, fitView, setCenter, zoomIn, zoomOut, getZoom } = useReactFlow()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; bad: boolean } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [pop, setPop] = useState<{ moverId: string; anchor: PopAnchor } | null>(null)
  const [find, setFind] = useState('')
  const [entering, setEntering] = useState(true)

  const byId = useMemo(() => new Map(people.map(p => [p.staffId, p])), [people])
  const subjects = useMemo(() => people.map(subjectOf), [people])

  /**
   * The one line: who reports to whom. Every RULE reads this — what a cycle
   * is, who somebody’s downline is, what a drop would move — and so does the
   * layout, because since 2026-09-10 there is no second graph to borrow from.
   */
  const graph: OrgNodeInput[] = useMemo(
    () => people.map(p => ({ id: p.staffId, parentId: p.reportsTo, label: p.name })),
    [people],
  )

  /**
   * Anybody on no line at all — reporting to nobody, nobody under them, and a
   * title that cannot lead — waits on the shelf instead of standing in the
   * leaders' row (`shelfIds`). The trees are drawn without them.
   */
  const shelf = useMemo(
    () =>
      shelfIds(people.map(p => ({ staffId: p.staffId, parentId: p.reportsTo, canRecruit: p.canRecruit }))),
    [people],
  )
  const layoutGraph: OrgNodeInput[] = useMemo(
    () => graph.filter(n => !shelf.has(n.id)),
    [graph, shelf],
  )
  const layout = useMemo(() => layoutTree(layoutGraph), [layoutGraph])

  /** Where the tidy layout puts everyone — the trees, then the shelf to their right. */
  const tidy = useMemo(() => {
    const positions = new Map<string, XY>()
    for (const [id, p] of layout.positions) positions.set(id, { x: p.x, y: p.y })
    const shelved = people
      .filter(p => shelf.has(p.staffId))
      .sort((a, b) => a.name.localeCompare(b.name))
    const shelfX = layout.width > 0 ? layout.width + SHELF_GAP : 0
    shelved.forEach((p, i) => positions.set(p.staffId, { x: shelfX, y: i * SHELF_ROW }))
    return {
      positions,
      shelfX,
      shelfCount: shelved.length,
      height: Math.max(layout.height, shelved.length ? shelved.length * SHELF_ROW - 14 : 0),
    }
  }, [layout, people, shelf])

  // Where the reader left each card, if anywhere. Read once on the client —
  // never during the server render — then owned by this ref.
  const manualRef = useRef<ManualLayout>(new Map())
  const [manualLoaded, setManualLoaded] = useState(false)
  useEffect(() => {
    manualRef.current = readManualLayout(storage(), schemeId)
    setManualLoaded(true)
  }, [schemeId])

  const targetsFor = useCallback(() => {
    const out = new Map<string, XY>()
    for (const p of people) {
      out.set(p.staffId, manualRef.current.get(p.staffId) ?? tidy.positions.get(p.staffId) ?? { x: 0, y: 0 })
    }
    return out
  }, [people, tidy])

  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([])
  const nodesRef = useRef<CardNode[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  /**
   * Glide the cards to new places over half a second, through the node state,
   * so React Flow redraws the edges every frame and the lines follow the
   * cards rather than jumping ahead of them.
   */
  const animRef = useRef<number | null>(null)
  const glide = useCallback(
    (targets: Map<string, XY>, onDone?: () => void) => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (prefersReducedMotion()) {
        setNodes(prev =>
          prev.map(n => {
            const to = targets.get(n.id)
            return to ? { ...n, position: to } : n
          }),
        )
        onDone?.()
        return
      }
      const from = new Map<string, XY>()
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / GLIDE_MS)
        const k = easeOutBack(t)
        setNodes(prev =>
          prev.map(n => {
            const to = targets.get(n.id)
            if (!to) return n
            let f = from.get(n.id)
            if (!f) {
              f = { ...n.position }
              from.set(n.id, f)
            }
            return { ...n, position: { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k } }
          }),
        )
        if (t < 1) animRef.current = requestAnimationFrame(step)
        else {
          animRef.current = null
          onDone?.()
        }
      }
      animRef.current = requestAnimationFrame(step)
    },
    [setNodes],
  )
  useEffect(
    () => () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    },
    [],
  )

  /**
   * The cards, laid out. Fresh people or a fresh layout: keep each card's
   * measured size and its current place, then glide it to where it now
   * belongs — except the very first time, when there is nothing to glide from.
   */
  const firstLayout = useRef(true)
  useEffect(() => {
    if (!manualLoaded) return
    const targets = targetsFor()
    const names = new Map(people.map(p => [p.staffId, p.name]))
    setNodes(prev => {
      const have = new Map(prev.map(n => [n.id, n]))
      return people.map((p, i) => {
        const old = have.get(p.staffId)
        const to = targets.get(p.staffId)!
        return {
          id: p.staffId,
          type: 'person' as const,
          position: old ? old.position : to,
          initialWidth: NODE_WIDTH,
          initialHeight: NODE_HEIGHT,
          measured: old?.measured,
          draggable: true,
          style: { '--i': i } as CSSProperties,
          data: {
            person: p,
            uplineName: p.reportsTo ? (names.get(p.reportsTo) ?? null) : null,
            invalidTarget: old?.data.invalidTarget ?? false,
            canTake: old?.data.canTake ?? false,
            selected: old?.data.selected ?? false,
            target: old?.data.target ?? false,
            bad: old?.data.bad ?? false,
            fresh: old?.data.fresh ?? false,
          },
        }
      })
    })
    if (firstLayout.current) {
      firstLayout.current = false
      return
    }
    glide(targets)
  }, [people, tidy, manualLoaded, targetsFor, glide, setNodes])

  // The entrance plays once, for the cards that were there when the chart
  // opened; a card that arrives later should simply be there.
  useEffect(() => {
    if (!manualLoaded) return
    const t = window.setTimeout(() => setEntering(false), 1400)
    return () => window.clearTimeout(t)
  }, [manualLoaded])

  /** Everything the person being dragged may not be dropped on, and why. */
  const forbidden = useMemo(
    () => (dragging ? forbiddenTargets(graph, subjects, dragging) : new Map<string, RefusalKind>()),
    [dragging, graph, subjects],
  )

  /** Greying, selection and the halo are card data; the cards themselves stay put. */
  useEffect(() => {
    setNodes(prev =>
      prev.map(n => {
        const invalidTarget = !!dragging && n.id !== dragging && forbidden.has(n.id)
        const canTake = !!dragging && n.id !== dragging && !forbidden.has(n.id)
        const isSelected = selected === n.id
        const isTarget = hover?.id === n.id
        const isBad = isTarget && !!hover?.bad
        const isFresh = fresh === n.id
        const d = n.data
        if (
          d.invalidTarget === invalidTarget &&
          d.canTake === canTake &&
          d.selected === isSelected &&
          d.target === isTarget &&
          d.bad === isBad &&
          d.fresh === isFresh
        ) {
          return n
        }
        return {
          ...n,
          data: { ...d, invalidTarget, canTake, selected: isSelected, target: isTarget, bad: isBad, fresh: isFresh },
        }
      }),
    )
  }, [dragging, forbidden, selected, hover, fresh, setNodes])

  // The halo and the drawn-in line are for the move just made, not forever.
  useEffect(() => {
    if (!fresh) return
    const t = window.setTimeout(() => setFresh(null), 1800)
    return () => window.clearTimeout(t)
  }, [fresh])

  // Once the tree has re-tidied around the moved card, bring it into view.
  useEffect(() => {
    if (!fresh) return
    const pos = tidy.positions.get(fresh)
    if (!pos) return
    const t = window.setTimeout(() => {
      void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, { zoom: getZoom(), duration: 400 })
    }, GLIDE_MS + 40)
    return () => window.clearTimeout(t)
  }, [fresh, tidy, setCenter, getZoom])

  /** One kind of line: who reports to whom, which is who earns the override. */
  const edges: LineEdge[] = useMemo(() => {
    const out: LineEdge[] = []
    for (const p of people) {
      if (!p.reportsTo || !byId.has(p.reportsTo)) continue
      const isFresh = fresh === p.staffId
      out.push({
        id: `${p.reportsTo}->${p.staffId}`,
        source: p.reportsTo,
        target: p.staffId,
        type: 'line',
        className: isFresh ? 'fresh' : undefined,
        data: { fresh: isFresh },
      })
    }
    return out
  }, [people, byId, fresh])

  /** Where a popover about `staffId` hangs from: their card's Upline row, or mid-screen. */
  const anchorOf = useCallback((staffId: string): PopAnchor => {
    const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${staffId}"] .oc-up`)
    const r = el?.getBoundingClientRect()
    return r
      ? { left: r.left, top: r.top, bottom: r.bottom }
      : { left: window.innerWidth / 2 - 150, top: 160, bottom: 190 }
  }, [])

  /**
   * The write: who they report to. One column, and the database moves the
   * commission position with it. Refused here first, in the sentence the
   * server would have used (`chart-moves.ts`), so a bad drop costs no round
   * trip; the server refuses again and returns its reason rather than
   * throwing, so the sentence survives production.
   */
  const move = useCallback(
    (childId: string, parentId: string | null) => {
      const child = byId.get(childId)
      if (!child) return

      if (parentId) {
        const parent = byId.get(parentId)
        if (!parent) return
        const kind = moveRefusal(subjectOf(child), subjectOf(parent), descendantsOf(graph, childId))
        if (kind) {
          setError(refusalSentence(kind, subjectOf(child), subjectOf(parent)))
          return
        }
      }
      if (child.reportsTo === parentId) {
        setError(null)
        setNote(
          parentId
            ? `${child.name} already reports to ${byId.get(parentId)!.name}.`
            : `${child.name} is already top of their own tree.`,
        )
        return
      }

      setError(null)
      setPop(null)
      startTransition(async () => {
        try {
          const result = await moveOnChart(childId, parentId)
          if (!result.ok) {
            setError(result.reason)
            const home = targetsFor().get(childId)
            if (home) glide(new Map([[childId, home]]))
            return
          }
          const moved = parentId
            ? `${child.name} now reports to ${byId.get(parentId)!.name}.`
            : `${child.name} is now top of their own tree.`
          // The money follows the line in the database; the only thing worth
          // adding is when there is no money to follow it yet.
          const rank = child.rankId === null ? ' They have no rank yet — their title has no rung on this ladder.' : ''
          setNote(`${moved}${rank}`)
          // A moved tree has a new shape; the arrangement described the old one.
          manualRef.current = new Map()
          writeManualLayout(storage(), schemeId, manualRef.current)
          setFresh(childId)
          setSelected(childId)
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move them')
          // The card was left over the target it was dropped on; put it back.
          const home = targetsFor().get(childId)
          if (home) glide(new Map([[childId, home]]))
        }
      })
    },
    [byId, graph, router, schemeId, targetsFor, glide],
  )

  const dragRef = useRef<{ id: string; from: XY; hover: string | null } | null>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  const onNodeDragStart: OnNodeDrag<CardNode> = useCallback((_event, node) => {
    setNote(null)
    setError(null)
    setPop(null)
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
    dragRef.current = { id: node.id, from: { ...node.position }, hover: null }
    setDragging(node.id)
  }, [])

  /**
   * Where the pointer is, not where the card overlaps most: the card under
   * the pointer is the one the reader means, and it is told so on the spot.
   * Judged on the chart's own geometry — nothing here asks the canvas.
   */
  const onNodeDrag: OnNodeDrag<CardNode> = useCallback(
    (event, node) => {
      const d = dragRef.current
      if (!d) return
      const client = pointerOf(event)
      const pt = screenToFlowPosition(client)
      let hit: CardNode | undefined
      for (const n of nodesRef.current) {
        if (n.id === node.id) continue
        const w = n.measured?.width ?? NODE_WIDTH
        const h = n.measured?.height ?? NODE_HEIGHT
        if (pt.x >= n.position.x && pt.x <= n.position.x + w && pt.y >= n.position.y && pt.y <= n.position.y + h) {
          hit = n
          break
        }
      }
      const id = hit?.id ?? null
      const kind = id ? forbidden.get(id) : undefined
      if (id !== d.hover) {
        d.hover = id
        setHover(id ? { id, bad: !!kind } : null)
      }
      const lbl = labelRef.current
      if (!lbl) return
      if (id) {
        const t = byId.get(id)!
        lbl.hidden = false
        lbl.textContent = kind ? `✕ ${t.name} · ${refusalLabel(kind)}` : `→ under ${t.name}`
        lbl.classList.toggle('bad', !!kind)
        lbl.style.left = `${client.x + 14}px`
        lbl.style.top = `${client.y + 16}px`
      } else {
        lbl.hidden = true
      }
    },
    [screenToFlowPosition, forbidden, byId],
  )

  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback(
    (_event, node) => {
      const d = dragRef.current
      dragRef.current = null
      setDragging(null)
      setHover(null)
      if (labelRef.current) labelRef.current.hidden = true
      if (!d) return
      const mover = byId.get(node.id)
      if (!mover) return

      if (d.hover) {
        const target = byId.get(d.hover)!
        const kind = forbidden.get(d.hover)
        if (kind) {
          setError(refusalSentence(kind, subjectOf(mover), subjectOf(target)))
          glide(new Map([[node.id, d.from]]))
          return
        }
        move(node.id, d.hover)
        return
      }

      // Dropped on nothing: it stays there, and this browser remembers.
      manualRef.current.set(node.id, { ...node.position })
      writeManualLayout(storage(), schemeId, manualRef.current)
    },
    [byId, forbidden, glide, move, schemeId],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      // A line is drawn from the MANAGER down to the person.
      if (c.source && c.target) move(c.target, c.source)
    },
    [move],
  )

  /** Line every card up again, and show the whole of it. */
  const tidyUp = useCallback(() => {
    manualRef.current = new Map()
    writeManualLayout(storage(), schemeId, manualRef.current)
    glide(targetsFor(), () => void fitView({ duration: 450, padding: 0.12, minZoom: 0.55 }))
  }, [glide, targetsFor, fitView, schemeId])

  const openUpline = useCallback((staffId: string, anchor: PopAnchor) => {
    setPop(current => (current && current.moverId === staffId ? null : { moverId: staffId, anchor }))
  }, [])

  /** Show me where this person is: lit, and scrolled to. */
  const reveal = useCallback(
    (id: string) => {
      const pos = nodesRef.current.find(n => n.id === id)?.position ?? targetsFor().get(id)
      setSelected(id)
      setFind('')
      if (!pos) return
      void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
        zoom: Math.max(getZoom(), 0.9),
        duration: 400,
      })
    },
    [setCenter, getZoom, targetsFor],
  )

  const matches = useMemo(() => {
    const q = find.trim().toLowerCase()
    if (!q) return []
    const byName = people.filter(p => p.name.toLowerCase().includes(q))
    const byCode = people.filter(
      p => !p.name.toLowerCase().includes(q) && (p.code ?? '').toLowerCase().includes(q),
    )
    return [...byName, ...byCode].slice(0, 8)
  }, [people, find])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pop && selected) setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pop, selected])

  // No rung for their title on this ladder: on the tree, but the engine has
  // nothing to pay them from until they hold a ladder title.
  const noRank = people.filter(p => p.rankId === null).length

  const nodeTypes = useMemo(() => ({ person: PersonCard }), [])
  const edgeTypes = useMemo(() => ({ line: LineEdge }), [])

  const sel = selected ? byId.get(selected) : undefined
  const selDownlines = selected ? descendantsOf(graph, selected).size : 0
  const mover = pop ? byId.get(pop.moverId) : undefined

  return (
    <div>
      {error ? (
        <div key={error} className="org-slide bg-danger-bg border border-danger/50 text-danger rounded-md p-3 mb-3 text-sm font-sans">
          {error}
        </div>
      ) : null}
      {note && !error ? (
        <div key={note} className="org-slide flex items-center gap-3 bg-accent-bg border border-accent-border text-ink rounded-md px-3 py-2.5 mb-3 text-sm font-sans">
          <span className="flex-1">{note}</span>
          <button type="button" onClick={() => setNote(null)} className="text-graphite hover:text-ink text-base leading-none px-1" aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
      {layout.detached.length > 0 ? (
        <div className="bg-surface-2 border border-hairline text-graphite rounded-md p-3 mb-3 text-sm font-sans">
          {layout.detached.length} person(s) have an upline that no longer exists and are shown at
          the top level. Place them to fix it.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-serif italic text-muted text-xs">
          <span>
            {people.length} salespeople · {layout.roots.length} tree(s)
            {pending ? ' · saving…' : ''}
          </span>
          {noRank > 0 ? (
            <span className="text-graphite">{noRank} with no rank yet — title not on this ladder</span>
          ) : null}
          {tidy.shelfCount > 0 ? <span className="text-graphite">{tidy.shelfCount} on no line at all</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <input
              type="search"
              value={find}
              onChange={e => setFind(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && matches[0]) {
                  e.preventDefault()
                  reveal(matches[0].staffId)
                }
                if (e.key === 'Escape') setFind('')
              }}
              placeholder="Find somebody by name…"
              aria-label="Find somebody on the chart by name"
              className="w-full px-3 py-1.5 bg-surface border border-hairline rounded-control text-[13px] text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
            />
            {find.trim() ? (
              <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto border border-hairline rounded-control bg-surface shadow-md">
                {matches.length === 0 ? (
                  <p className="px-3 py-2 font-serif italic text-xs text-muted">Nobody on the chart matches that.</p>
                ) : (
                  matches.map(m => (
                    <button
                      key={m.staffId}
                      type="button"
                      onClick={() => reveal(m.staffId)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 border-b border-hairline last:border-b-0"
                    >
                      <span className="block font-sans text-sm text-ink truncate">{m.name}</span>
                      <span className="block font-mono text-[0.58rem] uppercase tracking-wide text-muted truncate">
                        {m.titleName ?? 'no title'} · {m.rankLabel ?? 'no rank yet'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={tidyUp}
            title="Line every card up again"
            className="border border-hairline bg-surface rounded-control px-3 py-1.5 text-[12.5px] font-medium font-sans text-graphite hover:text-ink hover:border-muted"
          >
            Tidy
          </button>
          <div className="org-zoom">
            <button type="button" onClick={() => void zoomOut({ duration: 250 })} aria-label="Zoom out">
              −
            </button>
            <button
              type="button"
              className="lv"
              title="Fit the whole chart"
              onClick={() => void fitView({ duration: 450, padding: 0.12, minZoom: 0.55 })}
            >
              <ZoomReadout />
            </button>
            <button type="button" onClick={() => void zoomIn({ duration: 250 })} aria-label="Zoom in">
              +
            </button>
          </div>
        </div>
      </div>

      {sel ? (
        <div key={sel.staffId} className="org-slide flex flex-wrap items-center gap-3 bg-surface border border-hairline border-l-[3px] border-l-accent rounded-md px-3 py-2 mb-3 text-[13px] font-sans">
          <b className="font-semibold text-ink">{sel.name}</b>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-graphite">
            {sel.titleName ?? 'no title'} · {sel.rankLabel ?? 'no rank yet'}
            {sel.productRate !== null ? ` · ${Math.round(sel.productRate * 100)}%` : ''}
            {sel.placedSince ? ` · placed since ${sel.placedSince}` : ''}
            {` · ${selDownlines} downline${selDownlines === 1 ? '' : 's'}`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            data-org-open
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect()
              openUpline(sel.staffId, { left: r.left, top: r.top, bottom: r.bottom })
            }}
            className="inline-flex items-center gap-2 border border-hairline bg-surface rounded-control px-2.5 py-1 text-[12.5px] font-medium text-ink hover:bg-surface-2"
          >
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">Upline</span>
            {sel.reportsTo && byId.has(sel.reportsTo) ? (
              byId.get(sel.reportsTo)!.name
            ) : (
              <i className="font-normal text-graphite">top of own tree</i>
            )}
            <Chevron />
          </button>
          <button
            type="button"
            disabled={pending || sel.reportsTo === null}
            onClick={() => move(sel.staffId, null)}
            className="border border-hairline bg-surface rounded-control px-2.5 py-1 text-[12.5px] font-medium text-graphite hover:text-ink disabled:opacity-40"
          >
            Detach to top
          </button>
          <button
            type="button"
            onClick={() => reveal(sel.staffId)}
            className="border border-hairline bg-surface rounded-control px-2.5 py-1 text-[12.5px] font-medium text-graphite hover:text-ink"
          >
            Centre
          </button>
          <button type="button" onClick={() => setSelected(null)} className="text-[12.5px] font-medium text-accent px-1.5 hover:underline">
            Done
          </button>
        </div>
      ) : null}

      <OpenUpline.Provider value={openUpline}>
        <div
          className={`org-canvas${entering ? ' enter' : ''}`}
          style={{ height: Math.min(760, Math.max(460, tidy.height + NODE_HEIGHT * 2)) }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_e, node) => setSelected(s => (s === node.id ? null : node.id))}
            onPaneClick={() => setSelected(null)}
            onConnect={onConnect}
            fitView
            // Twenty-eight cards fit a 1,200px column only at ~55%, which is
            // too small to read; open at a size the names read at and let the
            // reader pan. The Fit button goes further down when asked.
            fitViewOptions={{ padding: 0.12, minZoom: 0.7 }}
            minZoom={0.25}
            maxZoom={1.6}
            proOptions={{ hideAttribution: false }}
            nodesConnectable
            nodesDraggable
            elementsSelectable
          >
            <Background variant={BackgroundVariant.Lines} gap={48} color="rgb(var(--cv-grid) / 0.55)" />
            {tidy.shelfCount > 0 ? (
              <ViewportPortal>
                {layout.width > 0 ? (
                  <div
                    className="org-shelf-rule"
                    style={{
                      position: 'absolute',
                      left: tidy.shelfX - 48,
                      top: -8,
                      height: Math.max(tidy.height, NODE_HEIGHT) + 16,
                    }}
                  />
                ) : null}
                <div className="org-shelf-lbl" style={{ position: 'absolute', left: tidy.shelfX, top: -22 }}>
                  On no line · {tidy.shelfCount}
                </div>
              </ViewportPortal>
            ) : null}
          </ReactFlow>
        </div>
      </OpenUpline.Provider>
      <div ref={labelRef} className="org-droplbl" hidden />

      {pop && mover ? (
        <MovePopover
          key={`pop:${pop.moverId}`}
          mover={mover}
          people={people}
          graph={layoutGraph}
          anchor={pop.anchor}
          onPick={upline => {
            const id = pop.moverId
            setPop(null)
            move(id, upline)
          }}
          onClose={() => setPop(null)}
        />
      ) : null}

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
        <span className="font-serif italic text-xs text-muted">
          A title gives its rank; raises are set on the Team tab. This chart moves the reporting
          line — the same line People draws.
        </span>
      </div>
    </div>
  )
}

function ZoomReadout() {
  const { zoom } = useViewport()
  return <>{Math.round(zoom * 100)}%</>
}

function Chevron() {
  return (
    <svg className="chev w-[9px] h-[9px] text-accent" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** "B · 8%" — the rank letter and its rate, the way the chip reads it. */
function chipLabel(person: OrgPerson): string {
  const label = (person.rankLabel ?? '').replace(/^rank\s+/i, '')
  if (person.productRate === null || label.includes('%')) return label
  return `${label} · ${Math.round(person.productRate * 100)}%`
}

function PersonCard({ data }: NodeProps<CardNode>) {
  const { person, uplineName, invalidTarget, canTake, selected, target, bad, fresh } = data
  const open = useContext(OpenUpline)
  const cls = [
    'org-card',
    person.rankId === null ? 'unplaced' : '',
    selected ? 'sel' : '',
    invalidTarget ? 'forbid' : '',
    canTake ? 'can' : '',
    target ? 'target' : '',
    bad ? 'bad' : '',
    fresh ? 'fresh' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}>
      <Handle type="target" position={Position.Top} />

      <div className="oc-top">
        <div className="oc-nm" title={person.name}>
          {person.name}
        </div>
        {person.rankLabel ? (
          <span className="oc-rank">{chipLabel(person)}</span>
        ) : (
          <span className="oc-rank none">no rank yet</span>
        )}
      </div>
      <div className="oc-tt">
        {person.titleName ?? person.code ?? 'no title'}
        {!person.canRecruit ? <span className="nd">· no downlines</span> : null}
        {person.rateMode === 'fixed' ? <span className="nd">· manual</span> : null}
      </div>

      <button
        type="button"
        className="oc-up nodrag nopan"
        data-org-open
        aria-label={`Change upline of ${person.name}`}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          open(person.staffId, { left: r.left, top: r.top, bottom: r.bottom })
        }}
      >
        <span className="k">Upline</span>
        {uplineName ? (
          <span className="v">{uplineName}</span>
        ) : (
          <span className="v top">top of own tree</span>
        )}
        <Chevron />
      </button>

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

/**
 * One line, as React Flow would draw it — but the path is ours so it can
 * carry `pathLength="1"`, which is what lets the just-made line draw itself
 * (the dash animation in `.react-flow__edge.fresh`) whatever its length.
 */
function LineEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<LineEdge>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 6,
  })
  return <path d={path} className="react-flow__edge-path" pathLength={data?.fresh ? 1 : undefined} />
}
