'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { layoutKey, readManualLayout, writeManualLayout, type ManualLayout } from '@/lib/commission/chart-layout-store'
import { type Bounds } from '@/lib/hierarchy-spaces'
import { companyLeadershipBounds, initialCompanyHierarchyPositions, type CompanyHierarchyLeader } from '@/lib/company-hierarchy-layout'
import { applyCompanyHierarchyLevels, type CompanyLevelRole } from '@/lib/company-hierarchy-levels'
import {
  buildSpaceTeams, departmentPositionKey, geometryForSpaces,
  SPACE_DEPARTMENT_HEADER, SPACE_DEPARTMENT_PADDING, SPACE_TEAM_HEADER,
  type SpaceAnchor, type SpaceDepartment, type SpaceMember,
} from '@/lib/hierarchy-space-layout'

const STORAGE_NAMESPACE = 'company.spaces.v4.levels'
const STRUCTURE_KEY = `${layoutKey(STORAGE_NAMESPACE)}.structure`
const LEGACY_NAMESPACE = 'company.spaces.v3.structure'
const layoutStorage = () => { try { return window.localStorage } catch { return null } }
type Dimensions = { id: string; width: number; height: number }
type GroupDrag = {
  pointerId: number
  anchor: SpaceAnchor
  x: number
  y: number
  zoom: number
  original: ManualLayout
  keys: Set<string>
  moved: boolean
  element: HTMLButtonElement
}

export interface CompanyHierarchySpaceOptions {
  leaders?: CompanyHierarchyLeader[]
  visibleDepartmentIds?: readonly string[] | null
  visibleLeaderIds?: readonly string[] | null
  roles?: readonly CompanyLevelRole[]
}

/**
 * Company-wide reading layout, independent of department filters and reporting
 * writes. The caller supplies every member and renders frames in ViewportPortal.
 */
export function useCompanyHierarchySpaces(
  members: SpaceMember[],
  departments: SpaceDepartment[],
  { leaders = [], visibleDepartmentIds = null, visibleLeaderIds = null, roles = [] }: CompanyHierarchySpaceOptions = {},
) {
  const { getZoom, fitBounds } = useReactFlow()
  const [positions, setPositions] = useState<ManualLayout>(new Map())
  const positionsRef = useRef(positions)
  const [loaded, setLoaded] = useState(false)
  const [loadedModel, setLoadedModel] = useState<string | null>(null)
  const [movingAnchor, setMovingAnchor] = useState<SpaceAnchor | null>(null)
  const [, setMeasurementVersion] = useState(0)
  const dimensions = useRef(new Map<string, Omit<Dimensions, 'id'>>())
  const teams = useMemo(() => buildSpaceTeams(members), [members])
  const model = useRef({ members, departments, teams, leaders, roles })
  model.current = { members, departments, teams, leaders, roles }
  const initializedModel = useRef<string | null>(null)
  const groupDrag = useRef<GroupDrag | null>(null)
  const suppressClick = useRef(0)

  // Collapse and expand change the model and repack its zones. Department focus
  // only changes visibility, so it retains the reader's current arrangement.
  const modelKey = JSON.stringify({ members, departments, leaders, roles })
  const modelKeyRef = useRef(modelKey)
  modelKeyRef.current = modelKey
  const measuredMembers = useCallback(() => model.current.members.map(member => ({
    ...member, ...dimensions.current.get(member.id),
  })), [])
  const measuredLeaders = useCallback(() => model.current.leaders.map(leader => ({
    ...leader, ...dimensions.current.get(leader.id),
  })), [])
  const levelLayout = useCallback((positions: ManualLayout, anchor?: SpaceAnchor) => {
    const value = model.current
    return applyCompanyHierarchyLevels({
      departments: value.departments, members: measuredMembers(), leaders: measuredLeaders(), positions,
      roles: value.roles.map(role => ({ ...role, height: dimensions.current.get(role.id)?.height ?? role.height })),
      overview: value.members.every(member => member.id.startsWith('summary:')),
      anchor,
    })
  }, [measuredMembers, measuredLeaders])
  const publish = useCallback((next: ManualLayout, persist = false) => {
    const previous = positionsRef.current
    const changed = next.size !== previous.size || [...next].some(([id, point]) => {
      const old = previous.get(id)
      return !old || old.x !== point.x || old.y !== point.y
    })
    if (changed) {
      positionsRef.current = next
      setPositions(next)
    }
    if (persist) {
      const storage = layoutStorage()
      writeManualLayout(storage, STORAGE_NAMESPACE, next)
      try { storage?.setItem(STRUCTURE_KEY, modelKeyRef.current) } catch { /* Layout still works without storage. */ }
    }
  }, [])
  const cancelGroup = useCallback((pointerId?: number) => {
    const drag = groupDrag.current
    if (!drag || (pointerId !== undefined && pointerId !== drag.pointerId)) return
    groupDrag.current = null
    setMovingAnchor(null)
    suppressClick.current = performance.now() + 350
    publish(drag.original)
    if (drag.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
  }, [publish])

  useEffect(() => {
    if (initializedModel.current === modelKey) return
    cancelGroup()
    const value = model.current
    const currentIds = new Set([...value.members, ...value.leaders, ...value.roles].map(member => member.id))
    for (const id of dimensions.current.keys()) if (!currentIds.has(id)) dimensions.current.delete(id)
    const measured = measuredMembers()
    const management = measuredLeaders()
    const next = initialCompanyHierarchyPositions(value.departments, measured, management)
    if (initializedModel.current === null) {
      const storage = layoutStorage()
      let sameStructure = false
      try { sameStructure = storage?.getItem(STRUCTURE_KEY) === modelKey } catch { /* Use the default arrangement. */ }
      if (sameStructure) for (const [id, point] of readManualLayout(storage, STORAGE_NAMESPACE)) {
        if (next.has(id)) next.set(id, { ...next.get(id)!, x: point.x })
      }
      // Preserve the accepted horizontal arrangement when upgrading the same
      // visible structure. Old free-form heights are replaced by level rows.
      if (!sameStructure) {
        let sameLegacyStructure = false
        try { sameLegacyStructure = storage?.getItem(`${layoutKey(LEGACY_NAMESPACE)}.structure`)
          === JSON.stringify({ members: value.members, departments: value.departments, leaders: value.leaders }) } catch { /* Use defaults. */ }
        if (sameLegacyStructure) for (const [id, point] of readManualLayout(storage, LEGACY_NAMESPACE)) {
          if (next.has(id)) next.set(id, { ...next.get(id)!, x: point.x })
        }
      }
    }
    initializedModel.current = modelKey
    publish(levelLayout(next).positions, true)
    setLoaded(true)
    setLoadedModel(modelKey)
  }, [modelKey, measuredMembers, measuredLeaders, publish, cancelGroup, levelLayout])

  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !groupDrag.current) return
      event.preventDefault()
      event.stopPropagation()
      cancelGroup()
    }
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('keydown', escape, true)
      const drag = groupDrag.current
      groupDrag.current = null
      if (drag?.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    }
  }, [cancelGroup])

  const arrange = useCallback((anchor?: SpaceAnchor) => {
    publish(levelLayout(positionsRef.current, anchor).positions, true)
  }, [publish, levelLayout])
  const tidy = useCallback(() => {
    cancelGroup()
    const value = model.current
    publish(levelLayout(initialCompanyHierarchyPositions(value.departments, measuredMembers(), measuredLeaders())).positions, true)
  }, [cancelGroup, measuredMembers, measuredLeaders, publish, levelLayout])
  const updateDimensions = useCallback((updates: Dimensions[]) => {
    const people = [...model.current.members, ...model.current.leaders]
    const ids = new Set(people.map(member => member.id))
    let changed = false
    for (const { id, width, height } of updates) {
      if (!ids.has(id) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue
      const before = dimensions.current.get(id) ?? people.find(member => member.id === id)
      if (before?.width === width && before?.height === height) continue
      dimensions.current.set(id, { width, height })
      changed = true
    }
    if (!changed) return
    setMeasurementVersion(version => version + 1)
    if (initializedModel.current !== null && !groupDrag.current) arrange()
  }, [arrange])
  const geometry = geometryForSpaces(departments, measuredMembers(), teams, positions)
  const leadershipBounds = companyLeadershipBounds(measuredLeaders(), positions)
  const levelRows = levelLayout(positions).rows
  const visibleDepartments = geometry.departments.filter(department => visibleDepartmentIds === null || visibleDepartmentIds.includes(department.id))
  const visibleTeams = geometry.teams.filter(team => visibleDepartmentIds === null || visibleDepartmentIds.includes(team.departmentId))
  const visibleLeaders = leaders.filter(leader => visibleLeaderIds === null || visibleLeaderIds.includes(leader.id))
  const visibleManagementBounds = companyLeadershipBounds(visibleLeaders, positions)
  const visibleRoles = roles.filter(role => positions.has(role.id) && (visibleDepartmentIds === null
    || visibleDepartmentIds.includes(role.departmentId) || visibleLeaders.some(leader => leader.id === role.id)))
  const shownRows = levelRows.filter(row => visibleRoles.some(role => role.levelRank === row.rank
    && (row.rank !== null || (row.key === 'department-heads') === role.isDepartmentHead)))
  const leftEdges = [...visibleDepartments.map(department => department.bounds.x), ...(visibleManagementBounds ? [visibleManagementBounds.x] : [])]
  const rightEdges = [...visibleDepartments.map(department => department.bounds.x + department.bounds.width),
    ...(visibleManagementBounds ? [visibleManagementBounds.x + visibleManagementBounds.width] : [])]
  const guideLeft = (leftEdges.length ? Math.min(...leftEdges) : 0) - 114
  const guideRight = rightEdges.length ? Math.max(...rightEdges) : 0
  const levelGuideBounds = shownRows.length ? { x: guideLeft, y: Math.min(...shownRows.map(row => row.y)) - 9,
    width: 100, height: Math.max(...shownRows.map(row => row.y)) - Math.min(...shownRows.map(row => row.y)) + 46 } : null
  const tone = (departmentId: string) => Math.max(0, departments.findIndex(department => department.id === departmentId)) % 3

  const keysForGroup = (anchor: SpaceAnchor) => anchor.teamId
    ? new Set(model.current.teams.find(team => team.id === anchor.teamId)?.memberIds ?? [])
    : new Set([
      ...model.current.members.filter(member => member.departmentId === anchor.departmentId).map(member => member.id),
      ...(anchor.departmentId ? [departmentPositionKey(anchor.departmentId)] : []),
    ])
  const groupDown = (event: PointerEvent<HTMLButtonElement>, anchor: SpaceAnchor) => {
    if (!loaded || (event.button !== 0 && event.button !== 2) || groupDrag.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    groupDrag.current = {
      pointerId: event.pointerId, anchor, x: event.clientX, y: event.clientY,
      zoom: Math.max(0.01, getZoom()), original: new Map(positionsRef.current), keys: keysForGroup(anchor),
      moved: false, element: event.currentTarget,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const groupMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = groupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x
    if (!drag.moved && Math.abs(dx) <= 5) return
    event.preventDefault()
    event.stopPropagation()
    drag.moved = true
    setMovingAnchor(drag.anchor)
    suppressClick.current = performance.now() + 350
    const next = new Map(positionsRef.current)
    for (const id of drag.keys) {
      const original = drag.original.get(id)
      if (original) next.set(id, { x: original.x + dx / drag.zoom, y: original.y })
    }
    publish(next)
  }
  const groupEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = groupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    groupDrag.current = null
    setMovingAnchor(null)
    if (drag.moved) {
      suppressClick.current = performance.now() + 350
      arrange(drag.anchor)
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const groupKey = (event: KeyboardEvent<HTMLButtonElement>, anchor: SpaceAnchor) => {
    if (!loaded || groupDrag.current) return
    const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    const step = (event.shiftKey ? 60 : 20) / Math.max(0.01, getZoom())
    const next = new Map(positionsRef.current)
    for (const id of keysForGroup(anchor)) {
      const point = next.get(id)
      if (point) next.set(id, { x: point.x + delta[0] * step, y: point.y + delta[1] * step })
    }
    publish(next)
    arrange(anchor)
  }
  const gestures = (anchor: SpaceAnchor) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => groupDown(event, anchor),
    onPointerMove: groupMove,
    onPointerUp: groupEnd,
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => cancelGroup(event.pointerId),
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => cancelGroup(event.pointerId),
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => groupKey(event, anchor),
  })
  const focus = (bounds: Bounds) => {
    if (performance.now() < suppressClick.current) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    void fitBounds(bounds, { padding: 0.2, duration: reducedMotion ? 0 : 350 })
  }
  const frameBorders = (bounds: Bounds, anchor: SpaceAnchor, label: string, kind: 'team' | 'department') => borderStrips(bounds).map(({ side, ...style }) => (
    <button type="button" key={`${anchor.teamId ?? anchor.departmentId}:${side}`} tabIndex={-1}
      className={`space-frame-border nodrag nopan ${kind}`} style={style}
      aria-label={`${label}: move ${kind} by ${side} border`} {...gestures(anchor)} />
  ))
  const frames = <>
    <svg className="space-boundaries" width="1" height="1" aria-hidden>
      {shownRows.map(row => <line key={row.key} className="company-level-guide"
        x1={guideLeft + 100} x2={guideRight + 20} y1={row.y} y2={row.y} />)}
      {visibleDepartments.map(department => <rect key={department.id} data-department-id={department.id}
        {...department.bounds} rx="18" data-space-tone={tone(department.id)}
        className={`space-department company-department-zone${visibleDepartmentIds?.includes(department.id) ? ' active' : ''}${movingAnchor?.departmentId === department.id && !movingAnchor.teamId ? ' moving' : ''}`} />)}
    </svg>
    {shownRows.map(row => <div key={row.key} className="company-level-label" data-level-row={row.key}
      style={{ left: guideLeft, top: row.y - 9, width: 100 }}>{row.label}</div>)}
    {visibleDepartments.flatMap(department => frameBorders(department.bounds, { departmentId: department.id }, department.name, 'department'))}
    {visibleDepartments.map(department => <button type="button" key={department.id}
      className="space-department-heading nodrag nopan" data-space-tone={tone(department.id)}
      style={{ left: department.bounds.x + 1, top: department.bounds.y + 1, width: department.bounds.width - 2, height: SPACE_DEPARTMENT_HEADER - 1 }}
      aria-label={`${department.name}: drag to move department, click to focus`} aria-keyshortcuts="ArrowLeft ArrowRight"
      {...gestures({ departmentId: department.id })} onClick={() => focus(department.bounds)}>
      <strong>{department.name}</strong>
      <span>{members.some(member => member.departmentId === department.id && member.id.startsWith('summary:')) ? 'Overview'
        : `${teams.filter(team => team.departmentId === department.id).length} teams · ${members.filter(member => member.departmentId === department.id).length} shown`}</span>
      <span className="space-grip" aria-hidden>⠿</span>
    </button>)}
    {visibleTeams.filter(team => !team.leaderId.startsWith('summary:')).map(team => <button type="button" key={team.id} className="space-team-heading company-team-heading nodrag nopan"
      data-space-tone={tone(team.departmentId)}
      style={{ left: team.bounds.x + 1, top: team.bounds.y + 1, width: team.bounds.width - 2, height: SPACE_TEAM_HEADER - 1 }}
      aria-label={`${team.label}: drag to move team, click to focus`} aria-keyshortcuts="ArrowLeft ArrowRight"
      {...gestures({ departmentId: team.departmentId, teamId: team.id })} onClick={() => focus(team.bounds)}>
      <strong>{team.label}</strong><span>{team.memberIds.length} shown</span><span className="space-grip" aria-hidden>⠿</span>
    </button>)}
    {visibleDepartments.filter(department => !members.some(member => member.departmentId === department.id)).map(department =>
      <div key={`empty:${department.id}`} className="space-empty"
        style={{ left: department.bounds.x + SPACE_DEPARTMENT_PADDING, top: department.bounds.y + SPACE_DEPARTMENT_HEADER + SPACE_DEPARTMENT_PADDING + 18 }}>No members yet</div>)}
  </>

  return { positions, geometry, leadershipBounds, levelRows, levelGuideBounds, teams, loaded, ready: loadedModel === modelKey, moving: movingAnchor !== null, tidy, frames, updateDimensions }
}

/** The heading is the keyboard handle; these narrow strips leave cards free. */
function borderStrips({ x, y, width, height }: Bounds) {
  return [
    { side: 'top', left: x + 8, top: y - 6, width: width - 16, height: 12 },
    { side: 'right', left: x + width - 6, top: y + 8, width: 12, height: height - 16 },
    { side: 'bottom', left: x + 8, top: y + height - 6, width: width - 16, height: 12 },
    { side: 'left', left: x - 6, top: y + 8, width: 12, height: height - 16 },
  ]
}
