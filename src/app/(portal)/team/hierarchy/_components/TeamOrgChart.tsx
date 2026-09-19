'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  descendantsOf,
  wouldCycle,
  NODE_HEIGHT,
  NODE_WIDTH,
  type OrgNodeInput,
} from '@/lib/org-layout'
import { ladderAllows, ladderRefusal } from '@/lib/ladder'
import { lineRefusal } from '@/lib/hierarchy-boundary'
import { headLines, headsLabel, layoutParent, reportsToHeads } from '@/lib/department-heads'
import { setReportsTo, undoHierarchyMove, type UndoMoveInput } from '../actions'
import { boundsOf, rectanglePoints } from '@/lib/hierarchy-spaces'
import { hierarchyTitleAppearance } from '@/lib/hierarchy-title-appearance'
import { useCompanyHierarchySpaces } from './CompanyHierarchySpaces'

export interface ChartPerson {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  /** True in a department the commission engine pays. The reporting line may
   *  not cross that department's edge — `lib/hierarchy-boundary.ts`. */
  commissionDept: boolean
  /** Inside a commission department: may their title hold downlines? Null
   *  when the department's ladder does not carry the title, or the department
   *  is not paid by commission (the rule then says nothing). A head may. */
  canRecruit: boolean | null
  /** Their title heads the department (Revenue Director, 2026-09-11): above
   *  the ladder, no rank, and the line to them is derived, not written. */
  isDepartmentHead: boolean
  /** The heads the top of their tree reports to, A→Z — `lib/department-heads.ts`.
   *  Empty outside a commission department, and for a head themselves. */
  leadIds: string[]
  /** Where their title stands on the ladder. Null when it is not placed —
   *  the ladder then has nothing to say about them. */
  levelRank: number | null
  levelName: string | null
  reportsTo: string | null
}

interface CardData extends Record<string, unknown> {
  person: ChartPerson
  invalidTarget: boolean
  selected: boolean
  tone: number
  managerName: string | null
}

/** No department chosen — the whole company. Exported because the page owns
 *  the choice now: the rail beside this canvas has to answer the same filter. */
export const ALL_DEPARTMENTS = '__all__'
const NO_DEPARTMENT = '__unassigned__'
const departmentKey = (name: string | null) => name ?? NO_DEPARTMENT

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
 * Since 2026-09-10 there is ONE line. Inside a commission department who
 * somebody reports to is who earns the override on their sales, and the
 * commission position follows this column in the database — so a drag here
 * is the whole move, and two rules of that department apply to it: the line
 * may not cross the department's edge, and it may only go to a title that
 * may hold downlines (`lib/hierarchy-boundary.ts`).
 *
 * Since 2026-09-11 the top of every Revenue tree hangs from the department's
 * head(s) — the Revenue Director(s) the sub-department reports to. That line
 * is DERIVED (`leadIds`), drawn dashed, and carries no override; with two
 * directors the layout hangs the tree from the first and draws the second
 * line across. Dropping somebody on a director makes them the top of a tree:
 * the server writes null, and the chart draws the director line itself.
 */
export default function TeamOrgChart(props: {
  people: ChartPerson[]
  commissionHref: string | null
  /** Who is lit up. Owned by the page so the panel beside the canvas and the
   *  canvas itself point at the same person — clicking a name in the list
   *  scrolls the chart to them, clicking a card highlights the name. */
  focused: string | null
  onFocus: (staffId: string | null) => void
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
  focusDept,
  onFocusDept,
}: {
  people: ChartPerson[]
  commissionHref: string | null
  focused: string | null
  onFocus: (staffId: string | null) => void
  focusDept: string
  onFocusDept: (department: string) => void
}) {
  const router = useRouter()
  const { getIntersectingNodes, setCenter, setViewport, fitBounds, zoomIn, zoomOut } = useReactFlow()
  const [flowReady, setFlowReady] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [arrangementVersion, setArrangementVersion] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [warn, setWarn] = useState(false)
  /**
   * The way back from the move just made, or null.
   *
   * ONE move deep, and it is cleared by the next gesture rather than
   * stacked. A chart where Undo might mean any of the last five drops is
   * worse than one where it means exactly the drop you are still looking
   * at — and a stack over effective-dated commission rows would let
   * somebody walk backwards across a month boundary, where each step back
   * writes a THIRD row rather than removing the second.
   *
   * Captured from the render the drop was aimed at, because after the
   * write this page no longer holds a copy of the manager they left. The
   * server re-reads all of it and refuses if anything moved underneath;
   * see `lib/hierarchy-undo.ts`.
   */
  const [undo, setUndo] = useState<UndoMoveInput | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const draggedPerson = useRef<string | null>(null)
  /**
   * The name being searched for.
   *
   * This replaced the commission rail (user, 2026-09-08). Clicking a card
   * used to centre that person on the chart beside this one, and finding
   * where somebody sits was the one thing the pair genuinely made easy —
   * so it is done directly now, on a tree that is often wider than the
   * window and where hunting for one card means panning blind.
   */
  const [find, setFind] = useState('')
  /** Bumped by a search so re-picking the SAME person still re-centres. */
  const [revealAt, setRevealAt] = useState(0)
  const selected = focused

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  const matches = useMemo(() => {
    const q = find.trim().toLowerCase()
    if (!q) return []
    // Deliberately over `people` and not `visible`: somebody hidden by the
    // department chips is still ON this chart, and answering “nobody matches”
    // because a filter is on would be a lie the reader cannot see through.
    // Name first, then code, so typing a name never surfaces a code match above
    // an exact one.
    const byName = people.filter(p => p.name.toLowerCase().includes(q))
    const byCode = people.filter(
      p => !p.name.toLowerCase().includes(q) && (p.code ?? '').toLowerCase().includes(q),
    )
    return [...byName, ...byCode].slice(0, 8)
  }, [people, find])

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people) if (p.department) set.add(p.department)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [people])
  const departmentDefinitions = useMemo(() => [
    ...departments.map(name => ({ id: departmentKey(name), name })),
    ...(people.some(person => !person.department) ? [{ id: NO_DEPARTMENT, name: 'No department' }] : []),
  ], [departments, people])
  const members = useMemo(() => people.map(person => ({
    id: person.id,
    departmentId: departmentKey(person.department),
    // Directors remain separate staff cards. Their derived lines do not merge
    // every Revenue team into a single frame.
    parentId: person.reportsTo,
    name: person.name,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  })), [people])
  const spaces = useCompanyHierarchySpaces(members, departmentDefinitions,
    focusDept === ALL_DEPARTMENTS ? null : focusDept)

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
    () => (focusDept === ALL_DEPARTMENTS ? people : people.filter(p => departmentKey(p.department) === focusDept)),
    [people, focusDept],
  )
  const visibleIds = useMemo(() => new Set(visible.map(p => p.id)), [visible])

  // Sorted by department then name, so unattached people cluster with their
  // own department instead of interleaving across the top row. The label is
  // only ever used for ordering — the card draws the real one.
  // The top of a Revenue tree hangs from the first of its heads, so the tree
  // is drawn under the director rather than beside them (`layoutParent`).
  const graph: OrgNodeInput[] = useMemo(
    () =>
      people.map(p => ({
        id: p.id,
        parentId: layoutParent(p),
        label: `${p.department ?? 'zzz'} ${p.name}`,
      })),
    [people],
  )

  /** Everything the person being dragged may not be dropped on: their own
   *  reports, anybody the ladder ranks below them, everybody on the other side
   *  of a commission department's edge, and — inside such a department —
   *  anybody whose title cannot hold downlines. A card that cannot be dropped
   *  on is a rule explained before it is broken; the database refuses all
   *  four again, and its sentence is what somebody gets who got past this. */
  const forbidden = useMemo(() => {
    if (!dragging) return new Set<string>()
    const out = descendantsOf(graph, dragging)
    out.add(dragging)
    const mover = byId.get(dragging)
    if (mover) {
      for (const p of visible) {
        if (mover.levelRank !== null && !ladderAllows(mover.levelRank, p.levelRank)) out.add(p.id)
        if (lineRefusal(mover, p)) out.add(p.id)
      }
    }
    return out
  }, [dragging, graph, byId, visible])

  const [nodes, setNodes] = useState<Node<CardData>[]>([])
  useEffect(() => {
    setNodes(visible.flatMap(p => {
        const pos = spaces.positions.get(p.id)
        if (!pos) return []
        return {
          id: p.id,
          type: 'person',
          deletable: false,
          selected: selected === p.id,
          position: { x: pos.x, y: pos.y },
          data: {
            person: p,
            invalidTarget: forbidden.has(p.id),
            selected: selected === p.id,
            tone: departmentDefinitions.findIndex(department => department.id === departmentKey(p.department)) % 3,
            managerName: p.reportsTo ? byId.get(p.reportsTo)?.name ?? 'Outside this chart'
              : headsLabel(p.leadIds.map(id => byId.get(id)?.name).filter((name): name is string => !!name)) || null,
          },
        }
      }))
  }, [visible, spaces.positions, forbidden, selected, departmentDefinitions, byId])

  const fitCompany = useCallback(() => {
    const frames = spaces.geometry.departments.filter(department => focusDept === ALL_DEPARTMENTS || department.id === focusDept)
    if (frames.length) void fitBounds(boundsOf(frames.flatMap(frame => rectanglePoints(frame.bounds))), {
      padding: 0.12, duration: 320,
    })
  }, [spaces.geometry, focusDept, fitBounds])
  const showHorizontal = useCallback(() => {
    const frames = spaces.geometry.departments.filter(department => focusDept === ALL_DEPARTMENTS || department.id === focusDept)
    if (!frames.length) return
    const bounds = boundsOf(frames.flatMap(frame => rectanglePoints(frame.bounds)))
    const width = canvasRef.current?.clientWidth || 1100
    const height = canvasRef.current?.clientHeight || 740
    // Start at the left of the horizontal canvas at a readable size. Fitting
    // all seven departments would reduce every card to a tiny thumbnail.
    const zoom = Math.min(0.7, Math.max(0.45, (height - 64) / bounds.height))
    void setViewport({
      x: Math.max(32, (width - bounds.width * zoom) / 2) - bounds.x * zoom,
      y: 32 - bounds.y * zoom,
      zoom,
    }, { duration: 320 })
  }, [spaces.geometry, focusDept, setViewport])
  const fittedDepartment = useRef<string | null>(null)
  useEffect(() => {
    const viewKey = `${focusDept}:${arrangementVersion}`
    if (!spaces.loaded || !flowReady || fittedDepartment.current === viewKey) return
    fittedDepartment.current = viewKey
    showHorizontal()
  }, [spaces.loaded, flowReady, focusDept, arrangementVersion, showHorizontal])

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
    // The derived line from each director down to the top of every tree they
    // direct. Dashed: it is where the reporting line ends and no override
    // climbs it. Both directors get one when a sub-department has two.
    const directing: Edge[] = headLines(visible)
      .filter(line => visibleIds.has(line.headId))
      .map(line => ({
        id: `h:${line.headId}->${line.staffId}`,
        source: line.headId,
        target: line.staffId,
        type: 'smoothstep',
        style: { stroke: 'var(--hairline-strong, #b9b0a2)', strokeWidth: 1.5, strokeDasharray: '5 4' },
      }))
    return [...reporting, ...directing]
  }, [visible, visibleIds, byId])

  const move = useCallback(
    (childId: string, parentId: string | null) => {
      const child = byId.get(childId)
      if (!child || pending) return
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
        // `forbidden` already refuses this drop, so reaching here means the
        // gesture arrived by some other route — the table's picker, a keyboard
        // drop, a page held open across a department change. Said in full
        // rather than swallowed: the same sentence the server would return.
        const refused = lineRefusal(child, parent)
        if (refused) {
          setError(refused)
          return
        }
      }

      setError(null)
      setWarn(false)
      setUndo(null)
      // The line as the card the drop was aimed at still has it. `child` is a
      // snapshot from that render rather than a live view, so it keeps the
      // pre-move value even after `router.refresh()` replaces `people`.
      const was = child.reportsTo
      startTransition(async () => {
        try {
          const result = await setReportsTo(childId, parentId)
          if (!result.ok) {
            setError(result.reason)
            return
          }
          // What the column now holds — null when they were dropped on a
          // director, whose line is derived rather than written. An undo puts
          // back the value that was written, not the card that was aimed at.
          const landed = result.reportsTo
          if (was !== landed) setUndo({ staffId: childId, reportsTo: was, movedTo: landed })
          const heads = headsLabel(
            child.leadIds.map(id => byId.get(id)?.name).filter((name): name is string => !!name),
          )
          const moved = landed
            ? `${child.name} now reports to ${byId.get(landed)!.name}.`
            : heads
              ? `${child.name} now stands at the top of a tree, reporting to ${heads} — the department's director.`
              : `${child.name} now reports to nobody.`
          // Inside a commission department the line IS the override, so a
          // detach there is a money change and is said in full.
          setNote(
            child.commissionDept
              ? landed
                ? `${moved} The override on their sales goes to ${byId.get(landed)!.name} from this month.`
                : `${moved} Nobody earns an override on their sales from this month.`
              : moved,
          )
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move them')
        }
      })
    },
    [byId, graph, router, pending],
  )

  const onNodeDragStop: OnNodeDrag<Node<CardData>> = useCallback(
    (_event, node) => {
      draggedPerson.current = null
      setDragging(null)
      setNodes(current => current.map(item => ({ ...item, position: spaces.positions.get(item.id) ?? item.position })))
      const hits = getIntersectingNodes(node).filter(n => n.id !== node.id && !forbidden.has(n.id))
      const target = hits[0]
      if (target) move(node.id, target.id)
    },
    [forbidden, getIntersectingNodes, move, spaces.positions],
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
    if (!focused) { centred.current = null; return }
    if (!flowReady || focused === centred.current || !spaces.loaded) return
    const pos = spaces.positions.get(focused)
    if (!pos) return
    centred.current = focused
    void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
      zoom: 1,
      duration: 320,
    })
  }, [focused, spaces.positions, spaces.loaded, setCenter, revealAt, flowReady])

  /**
   * Show me where this person is.
   *
   * Three steps, and the first is the one that makes the search honest: a
   * card the department chips have filtered out cannot be scrolled to, so
   * the filter is widened rather than the search failing on somebody who is
   * plainly there. Then the card is lit, and the effect above scrolls to it.
   */
  const reveal = useCallback(
    (id: string) => {
      const person = byId.get(id)
      if (!person) return
      if (focusDept !== ALL_DEPARTMENTS && departmentKey(person.department) !== focusDept) {
        onFocusDept(ALL_DEPARTMENTS)
      }
      // Cleared so somebody ALREADY selected is centred again rather than
      // silently ignored — searching a name twice has to move the canvas twice.
      centred.current = null
      onFocus(id)
      setRevealAt(n => n + 1)
      setFind('')
    },
    [byId, focusDept, onFocusDept, onFocus],
  )

  const nodeTypes = useMemo(() => ({ person: PersonCard }), [])

  // Every count describes the canvas, not the company — a line that says
  // "9 people" over a chart showing 3 is worse than no line at all. The top
  // of a Revenue tree reports to its director, not to nobody.
  const unplaced = visible.filter(p => !p.reportsTo && !reportsToHeads(p)).length
  const directed = visible.filter(p => reportsToHeads(p) && p.leadIds.some(id => visibleIds.has(id))).length
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
        <div role="alert" className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}
      {note && !error ? (
        <div
          className={`rounded-md p-3 mb-4 text-sm font-sans border ${
            warn ? 'bg-alert-bg border-alert/40 text-alert' : 'bg-surface-2 border-hairline text-ink'
          }`}
        >
          {note}
          {undo ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const was = undo
                // Cleared first: a second click is a second move forward, not a
                // second undo, and the button is gone before it can be pressed.
                setUndo(null)
                setError(null)
                startTransition(async () => {
                  try {
                    const outcome = await undoHierarchyMove(was)
                    setNote(outcome.note)
                    // A refusal and a half-undo both warn. Only everything going
                    // back reads as the plain confirmation it is.
                    setWarn(!outcome.undone)
                    router.refresh()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not put that back')
                    setNote(null)
                  }
                })
              }}
              className="ml-2 underline hover:no-underline disabled:opacity-50 disabled:no-underline"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="space-toolbar">
        <div className="space-jumps" aria-label="Filter by department">
          <button type="button" onClick={() => {
            if (focusDept === ALL_DEPARTMENTS) showHorizontal()
            else onFocusDept(ALL_DEPARTMENTS)
          }} aria-pressed={focusDept === ALL_DEPARTMENTS}>Whole company</button>
          {departmentDefinitions.map(department => <button
            key={department.id} type="button"
            onClick={() => onFocusDept(focusDept === department.id ? ALL_DEPARTMENTS : department.id)}
            aria-pressed={focusDept === department.id}
          >{department.name}</button>)}
        </div>
        <div className="space-actions">
      <div className="space-search">
        <input
          type="search"
          value={find}
          onChange={e => setFind(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault()
              reveal(matches[0].id)
            }
            if (e.key === 'Escape') setFind('')
          }}
          placeholder="Find a person…"
          aria-label="Find somebody on the chart by name"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
        />
        {find.trim() ? (
          <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto border border-hairline rounded-control bg-surface shadow-md">
            {matches.length === 0 ? (
              <p className="px-3 py-2 font-serif italic text-xs text-muted">
                Nobody on the chart matches that.
              </p>
            ) : (
              matches.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => reveal(m.id)}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 border-b border-hairline last:border-b-0"
                >
                  <span className="block font-serif text-sm text-ink truncate">{m.name}</span>
                  <span className="block font-mono text-[0.58rem] uppercase tracking-wide text-muted truncate">
                    {m.title ?? 'no title'} · {m.department ?? 'no department'}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

          <button type="button" className="space-tidy" onClick={() => {
            spaces.tidy()
            setArrangementVersion(version => version + 1)
          }} title="Arrange all departments and teams horizontally">Tidy</button>
          <div className="org-zoom">
            <button type="button" onClick={() => void zoomOut({ duration: 250 })} aria-label="Zoom out">−</button>
            <button type="button" className="lv" onClick={fitCompany} aria-label="Fit visible departments"><ZoomReadout /></button>
            <button type="button" onClick={() => void zoomIn({ duration: 250 })} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>

      <div className="space-overview">
        <p className="font-serif italic text-muted text-xs">
          {visible.length} people · {spaces.geometry.departments.filter(department => focusDept === ALL_DEPARTMENTS || department.id === focusDept).length} departments
          {' · '}{spaces.teams.filter(team => focusDept === ALL_DEPARTMENTS || team.departmentId === focusDept).length} teams · {unplaced} reporting to nobody
          {directed > 0 ? ` · ${directed} at the top of a tree under a director` : ''}
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
        <span>{pending ? 'Saving reporting line…' : 'Horizontal layout · Drag the canvas to explore'}</span>
      </div>

      <div ref={canvasRef} className={`org-canvas space-canvas${spaces.moving ? ' space-dragging' : ''}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={() => { centred.current = null; setFlowReady(true) }}
          onNodesChange={changes => {
            setNodes(current => applyNodeChanges(changes.filter(change => change.type !== 'remove'
              && (change.type !== 'position' || change.id === draggedPerson.current)), current))
            const dimensions = changes.flatMap(change => change.type === 'dimensions' && change.dimensions
              ? [{ id: change.id, ...change.dimensions }] : [])
            if (dimensions.length) spaces.updateDimensions(dimensions)
          }}
          onNodeDragStart={(_e, node) => {
            draggedPerson.current = node.id
            setNote(null)
            setWarn(false)
            setUndo(null)
            setDragging(node.id)
          }}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_e, node) => onFocus(focused === node.id ? null : node.id)}
          onConnect={onConnect}
          minZoom={0.02}
          deleteKeyCode={null}
          maxZoom={1.7}
          panOnDrag={spaces.moving ? false : [0, 1]}
          proOptions={{ hideAttribution: false }}
          nodesConnectable={!pending}
          nodesDraggable={!pending && !spaces.moving}
          elementsSelectable
        >
          <Background gap={24} color="rgb(var(--cv-grid))" />
          <ViewportPortal>{spaces.frames}</ViewportPortal>
        </ReactFlow>
      </div>

      <div className="space-footer">
        <span className="text-xs text-muted">Drag a team or department heading or border to arrange the canvas.</span>
        {selected && visibleIds.has(selected) ? (
          <button
            type="button"
            disabled={pending}
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
        <span className="inline-flex items-center gap-2 font-serif italic text-xs text-graphite">
          <svg width="26" height="6" aria-hidden>
            <line x1="0" y1="3" x2="26" y2="3" stroke="var(--hairline-strong, #b9b0a2)" strokeWidth="1.5" />
          </svg>
          Reports to
        </span>
        {directed > 0 ? (
          <span className="inline-flex items-center gap-2 font-serif italic text-xs text-graphite">
            <svg width="26" height="6" aria-hidden>
              <line x1="0" y1="3" x2="26" y2="3" stroke="var(--hairline-strong, #b9b0a2)" strokeWidth="1.5" strokeDasharray="5 4" />
            </svg>
            Reports to the department&rsquo;s director · no override
          </span>
        ) : null}
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
        {/* The rank each Revenue person is paid from is read on their own
            chart, where a period is in scope; this is the way there. */}
        {commissionHref ? (
          <Link
            href={commissionHref}
            className="font-sans text-[11px] text-accent hover:underline"
          >
            Commission hierarchy on Revenue →
          </Link>
        ) : null}
      </div>

      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        A greyed card cannot take the person being dragged — it is one of their
        own reports, the ladder ranks its title below theirs, they stand on the
        other side of a commission department&rsquo;s edge, or their title cannot
        hold downlines there. A red line is one the ladder would refuse today:
        move the line, or change the ladder from the Levels tab. Inside Revenue
        this line is also who earns the override on their sales, so a move here
        is the whole move — except the dashed line up to the Revenue Director,
        which every team leader and standalone member has by being at the top
        of a tree: it is set per sub-department on Revenue, and no override
        climbs it. Dropping somebody on a director puts them at the top of a
        tree.
      </p>
    </div>
  )
}

function ZoomReadout() {
  const { zoom } = useViewport()
  return <>{Math.round(zoom * 100)}%</>
}

function PersonCard({ data }: NodeProps<Node<CardData>>) {
  const { person, invalidTarget, selected, tone, managerName } = data
  const title = hierarchyTitleAppearance(person.title)
  return (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      data-space-tone={tone}
      className={`org-card space-person${selected ? ' sel' : ''}${invalidTarget ? ' forbid' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="oc-top">
        <div className="oc-nm" title={`${person.name} · ${person.department ?? 'No department'}`}>{person.name}</div>
        {person.levelRank !== null ? <span className="oc-rank" title={`Level ${person.levelRank} · ${person.levelName ?? ''}`}>
          L{person.levelRank}
        </span> : null}
      </div>
      <div className="oc-tt oc-title-row">
        <span className="oc-title-badge" data-title-tone={person.isDepartmentHead ? 'head' : title.tone}>
          <span className="oc-title-marker" aria-hidden="true">{title.marker}</span>
          <span className="oc-title-label">{title.label}</span>
        </span>
      </div>
      <div className="px-[11px] pb-1 font-mono text-[9px] text-[rgb(var(--cv-muted))] truncate"
        title={`${person.code ?? 'No employee code'} · ${person.department ?? 'No department'}`}>
        {person.code ?? '—'} · {person.department ?? 'No department'}
      </div>
      <div className="oc-up" title={managerName ?? 'Reports to nobody'}>
        <span className="k">Reports to</span>
        <span className={`v${managerName ? '' : ' top'}`}>{managerName ?? 'Nobody'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
