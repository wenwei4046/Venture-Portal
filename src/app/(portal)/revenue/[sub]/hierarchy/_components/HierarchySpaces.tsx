'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from 'react'
import {
  Background, BackgroundVariant, ReactFlow, ReactFlowProvider, ViewportPortal,
  applyNodeChanges, useReactFlow, useViewport,
  type Connection, type Edge, type EdgeProps, type NodeChange, type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { descendantsOf, NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import { moveRefusal, refusalSentence } from '@/lib/commission/chart-moves'
import { readManualLayout, writeManualLayout, type ManualLayout } from '@/lib/commission/chart-layout-store'
import { headsLabel, sortHeads } from '@/lib/department-heads'
import { boundsOf, rectanglePoints, type Bounds, type Point } from '@/lib/hierarchy-spaces'
import { hierarchyTitleAppearance } from '@/lib/hierarchy-title-appearance'
import { planHierarchyTransfer } from '@/lib/hierarchy-transfer-layout'
import {
  alignSpaceTeams, buildSpaceTeams, departmentPositionKey, directorRail, geometryForSpaces, initialSpacePositions,
  resolveSpaceOverlaps, SPACE_DEPARTMENT_HEADER, SPACE_DEPARTMENT_PADDING, SPACE_RAIL_LABEL, SPACE_TEAM_HEADER,
  type DirectorRail, type SpaceAnchor, type SpaceGeometry, type SpaceMember,
} from '@/lib/hierarchy-space-layout'
import { moveOnChart } from '../../../hierarchy-actions'
import MovePopover, { subjectOf, type PopAnchor } from './MovePopover'
import HierarchyPersonCard, { PersonMenuContext, UplineContext, type PersonNode } from './HierarchyPersonCard'
import PersonContextMenu from './PersonContextMenu'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import { membershipKey, type OrgDepartment, type OrgDirector } from './org-chart-types'
import { useHierarchyCamera } from './useHierarchyCamera'

interface Props { departments: OrgDepartment[]; initialDepartmentId?: string; membershipDestinations?: MembershipDestination[] }
type ReportingEdge = Edge<{ fresh?: boolean }, 'line'>
type DropTarget = { id: string; reason: string | null; armed: boolean; unchanged: boolean }
type ArrangeOptions = { keepVisible?: boolean; alignMembers?: boolean; origin?: ManualLayout }
const nodeTypes = { person: HierarchyPersonCard }
const edgeTypes = { line: ReportingLine }
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const layoutStorage = () => { try { return window.localStorage } catch { return null } }
const duration = (ms: number) => reducedMotion() ? 0 : ms
const springEase = (t: number) => 1 + 1.8 * (t - 1) ** 3 + 0.8 * (t - 1) ** 2
const pointerOf = (event: MouseEvent | TouchEvent) => {
  const pointer = 'touches' in event ? event.touches[0] ?? event.changedTouches[0] : event
  return { x: pointer?.clientX ?? 0, y: pointer?.clientY ?? 0 }
}

/** Deliberate card drops, Upline picks and connectors share the validated writer. */
export default function HierarchySpaces(props: Props) {
  return <ReactFlowProvider><SpaceChart {...props} /></ReactFlowProvider>
}

function SpaceChart({ departments: serverDepartments, initialDepartmentId, membershipDestinations = [] }: Props) {
  const { fitBounds, setCenter, getZoom, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow()
  const camera = useHierarchyCamera()
  const { interrupt: interruptCamera, makeRoom, followTransfer } = camera
  // A successful write can be shown immediately; the next server snapshot is
  // authoritative — and it arrives with the action's own response, since the
  // action revalidates the route (no router.refresh() on top, 2026-09-11).
  const [savedMoves, setSavedMoves] = useState<Map<string, { source: OrgDepartment[]; parentId: string | null }>>(new Map())
  const departments = useMemo(() => serverDepartments.map(department => ({ ...department,
    people: department.people.map(person => {
      const saved = savedMoves.get(membershipKey(department.schemeId, person.staffId))
      return saved?.source === serverDepartments ? { ...person, uplineStaffId: saved.parentId } : person
    }),
  })), [serverDepartments, savedMoves])
  const [pending, startTransition] = useTransition()
  const [nodes, setNodes] = useState<PersonNode[]>([])
  const nodesRef = useRef<PersonNode[]>([])
  const positions = useRef<ManualLayout>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const [activeDepartment, setActiveDepartment] = useState<string | null>(initialDepartmentId ?? null)
  const [movingDepartment, setMovingDepartment] = useState<string | null>(null)
  const [movingTeam, setMovingTeam] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [find, setFind] = useState('')
  const [popover, setPopover] = useState<{ id: string; anchor: PopAnchor } | null>(null)
  const [personMenu, setPersonMenu] = useState<{ id: string; anchor: PopAnchor; startAtDepartments?: boolean } | null>(null)
  const menuTrigger = useRef<HTMLElement | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragSession = useRef<{ id: string; origin: ManualLayout; cancelled: boolean } | null>(null)
  const writing = useRef(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const incomingTransfer = useRef<(NonNullable<ReturnType<typeof planHierarchyTransfer>> & { storageKey: string }) | null>(null)
  const moveRef = useRef<(childId: string, parentId: string | null, origin?: ManualLayout) => void>(() => {})

  const records = useMemo(() => departments.flatMap((department, tone) => department.people.map(person => ({
    id: membershipKey(department.schemeId, person.staffId), person, department, tone: tone % 3,
  }))), [departments])
  const byId = useMemo(() => new Map(records.map(record => [record.id, record])), [records])
  const departmentDefinitions = useMemo(() => departments.map(({ id, name }) => ({ id, name })), [departments])
  // The heads the sub-departments report to, each ONCE, A→Z: the rail above
  // every frame (design A, 2026-09-12). Not members, not nodes — drawn from
  // the frames' geometry, like the headings, with one line per frame directed.
  const railDirectors = useMemo(() => {
    const byStaff = new Map<string, OrgDirector & { departmentIds: string[]; departmentNames: string[] }>()
    for (const department of departments) {
      for (const director of department.directors ?? []) {
        const entry = byStaff.get(director.staffId) ?? { ...director, departmentIds: [], departmentNames: [] }
        entry.departmentIds.push(department.id)
        entry.departmentNames.push(department.name)
        byStaff.set(director.staffId, entry)
      }
    }
    return sortHeads([...byStaff.values()])
  }, [departments])
  const members: SpaceMember[] = useMemo(() => records.map(record => ({
    id: record.id,
    departmentId: record.department.id,
    parentId: record.person.uplineStaffId ? membershipKey(record.department.schemeId, record.person.uplineStaffId) : null,
    name: record.person.name,
    width: NODE_WIDTH,
    height: record.person.directLineLimit != null ? NODE_HEIGHT + 20 : NODE_HEIGHT,
  })), [records])
  const teams = useMemo(() => buildSpaceTeams(members), [members])
  const teamByMember = useMemo(() => new Map(teams.flatMap(team => team.memberIds.map(id => [id, team] as const))), [teams])
  const defaults = useMemo(() => initialSpacePositions(departmentDefinitions, members, teams), [departmentDefinitions, members, teams])
  const storageKey = useMemo(() => `spaces.v1.${departments.map(department => department.schemeId).sort().join('.')}`, [departments])
  const model = useRef({ departments: departmentDefinitions, members, teams })
  model.current = { departments: departmentDefinitions, members, teams }
  const geometryRef = useRef<SpaceGeometry>({ teams: [], departments: [] })
  const geometryOverride = useRef<SpaceGeometry | null>(null)
  const layoutRecords = useRef(records)

  const measuredMembers = useCallback(() => {
    const measured = new Map(nodesRef.current.map(node => [node.id, node.measured]))
    return model.current.members.map(member => ({
      ...member,
      width: measured.get(member.id)?.width ?? member.width,
      height: measured.get(member.id)?.height ?? member.height,
    }))
  }, [])
  const geometry = useMemo(() => geometryOverride.current ?? (layoutRecords.current !== records && geometryRef.current.departments.length
    ? geometryRef.current : geometryForSpaces(departmentDefinitions, members.map(member => {
    const node = nodes.find(node => node.id === member.id)
    return { ...member, width: node?.measured?.width ?? member.width, height: node?.measured?.height ?? member.height }
  }), teams, positions.current)), [departmentDefinitions, members, teams, nodes, records])
  geometryRef.current = geometry
  const rail: DirectorRail = useMemo(() => directorRail(
    railDirectors.map(director => ({ id: director.staffId, name: director.name, departmentIds: director.departmentIds })),
    geometry.departments,
  ), [railDirectors, geometry])
  const railRef = useRef(rail)
  railRef.current = rail

  const animation = useRef<number | null>(null)
  const settlingTarget = useRef<ManualLayout | null>(null)
  const arrangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggedMember = useRef<string | null>(null)
  const suppressClick = useRef(0)
  const groupDrag = useRef<{
    pointerId: number; departmentId: string; teamId?: string; x: number; y: number; zoom: number;
    original: ManualLayout; keys: Set<string>; moved: boolean;
    element: HTMLButtonElement;
  } | null>(null)

  const cancelAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
    settlingTarget.current = null
    geometryOverride.current = null
    if (arrangeTimer.current) clearTimeout(arrangeTimer.current)
    arrangeTimer.current = null
  }, [])
  const publishPositions = useCallback((next: ManualLayout) => {
    positions.current = new Map(next)
    setNodes(previous => {
      const updated = previous.map(node => {
        const point = next.get(node.id)
        return point ? { ...node, position: point } : node
      })
      nodesRef.current = updated
      return updated
    })
  }, [])
  const persist = useCallback((next: ManualLayout) => writeManualLayout(layoutStorage(), storageKey, next), [storageKey])
  const completeSettling = () => {
    // A group gesture starts from the committed layout, never a halfway transfer.
    const target = settlingTarget.current
    cancelAnimation()
    if (target) publishPositions(target)
  }
  const glide = useCallback((target: ManualLayout, springIds: readonly string[] = []) => {
    const fromGeometry = geometryRef.current
    cancelAnimation()
    persist(target)
    settlingTarget.current = target
    const from = new Map(positions.current)
    const value = model.current
    const targetGeometry = geometryForSpaces(value.departments, measuredMembers(), value.teams, target)
    const changed = JSON.stringify(fromGeometry) !== JSON.stringify(targetGeometry) || [...target].some(([id, point]) => {
      const old = from.get(id)
      return !old || Math.hypot(point.x - old.x, point.y - old.y) > 0.1
    })
    if (!changed || reducedMotion()) { settlingTarget.current = null; publishPositions(target); return }
    geometryOverride.current = interpolateGeometry(fromGeometry, targetGeometry, 0)
    const spring = new Set(springIds)
    const started = performance.now()
    const step = (now: number) => {
      // Chrome can stamp the first frame EARLIER than the performance.now()
      // sampled above (seen on a first load in a background tab). Clamped at
      // 0, or the frames would extrapolate backwards — a negative height.
      const progress = Math.max(0, Math.min(1, (now - started) / 500))
      const eased = 1 - (1 - progress) ** 3
      const current = new Map<string, Point>()
      geometryOverride.current = interpolateGeometry(fromGeometry, targetGeometry, eased)
      for (const [id, end] of target) {
        const start = from.get(id) ?? end
        const amount = spring.has(id) ? springEase(progress) : eased
        current.set(id, { x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount })
      }
      if (progress === 1) geometryOverride.current = null
      publishPositions(current)
      if (progress < 1) animation.current = requestAnimationFrame(step)
      else { animation.current = null; settlingTarget.current = null }
    }
    animation.current = requestAnimationFrame(step)
  }, [cancelAnimation, persist, publishPositions, measuredMembers])
  const arrange = useCallback((anchor?: SpaceAnchor, options: ArrangeOptions = {}) => {
    const value = model.current
    const measured = measuredMembers()
    const aligned = options.alignMembers
      ? alignSpaceTeams(measured, value.teams, positions.current, options.origin ?? positions.current, anchor?.teamId ? [anchor.teamId] : undefined)
      : positions.current
    const target = resolveSpaceOverlaps(value.departments, measured, value.teams, aligned, anchor)
    if (options.keepVisible) {
      const shapes = geometryForSpaces(value.departments, measured, value.teams, target)
      const frames = anchor?.teamId ? shapes.teams.filter(item => item.id === anchor.teamId)
        : anchor?.departmentId ? shapes.departments.filter(item => item.id === anchor.departmentId) : shapes.departments
      if (frames.length) makeRoom(boundsOf(frames.flatMap(item => rectanglePoints(item.bounds))), camera.generation.current)
    }
    glide(target, options.alignMembers && anchor?.teamId ? value.teams.find(team => team.id === anchor.teamId)?.memberIds : [])
  }, [glide, measuredMembers, makeRoom, camera.generation])
  const scheduleArrange = useCallback((anchor?: SpaceAnchor) => {
    if (arrangeTimer.current) clearTimeout(arrangeTimer.current)
    arrangeTimer.current = setTimeout(() => {
      if (!draggedMember.current && !groupDrag.current) arrange(anchor, { alignMembers: true })
    }, 160)
  }, [arrange])
  useEffect(() => () => cancelAnimation(), [cancelAnimation])

  const initializedKey = useRef<string | null>(null)
  useEffect(() => {
    const remembered = initializedKey.current === storageKey ? settlingTarget.current ?? positions.current : readManualLayout(layoutStorage(), storageKey)
    cancelAnimation()
    const next = new Map(defaults)
    for (const [id, point] of remembered) if (next.has(id)) next.set(id, point)
    const transfer = incomingTransfer.current?.storageKey === storageKey ? incomingTransfer.current : null
    incomingTransfer.current = null
    const measured = measuredMembers()
    const aligned = alignSpaceTeams(measured, teams, next)
    const resolved = transfer?.positions ?? resolveSpaceOverlaps(departmentDefinitions, measured, teams, aligned)
    const sameCanvas = initializedKey.current === storageKey
    const oldNodes = new Map(sameCanvas ? nodesRef.current.map(node => [node.id, node]) : [])
    initializedKey.current = storageKey
    layoutRecords.current = records
    const updated: PersonNode[] = records.map(record => ({
      id: record.id, type: 'person', position: oldNodes.get(record.id)?.position ?? resolved.get(record.id) ?? { x: 0, y: 0 },
      measured: oldNodes.get(record.id)?.measured,
      className: oldNodes.get(record.id)?.className,
      initialWidth: NODE_WIDTH, initialHeight: record.person.directLineLimit != null ? NODE_HEIGHT + 20 : NODE_HEIGHT,
      draggable: true,
      selected: selectedRef.current === record.id,
      ariaLabel: `${record.person.name}, ${record.department.name}, ${record.person.titleName ?? 'no title'}`,
      data: {
        membershipId: record.id, person: record.person, departmentName: record.department.name, tone: record.tone,
        uplineName: record.department.people.find(person => person.staffId === record.person.uplineStaffId)?.name ?? null,
        directorNames: sortHeads(record.department.directors ?? []).map(director => director.name),
        selected: selectedRef.current === record.id, pending: false,
      },
    }))
    nodesRef.current = updated
    positions.current = new Map(resolved)
    for (const node of updated) positions.current.set(node.id, node.position)
    setNodes(updated)
    glide(resolved, transfer?.movedIds)
    setLoaded(true)
  }, [storageKey, defaults, records, departmentDefinitions, members, teams, cancelAnimation, glide, measuredMembers])

  useEffect(() => {
    setNodes(previous => {
      const updated = previous.map(node => {
        const className = [fresh === node.id ? 'space-node-fresh' : '', dropTarget?.id === node.id
          ? dropTarget.reason ? 'space-node-refused' : dropTarget.armed ? 'space-node-target' : 'space-node-hover' : ''].filter(Boolean).join(' ')
        return node.selected === (selected === node.id) && node.data.selected === (selected === node.id) && node.data.pending === pending && node.className === className
          ? node : { ...node, className, draggable: !pending, selected: selected === node.id, data: { ...node.data, selected: selected === node.id, pending } }
      })
      nodesRef.current = updated
      return updated
    })
  }, [selected, pending, fresh, dropTarget, records])
  useEffect(() => {
    if (!fresh) return
    const timer = setTimeout(() => setFresh(null), 1800)
    return () => clearTimeout(timer)
  }, [fresh])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  const focusDepartment = useCallback((id: string | null) => {
    interruptCamera()
    setActiveDepartment(id)
    setFind('')
    const frames = geometryRef.current.departments.filter(department => id === null || department.id === id)
    if (!frames.length) return
    // The rail comes into the picture too: all of it for the whole canvas,
    // the department's own directors' cards when one is in focus.
    const cards = railRef.current.cards.filter(card => id === null || card.departmentIds.includes(id))
    const bounds = boundsOf([
      ...frames.flatMap(frame => rectanglePoints(frame.bounds)),
      ...cards.flatMap(card => rectanglePoints({ x: card.x, y: card.y - SPACE_RAIL_LABEL, width: NODE_WIDTH, height: NODE_HEIGHT + SPACE_RAIL_LABEL })),
    ])
    void fitBounds(bounds, { padding: 0.1, duration: duration(400) })
  }, [fitBounds, interruptCamera])
  const firstFocus = useRef(false)
  useEffect(() => {
    if (!loaded || firstFocus.current) return
    const timer = setTimeout(() => {
      firstFocus.current = true
      focusDepartment(initialDepartmentId ?? null)
    }, 80)
    return () => clearTimeout(timer)
  }, [loaded, initialDepartmentId, focusDepartment])

  const onNodesChange = useCallback((changes: NodeChange<PersonNode>[]) => {
    if (dragSession.current?.cancelled) changes = changes.filter(change => change.type !== 'position')
    let needsSpacing = false
    let anchor: SpaceAnchor | undefined
    for (const change of changes) {
      if (change.type === 'select') {
        setSelected(current => change.selected ? change.id : current === change.id ? null : current)
      }
      if (change.type === 'position' && change.position) {
        positions.current.set(change.id, { ...change.position })
        if (!draggedMember.current && !change.dragging) {
          const team = teamByMember.get(change.id)
          anchor = { teamId: team?.id, departmentId: team?.departmentId }
          needsSpacing = true
        }
      }
      if (change.type === 'dimensions') needsSpacing = true
    }
    setNodes(previous => {
      const updated = applyNodeChanges(changes, previous)
      nodesRef.current = updated
      return updated
    })
    if (needsSpacing) scheduleArrange(anchor)
  }, [scheduleArrange, teamByMember])
  const clearDropTarget = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    dropTargetRef.current = null
    setDropTarget(null)
  }, [])
  const hitTarget = useCallback((event: MouseEvent | TouchEvent, id: string) => {
    const point = screenToFlowPosition(pointerOf(event))
    return nodesRef.current.find(candidate => candidate.id !== id
      && point.x >= candidate.position.x && point.x <= candidate.position.x + (candidate.measured?.width ?? NODE_WIDTH)
      && point.y >= candidate.position.y && point.y <= candidate.position.y + (candidate.measured?.height ?? NODE_HEIGHT))
  }, [screenToFlowPosition])
  const onNodeDragStart: OnNodeDrag<PersonNode> = useCallback((_event, node) => {
    const priorGeometry = geometryRef.current
    cancelAnimation()
    geometryOverride.current = priorGeometry
    interruptCamera()
    clearDropTarget()
    draggedMember.current = node.id
    dragSession.current = { id: node.id, origin: new Map(positions.current), cancelled: false }
    setDragging(node.id)
    setPopover(null)
    setNote(null)
    setError(null)
  }, [cancelAnimation, interruptCamera, clearDropTarget])
  const onNodeDrag: OnNodeDrag<PersonNode> = useCallback((event, node) => {
    if (dragSession.current?.cancelled || writing.current) return
    const hit = hitTarget(event, node.id)
    if (!hit) { if (dropTargetRef.current) clearDropTarget(); return }
    if (dropTargetRef.current?.id === hit.id) return
    clearDropTarget()
    const child = byId.get(node.id), parent = byId.get(hit.id)
    if (!child || !parent) return
    let reason: string | null = null
    const unchanged = child.department.id === parent.department.id && child.person.uplineStaffId === parent.person.staffId
    if (child.department.id !== parent.department.id) reason = 'Each sub-department has its own hierarchy. Choose an upline here.'
    else if (!unchanged) {
      const graph = child.department.people.map(person => ({ id: person.staffId, parentId: person.uplineStaffId, label: person.name }))
      const refusal = moveRefusal(subjectOf(child.person), subjectOf(parent.person), descendantsOf(graph, child.person.staffId))
      if (refusal) reason = refusalSentence(refusal, subjectOf(child.person), subjectOf(parent.person))
    }
    const target: DropTarget = { id: hit.id, reason, unchanged, armed: false }
    dropTargetRef.current = target
    setDropTarget(target)
    if (!reason && !unchanged) hoverTimer.current = setTimeout(() => {
      if (dropTargetRef.current?.id !== target.id || !dragSession.current || dragSession.current.cancelled) return
      const ready = { ...target, armed: true }
      dropTargetRef.current = ready
      setDropTarget(ready)
      hoverTimer.current = null
    }, 450)
  }, [byId, hitTarget, clearDropTarget])
  const onNodeDragStop: OnNodeDrag<PersonNode> = useCallback((event, node) => {
    const session = dragSession.current, target = dropTargetRef.current
    const hit = target ? hitTarget(event, node.id) : null
    if (!session?.cancelled) positions.current.set(node.id, { ...node.position })
    draggedMember.current = null
    dragSession.current = null
    setDragging(null)
    clearDropTarget()
    suppressClick.current = performance.now() + 350
    setSelected(node.id)
    if (session?.cancelled || (target?.reason && hit?.id === target.id)) {
      if (target?.reason && !session?.cancelled) setError(target.reason)
      if (session) glide(session.origin, [node.id])
      return
    }
    if (target?.armed && hit?.id === target.id && session) {
      moveRef.current(node.id, target.id, session.origin)
      return
    }
    const team = teamByMember.get(node.id)
    arrange({ teamId: team?.id, departmentId: team?.departmentId }, { keepVisible: true, alignMembers: true, origin: session?.origin })
  }, [arrange, teamByMember, hitTarget, clearDropTarget, glide])

  const keysForGroup = (anchor: SpaceAnchor) => {
    if (anchor.teamId) return new Set(teams.find(team => team.id === anchor.teamId)?.memberIds ?? [])
    return new Set([...members.filter(member => member.departmentId === anchor.departmentId).map(member => member.id),
      ...(anchor.departmentId ? [departmentPositionKey(anchor.departmentId)] : [])])
  }
  const groupDown = (event: PointerEvent<HTMLButtonElement>, anchor: SpaceAnchor) => {
    if ((event.button !== 0 && event.button !== 2) || groupDrag.current || writing.current) return
    const departmentId = anchor.departmentId ?? teams.find(team => team.id === anchor.teamId)?.departmentId
    if (!departmentId) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    completeSettling()
    interruptCamera()
    setPopover(null)
    const keys = keysForGroup(anchor)
    groupDrag.current = {
      pointerId: event.pointerId, departmentId, teamId: anchor.teamId, x: event.clientX, y: event.clientY,
      zoom: getZoom(), original: new Map(positions.current), keys, moved: false,
      element: event.currentTarget,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const groupMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = groupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) <= 5) return
    event.preventDefault()
    event.stopPropagation()
    drag.moved = true
    if (drag.teamId) setMovingTeam(drag.teamId)
    else setMovingDepartment(drag.departmentId)
    setActiveDepartment(drag.departmentId)
    suppressClick.current = performance.now() + 350
    const next = new Map(positions.current)
    for (const id of drag.keys) {
      const origin = drag.original.get(id)
      if (origin) next.set(id, { x: origin.x + dx / drag.zoom, y: origin.y + dy / drag.zoom })
    }
    publishPositions(next)
  }
  const groupEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = groupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    groupDrag.current = null
    setMovingDepartment(null)
    setMovingTeam(null)
    if (drag.moved) {
      suppressClick.current = performance.now() + 350
      arrange({ departmentId: drag.departmentId, teamId: drag.teamId }, { keepVisible: true })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const cancelGroup = (pointerId?: number) => {
    const drag = groupDrag.current
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return
    groupDrag.current = null
    setMovingDepartment(null)
    setMovingTeam(null)
    suppressClick.current = performance.now() + 350
    glide(drag.original)
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
  }
  const groupKey = (event: KeyboardEvent<HTMLButtonElement>, anchor: SpaceAnchor) => {
    if (writing.current || pending || groupDrag.current) return
    const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    completeSettling()
    interruptCamera()
    const step = (event.shiftKey ? 60 : 20) / getZoom(), next = new Map(positions.current)
    for (const id of keysForGroup(anchor)) {
      const point = next.get(id)
      if (point) next.set(id, { x: point.x + delta[0] * step, y: point.y + delta[1] * step })
    }
    publishPositions(next)
    arrange(anchor, { keepVisible: true })
  }

  const focusTeam = (teamId: string) => {
    if (performance.now() < suppressClick.current) return
    const team = geometryRef.current.teams.find(item => item.id === teamId)
    if (!team) return
    interruptCamera()
    setActiveDepartment(team.departmentId)
    void fitBounds(team.bounds, { padding: 0.25, duration: duration(400) })
  }
  const frameBorders = (bounds: Bounds, anchor: SpaceAnchor, label: string, kind: 'team' | 'department') => borderStrips(bounds).map(({ side, ...style }) => (
    <button type="button" key={`${anchor.teamId ?? anchor.departmentId}:${side}`} tabIndex={-1}
      className={`space-frame-border nodrag nopan ${kind}`} style={style}
      aria-label={`${label}: move ${kind} by ${side} border`}
      disabled={pending} onPointerDown={event => groupDown(event, anchor)} onPointerMove={groupMove}
      onPointerUp={groupEnd} onPointerCancel={event => cancelGroup(event.pointerId)}
      onLostPointerCapture={event => cancelGroup(event.pointerId)} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => groupKey(event, anchor)}
    />
  ))

  const move = useCallback((childId: string, parentId: string | null, origin?: ManualLayout) => {
    const child = byId.get(childId), parent = parentId ? byId.get(parentId) : null
    if (!child || pending || writing.current) return
    const restore = () => {
      if (origin) glide(origin, [childId])
      else { geometryOverride.current = null; scheduleArrange() }
    }
    if (parentId && (!parent || parent.department.id !== child.department.id)) {
      setError('Choose an upline within the same sub-department. Each department has its own hierarchy.')
      restore()
      return
    }
    const graph = child.department.people.map(person => ({ id: person.staffId, parentId: person.uplineStaffId, label: person.name }))
    if (parent) {
      const refusal = moveRefusal(subjectOf(child.person), subjectOf(parent.person), descendantsOf(graph, child.person.staffId))
      if (refusal) { setError(refusalSentence(refusal, subjectOf(child.person), subjectOf(parent.person))); restore(); return }
    }
    const uplineId = parent?.person.staffId ?? null
    if (child.person.uplineStaffId === uplineId) { setPopover(null); arrange(); return }
    const priorGeometry = geometryRef.current
    cancelAnimation()
    geometryOverride.current = priorGeometry
    const measured = measuredMembers()
    const value = model.current
    const plan = planHierarchyTransfer({ departments: value.departments, members: measured, positions: positions.current, childId, parentId, originPositions: origin })
    if (!plan) { restore(); return }
    const priorTeam = geometryRef.current.teams.find(team => team.memberIds.includes(childId))
    const afterTeam = geometryForSpaces(value.departments, plan.members, plan.teams, plan.positions).teams.find(team => team.id === plan.teamId)
    const cameraToken = camera.generation.current
    writing.current = true
    setError(null)
    setPopover(null)
    startTransition(async () => {
      try {
        const result = await moveOnChart(child.department.schemeId, child.person.staffId, uplineId)
        if (!result.ok) { setError(result.reason); restore(); return }
        incomingTransfer.current = { ...plan, storageKey }
        setSavedMoves(current => new Map(current).set(childId, { source: serverDepartments, parentId: uplineId }))
        setFresh(childId)
        setActiveDepartment(child.department.id)
        const heads = headsLabel(child.department.directors ?? [])
        setNote(`${child.person.name} · ${child.department.name}: ${parent ? `now under ${parent.person.name}` : heads ? `now at the top of their own team, reporting to ${heads} — no override` : 'now at the top of their own team'}.`)
        setSelected(childId)
        if (priorTeam && afterTeam) followTransfer(priorTeam.bounds, afterTeam.bounds, cameraToken)
        // No router.refresh(): the action's response already carries the
        // re-rendered page. Refreshing as well was a second full render — auth,
        // sub-departments, every team — that "Saving upline…" sat through.
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not change their upline.')
        restore()
      } finally { writing.current = false }
    })
  }, [byId, pending, glide, arrange, cancelAnimation, measuredMembers, camera.generation, serverDepartments, followTransfer, storageKey, scheduleArrange])
  moveRef.current = move
  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) move(connection.target, connection.source)
  }, [move])
  const openUpline = useCallback((id: string, anchor: PopAnchor) => {
    setPersonMenu(null)
    setPopover(current => current?.id === id ? null : { id, anchor })
  }, [])
  const openPersonMenu = useCallback((id: string, anchor: PopAnchor) => {
    menuTrigger.current = document.activeElement as HTMLElement | null
    setSelected(id)
    setPopover(null)
    setPersonMenu({ id, anchor })
  }, [])
  const closePersonMenu = useCallback(() => {
    setPersonMenu(null)
    menuTrigger.current?.focus({ preventScroll: true })
  }, [])
  const beginAdd = (id: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    menuTrigger.current = button
    setPopover(null)
    setError(null)
    setNote(null)
    setPersonMenu({ id, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, startAtDepartments: true })
  }
  const reveal = useCallback((id: string) => {
    const point = positions.current.get(id), record = byId.get(id)
    if (!point || !record) return
    interruptCamera()
    setSelected(id)
    setActiveDepartment(record.department.id)
    setFind('')
    void setCenter(point.x + NODE_WIDTH / 2, point.y + NODE_HEIGHT / 2, { zoom: Math.max(0.9, getZoom()), duration: duration(400) })
  }, [byId, getZoom, setCenter, interruptCamera])
  const matches = useMemo(() => {
    const query = find.trim().toLowerCase()
    return query ? records.filter(record => `${record.person.name} ${record.person.code ?? ''} ${record.department.name}`.toLowerCase().includes(query)).slice(0, 12) : []
  }, [records, find])
  const edges: ReportingEdge[] = useMemo(() => records.flatMap(record => {
    if (!record.person.uplineStaffId) return []
    const source = membershipKey(record.department.schemeId, record.person.uplineStaffId)
    return byId.has(source) ? [{ id: `${source}->${record.id}`, source, target: record.id, type: 'line' as const,
      className: fresh === record.id ? 'fresh' : undefined, data: { fresh: fresh === record.id } }] : []
  }), [records, byId, fresh])
  const selectedRecord = selected ? byId.get(selected) : undefined
  const mover = popover ? byId.get(popover.id) : undefined
  const menuPerson = personMenu ? byId.get(personMenu.id) : undefined
  const distinctPeople = new Set(records.map(record => record.person.staffId)).size
  const directorCount = railDirectors.length
  // At the top of a tree the footer names who the leader reports to.
  const selectedReportsTo = selectedRecord && !selectedRecord.person.uplineStaffId
    ? headsLabel(selectedRecord.department.directors ?? []) : ''
  const dropPerson = dropTarget ? byId.get(dropTarget.id) : null
  const carriedCount = dragging ? descendantsOf(members.map(member => ({ id: member.id, parentId: member.parentId, label: member.name })), dragging).size : 0
  const previewParent = dropTarget && !dropTarget.reason ? nodes.find(node => node.id === dropTarget.id) : undefined
  const previewChild = dragging ? nodes.find(node => node.id === dragging) : undefined

  return (
    <div className="hierarchy-spaces" onKeyDown={event => {
      const target = event.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable) return
      if (event.key === 'Escape') {
        interruptCamera()
        if (groupDrag.current) { event.preventDefault(); cancelGroup() }
        if (dragSession.current) {
          dragSession.current.cancelled = true
          clearDropTarget()
          glide(dragSession.current.origin, [dragSession.current.id])
        }
        setSelected(null); setPopover(null); setPersonMenu(null)
      }
      if (/^[0-9]$/.test(event.key)) {
        const index = Number(event.key) - 1
        if (event.key === '0' || departments[index]) {
          event.preventDefault()
          focusDepartment(event.key === '0' ? null : departments[index].id)
        }
      }
    }}>
      {error ? <div role="alert" className="mb-3 rounded-control border border-danger/50 bg-danger-bg p-3 text-sm text-danger">{error}</div> : null}
      {note ? <p role="status" className="mb-3 text-sm text-graphite">{note}</p> : null}
      <div className="space-toolbar">
        <div className="space-jumps" aria-label="Jump to a sub-department">
          <button type="button" aria-pressed={activeDepartment === null} onClick={() => focusDepartment(null)}>All departments</button>
          {departments.map((department, index) => <button
            type="button" key={department.id} aria-pressed={activeDepartment === department.id}
            onClick={() => focusDepartment(department.id)} title={`Jump to ${department.name}${index < 9 ? ` · ${index + 1}` : ''}`}
          >{department.name}<span className="space-shortcut">{index < 9 ? index + 1 : ''}</span></button>)}
        </div>
        <div className="space-actions">
          <div className="space-search">
            <input type="search" value={find} onChange={event => setFind(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && matches[0]) reveal(matches[0].id); if (event.key === 'Escape') setFind('') }}
              placeholder="Find a person…" aria-label="Find a person across departments" />
            {find.trim() ? <div className="space-search-results">
              {matches.length ? matches.map(record => <button type="button" key={record.id} onClick={() => reveal(record.id)}>
                <strong>{record.person.name}</strong><span>{record.department.name} · {record.person.titleName ?? 'no title'}</span>
              </button>) : <p>No matching person.</p>}
            </div> : null}
          </div>
          <button type="button" className="space-tidy" onClick={() => { interruptCamera(); arrange(undefined, { keepVisible: true, alignMembers: true }) }} title="Align members and separate overlapping teams; keep team locations">Tidy</button>
          <div className="org-zoom">
            <button type="button" onClick={() => { interruptCamera(); void zoomOut({ duration: duration(250) }) }} aria-label="Zoom out">−</button>
            <button type="button" className="lv" onClick={() => focusDepartment(null)} aria-label="Fit all departments"><ZoomReadout /></button>
            <button type="button" onClick={() => { interruptCamera(); void zoomIn({ duration: duration(250) }) }} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>
      <div className="space-overview"><span>{distinctPeople} people · {records.length} memberships · {teams.length} teams{directorCount ? ` · ${directorCount} director${directorCount === 1 ? '' : 's'}` : ''}</span><span>{pending ? 'Saving upline…' : 'Magnetic layout · Free canvas'}</span></div>
      <PersonMenuContext.Provider value={openPersonMenu}>
      <UplineContext.Provider value={openUpline}>
        <div ref={camera.canvas} onPointerDownCapture={interruptCamera} onWheelCapture={interruptCamera}
          className={`org-canvas space-canvas${movingDepartment || movingTeam ? ' space-dragging' : ''}`}>
          <ReactFlow<PersonNode, ReportingEdge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
            onNodeClick={(_event, node) => { if (performance.now() >= suppressClick.current) { setSelected(node.id); setPersonMenu(null) } }}
            onPaneClick={() => { setSelected(null); setPopover(null); setPersonMenu(null) }} onConnect={onConnect}
            minZoom={0.15} maxZoom={1.7} panOnDrag={movingDepartment || movingTeam ? false : [0, 1]}
            zoomOnScroll={!movingDepartment && !movingTeam} zoomOnPinch={!movingDepartment && !movingTeam}
            deleteKeyCode={null} nodesDraggable={!pending} nodesConnectable={!pending} elementsSelectable
            autoPanOnNodeDrag autoPanOnConnect
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgb(var(--cv-grid))" />
            <ViewportPortal>
              <svg className="space-boundaries" width="1" height="1" aria-hidden>
                {geometry.departments.map(department => <rect key={department.id} data-department-id={department.id} {...department.bounds} rx="18"
                  data-space-tone={departments.findIndex(item => item.id === department.id) % 3}
                  className={`space-department${activeDepartment === department.id ? ' active' : ''}${movingDepartment === department.id ? ' moving' : ''}`} />)}
                {geometry.teams.map(team => <rect key={team.id} data-team-id={team.id} {...team.bounds} rx="20" className={`space-team${movingTeam === team.id ? ' moving' : ''}`}
                  data-space-tone={departments.findIndex(item => item.id === team.departmentId) % 3} />)}
                {/* The directors' lines (design A, 2026-09-12): one dashed drop
                    per director and sub-department from the card on the rail,
                    one bus per frame — the bar joining its drops and the trunk
                    down to the frame's TOP EDGE, where a dot lands. Dashed,
                    because unlike the solid line inside a team it carries no
                    override. Nothing is drawn inside the frame. */}
                {rail.drops.map(drop => <path key={`${drop.directorId}:${drop.departmentId}`} className="space-director-line"
                  data-director-line={`${drop.directorId}:${drop.departmentId}`} d={`M ${drop.x} ${drop.top} V ${drop.bottom}`} />)}
                {rail.buses.map(bus => <g key={bus.departmentId} data-director-bus={bus.departmentId}>
                  <path className="space-director-bus" d={`M ${bus.x1} ${bus.y} H ${bus.x2} M ${bus.landing.x} ${bus.y} V ${bus.landing.y}`} />
                  <circle className="space-director-dot" cx={bus.landing.x} cy={bus.landing.y} r={3.5} />
                </g>)}
                {previewParent && previewChild ? <path className="space-preview-line"
                  d={roundedReportingPath(previewParent.position.x + (previewParent.measured?.width ?? NODE_WIDTH) / 2,
                    previewParent.position.y + (previewParent.measured?.height ?? NODE_HEIGHT),
                    previewChild.position.x + (previewChild.measured?.width ?? NODE_WIDTH) / 2, previewChild.position.y)} /> : null}
              </svg>
              {geometry.departments.flatMap(department => frameBorders(department.bounds, { departmentId: department.id }, department.name, 'department'))}
              {geometry.teams.flatMap(team => frameBorders(team.bounds, { teamId: team.id, departmentId: team.departmentId }, team.label, 'team'))}
              {geometry.departments.map(department => {
                const count = members.filter(member => member.departmentId === department.id).length
                // Who the whole sub-department reports to, on its header (design A).
                const heads = headsLabel(departments.find(item => item.id === department.id)?.directors ?? [])
                return <button type="button" key={department.id}
                  className="space-department-heading nodrag nopan" data-space-tone={departments.findIndex(item => item.id === department.id) % 3}
                  style={{ left: department.bounds.x + 1, top: department.bounds.y + 1, width: department.bounds.width - 2, height: SPACE_DEPARTMENT_HEADER - 1 }}
                  aria-label={`${department.name}: drag to move department, click to focus`}
                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                  disabled={pending} onPointerDown={event => groupDown(event, { departmentId: department.id })} onPointerMove={groupMove}
                  onPointerUp={groupEnd} onPointerCancel={event => cancelGroup(event.pointerId)} onLostPointerCapture={event => cancelGroup(event.pointerId)}
                  onContextMenu={event => event.preventDefault()} onKeyDown={event => groupKey(event, { departmentId: department.id })}
                  onClick={() => { if (performance.now() >= suppressClick.current) focusDepartment(department.id) }}
                ><strong>{department.name}</strong><span>{teams.filter(team => team.departmentId === department.id).length} teams · {count} members</span>{heads ? <span className="space-heads"><span className="k">Reports to</span>{' '}{heads}</span> : null}<span className="space-grip" aria-hidden>⠿</span></button>
              })}
              {geometry.teams.map(team => <button type="button" key={team.id} className="space-team-heading nodrag nopan"
                style={{ left: team.bounds.x + 1, top: team.bounds.y + 1, width: team.bounds.width - 2, height: SPACE_TEAM_HEADER - 1 }}
                aria-label={`${team.label}: drag to move team, click to focus`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                disabled={pending} onPointerDown={event => groupDown(event, { teamId: team.id, departmentId: team.departmentId })} onPointerMove={groupMove}
                onPointerUp={groupEnd} onPointerCancel={event => cancelGroup(event.pointerId)} onLostPointerCapture={event => cancelGroup(event.pointerId)}
                onContextMenu={event => event.preventDefault()} onKeyDown={event => groupKey(event, { teamId: team.id, departmentId: team.departmentId })}
                onClick={() => focusTeam(team.id)}
              ><strong>{team.label}</strong><span>{team.memberIds.length} members</span><span className="space-grip" aria-hidden>⠿</span></button>)}
              {/* The director rail (design A, 2026-09-12): every director once,
                  above all the frames. Cards of the same family as the members,
                  but not nodes: nobody can be dropped on them, they take no
                  upline, and they stand where the frames put them. */}
              {rail.bounds ? <div className="space-rail-label" style={{ left: rail.bounds.x, top: rail.bounds.y }}>Revenue Directors · reporting only</div> : null}
              {rail.cards.map(card => {
                const entry = railDirectors.find(director => director.staffId === card.id)
                if (!entry) return null
                const title = hierarchyTitleAppearance(entry.titleName)
                const directs = entry.departmentNames.join(' · ')
                return <div key={card.id} className="org-card space-person space-director" data-director={entry.staffId}
                  role="img" aria-label={`${entry.name}, ${entry.titleName ?? 'department head'}, directs ${directs}`}
                  title={`${directs} report${entry.departmentNames.length === 1 ? 's' : ''} to ${entry.name}. A reporting line only — no rank, no override.`}
                  style={{ left: card.x, top: card.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}>
                  <div className="oc-top"><div className="oc-nm">{entry.name}</div><span className="oc-rank none">no rank</span></div>
                  <div className="oc-tt oc-title-row">
                    <span className="oc-title-badge" data-title-tone={title.tone}>
                      <span className="oc-title-marker" aria-hidden="true">{title.marker}</span>
                      <span className="oc-title-label">{title.label}</span>
                    </span>
                  </div>
                  <div className="oc-role"><span className="k">Directs</span><span className="v">{directs}</span></div>
                </div>
              })}
              {geometry.departments.filter(department => !members.some(member => member.departmentId === department.id)).map(department =>
                <div key={`empty:${department.id}`} className="space-empty"
                  style={{ left: department.bounds.x + SPACE_DEPARTMENT_PADDING, top: department.bounds.y + SPACE_DEPARTMENT_HEADER + SPACE_DEPARTMENT_PADDING + 18 }}>No members yet</div>)}
            </ViewportPortal>
          </ReactFlow>
          {dropTarget && dropPerson ? <div className={`space-drop-notice${dropTarget.reason ? ' refused' : ''}`} role="status">
            {dropTarget.reason ?? (dropTarget.unchanged ? `Already under ${dropPerson.person.name} · release to align`
              : `${dropTarget.armed ? 'Release' : 'Hold here'} to move under ${dropPerson.person.name} · ${dropPerson.department.name}`)}
            {!dropTarget.reason && !dropTarget.unchanged && carriedCount > 0 ? <span>Includes {carriedCount} downline{carriedCount === 1 ? '' : 's'} · titles and ranks stay the same</span> : null}
          </div> : null}
        </div>
      </UplineContext.Provider>
      </PersonMenuContext.Provider>
      <div className="space-footer" aria-live="polite">
        <div>
          <strong>{selectedRecord ? `${selectedRecord.person.name} · ${selectedRecord.department.name}` : 'Sub-department → Team → Member'}</strong>
          <span>{selectedRecord ? `${selectedRecord.person.titleName ?? 'No title'} · ${selectedRecord.person.rankLabel ?? 'No rank yet'}${selectedReportsTo ? ` · reports to ${selectedReportsTo}` : ''}` : 'Drag a team border or heading to move it · Members align inside · Hold over a person to change team'}</span>
        </div>
        {selectedRecord ? <div className="space-memberships" aria-label="This person's other memberships">
          {records.filter(record => record.person.staffId === selectedRecord.person.staffId && record.id !== selectedRecord.id).map(record =>
            <button type="button" key={record.id} onClick={() => reveal(record.id)}>{record.department.name} · {record.person.titleName ?? 'No title'} ↗</button>)}
          <button type="button" disabled={pending} aria-haspopup="menu" onClick={event => beginAdd(selectedRecord.id, event.currentTarget)}>Add to department</button>
          <button type="button" disabled={pending} data-org-open onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            openUpline(selectedRecord.id, { left: rect.left, top: rect.top, bottom: rect.bottom })
          }}>Change upline</button>
        </div> : null}
      </div>
      {personMenu && menuPerson ? <PersonContextMenu key={`${personMenu.id}:${personMenu.anchor.left}:${personMenu.anchor.top}:${!!personMenu.startAtDepartments}`}
        person={menuPerson.person} sourceSchemeId={menuPerson.department.schemeId} destinations={membershipDestinations} anchor={personMenu.anchor} startAtDepartments={personMenu.startAtDepartments}
        onClose={closePersonMenu} onAdded={message => { closePersonMenu(); setError(null); setNote(message) }}
        onUpline={() => { const current = personMenu; closePersonMenu(); openUpline(current.id, current.anchor) }} /> : null}
      {popover && mover ? <MovePopover key={popover.id} mover={mover.person} people={mover.department.people}
        graph={mover.department.people.map(person => ({ id: person.staffId, parentId: person.uplineStaffId, label: person.name }))}
        directorNames={sortHeads(mover.department.directors ?? []).map(director => director.name)}
        anchor={popover.anchor} onClose={() => setPopover(null)}
        onPick={id => move(popover.id, id ? membershipKey(mover.department.schemeId, id) : null)} /> : null}
    </div>
  )
}

function ZoomReadout() { const { zoom } = useViewport(); return <>{Math.round(zoom * 100)}%</> }

/** Borders are pointer handles; each heading provides the same keyboard action. */
function borderStrips(bounds: Bounds) {
  const { x, y, width, height } = bounds
  return [
    { side: 'top', left: x + 8, top: y - 6, width: width - 16, height: 12 },
    { side: 'right', left: x + width - 6, top: y + 8, width: 12, height: height - 16 },
    { side: 'bottom', left: x + 8, top: y + height - 6, width: width - 16, height: 12 },
    { side: 'left', left: x - 6, top: y + 8, width: 12, height: height - 16 },
  ]
}

/** Frame growth follows the settled team, not a card temporarily crossing the canvas. */
function interpolateGeometry(from: SpaceGeometry, to: SpaceGeometry, amount: number): SpaceGeometry {
  const oldTeams = new Map(from.teams.map(team => [team.id, team]))
  const oldDepartments = new Map(from.departments.map(department => [department.id, department]))
  const between = (start: Bounds | undefined, end: Bounds): Bounds => {
    if (!start) return end
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
      width: start.width + (end.width - start.width) * amount,
      height: start.height + (end.height - start.height) * amount,
    }
  }
  return {
    teams: to.teams.map(team => {
      const old = oldTeams.get(team.id)
      const bounds = between(old?.bounds, team.bounds)
      return { ...team, bounds, points: rectanglePoints(bounds), labelPosition: {
        x: (old?.labelPosition.x ?? team.labelPosition.x) + (team.labelPosition.x - (old?.labelPosition.x ?? team.labelPosition.x)) * amount,
        y: (old?.labelPosition.y ?? team.labelPosition.y) + (team.labelPosition.y - (old?.labelPosition.y ?? team.labelPosition.y)) * amount,
      } }
    }),
    // The director rail is derived from these frames on every render, so it glides with them.
    departments: to.departments.map(department => ({ ...department, bounds: between(oldDepartments.get(department.id)?.bounds, department.bounds) })),
  }
}

/** Matches spaceConnectionPoints, so every reporting line stays inside its team. */
function roundedReportingPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const middle = (sourceY + targetY) / 2
  const vertical = Math.sign(targetY - sourceY), horizontal = Math.sign(targetX - sourceX)
  const radius = Math.min(9, Math.abs(targetY - sourceY) / 4, Math.abs(targetX - sourceX) / 2)
  return `M ${sourceX} ${sourceY} V ${middle - vertical * radius} Q ${sourceX} ${middle} ${sourceX + horizontal * radius} ${middle} H ${targetX - horizontal * radius} Q ${targetX} ${middle} ${targetX} ${middle + vertical * radius} V ${targetY}`
}

function ReportingLine({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<ReportingEdge>) {
  return <path d={roundedReportingPath(sourceX, sourceY, targetX, targetY)} pathLength={data?.fresh ? 1 : undefined}
    className="react-flow__edge-path" style={{ strokeLinejoin: 'round' }} />
}
