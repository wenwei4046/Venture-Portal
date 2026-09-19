import type { ComponentType, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection, ReactFlowProps } from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import { readManualLayout } from '@/lib/commission/chart-layout-store'
import type { PersonNode } from './HierarchyPersonCard'
import type { OrgDepartment, OrgPerson } from './org-chart-types'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import HierarchySpaces from './HierarchySpaces'

type FlowProps = ReactFlowProps<PersonNode>
const adapters = vi.hoisted(() => ({
  flow: null as FlowProps | null,
  move: vi.fn(),
  add: vi.fn(),
  changeTitle: vi.fn(),
  router: { refresh: vi.fn() },
  viewport: {
    fitBounds: vi.fn(), setCenter: vi.fn(), getZoom: () => 0.5,
    zoomIn: vi.fn(), zoomOut: vi.fn(),
    getViewport: () => ({ x: 0, y: 0, zoom: 0.5 }), setViewport: vi.fn(),
    screenToFlowPosition: (point: { x: number; y: number }) => point,
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => adapters.router }))
vi.mock('../../../hierarchy-actions', () => ({ moveOnChart: adapters.move, addMember: adapters.add, changeMemberTitle: adapters.changeTitle }))
vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    ViewportPortal: ({ children }: { children: ReactNode }) => children,
    Background: () => null,
    Handle: () => null,
    useReactFlow: () => adapters.viewport,
    useViewport: () => ({ x: 0, y: 0, zoom: 0.5 }),
    // Replace only the canvas renderer. Tests emit its public callbacks;
    // the actual card, popover, movement rules and spacing all run normally.
    ReactFlow: (props: FlowProps) => {
      adapters.flow = props
      const Card = props.nodeTypes!.person as ComponentType<{ data: PersonNode['data'] }>
      return <div>
        {props.nodes?.map(node => <div key={node.id} data-testid={`node:${node.id}`}
          onClick={event => props.onNodeClick?.(event, node)}>
          <Card data={node.data} />
        </div>)}
        {props.children}
      </div>
    },
  }
})

function person(staffId: string, name: string, extra: Partial<OrgPerson> = {}): OrgPerson {
  return {
    staffId, name, code: null, titleName: 'Team Leader', titleId: 'leader',
    levelRank: 4, levelName: 'Leader', uplineStaffId: null,
    rankId: 'rank-a', rankLabel: 'Rank A', productRate: 0.09,
    canRecruit: true, rateMode: 'variable', placedSince: null,
    ...extra,
  }
}

function departments(): OrgDepartment[] {
  return [
    {
      id: 'fa', name: 'Fair', slug: 'fair', schemeId: 'fa-scheme', isHome: true, ranks: [],
      people: [
        person('anthony', 'Anthony'),
        person('yuny', 'Yuny', { uplineStaffId: 'anthony', titleName: 'Team Assistant', titleId: 'assistant', levelRank: 3 }),
        person('chea', 'Chea Huan'),
        person('howard', 'Howard', { uplineStaffId: 'chea', titleName: 'Revenue Specialist', titleId: 'specialist', levelRank: 2, canRecruit: false }),
      ],
    },
    {
      id: 'ir', name: 'IR', slug: 'ir', schemeId: 'ir-scheme', isHome: false, ranks: [],
      people: [
        person('rachael', 'Rachael', { titleName: 'Head of IR' }),
        person('chea', 'Chea Huan', { uplineStaffId: 'rachael', titleName: 'Relationship Specialist', levelRank: 2, canRecruit: false }),
        person('lawrence', 'Lawrence'),
      ],
    },
  ]
}

function membershipDestinations(): MembershipDestination[] {
  return departments().map(department => ({
    subDepartmentId: department.id, name: department.name, slug: department.slug,
    departmentId: 'revenue', departmentName: 'Revenue', schemeId: department.schemeId,
    isHome: department.isHome, titles: [
      { id: 'leader', name: 'Team Leader' }, { id: 'assistant', name: 'Team Assistant' },
      { id: 'specialist', name: 'Revenue Specialist' },
    ],
    memberStaffIds: department.people.map(member => member.staffId),
    eligibleStaffIds: ['anthony', 'yuny', 'chea', 'howard', 'rachael', 'lawrence'],
    unavailableReason: null,
  }))
}

function flow(): FlowProps {
  expect(adapters.flow).not.toBeNull()
  return adapters.flow!
}

function node(id: string): PersonNode {
  const result = flow().nodes?.find(candidate => candidate.id === id)
  expect(result, `node ${id}`).toBeDefined()
  return result!
}

function position(id: string) { return { ...node(id).position } }
function delta(child: string, parent: string) {
  const a = position(child), b = position(parent)
  return { x: a.x - b.x, y: a.y - b.y }
}

function positionsOf(ids: readonly string[] = flow().nodes!.map(item => item.id)) {
  return new Map(ids.map(id => [id, position(id)]))
}

function dragGroup(handle: HTMLElement, dx: number, dy: number, button = 0, pointerType = 'mouse') {
  const start = { pointerId: 9, pointerType, isPrimary: true, button, clientX: 400, clientY: 300 }
  fireEvent.pointerDown(handle, start)
  fireEvent.pointerMove(handle, { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy })
  fireEvent.pointerUp(handle, { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy })
}

function teamFrame(teamId: string) {
  const frame = document.querySelector<SVGRectElement>(`.space-team[data-team-id="${teamId}"]`)
  expect(frame, `frame ${teamId}`).not.toBeNull()
  return {
    x: Number(frame!.getAttribute('x')), y: Number(frame!.getAttribute('y')),
    width: Number(frame!.getAttribute('width')), height: Number(frame!.getAttribute('height')),
  }
}

function dragMember(id: string, dx: number, dy: number) {
  const before = node(id)
  const next = { x: before.position.x + dx, y: before.position.y + dy }
  act(() => {
    flow().onNodeDragStart?.(new MouseEvent('mousedown'), before, [before])
    flow().onNodesChange?.([{ type: 'position', id, position: next, dragging: true }])
  })
  act(() => {
    const moved = node(id)
    flow().onNodeDragStop?.(new MouseEvent('mouseup'), moved, [moved])
  })
}

function connect(source: string, target: string) {
  const connection: Connection = { source, target, sourceHandle: null, targetHandle: null }
  act(() => flow().onConnect?.(connection))
}

function rootsOverlap(a: string, b: string) {
  const one = position(a), two = position(b)
  return one.x < two.x + NODE_WIDTH && two.x < one.x + NODE_WIDTH
    && one.y < two.y + NODE_HEIGHT && two.y < one.y + NODE_HEIGHT
}

beforeEach(() => {
  vi.clearAllMocks()
  adapters.flow = null
  adapters.move.mockResolvedValue({ ok: true })
  adapters.add.mockResolvedValue({ ok: true, note: null })
  adapters.changeTitle.mockResolvedValue({ ok: true, note: null })
  window.localStorage.clear()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('HierarchySpaces layout gestures', () => {
  it.each([
    { label: 'left mouse', button: 0, pointerType: 'mouse' },
    { label: 'right mouse', button: 2, pointerType: 'mouse' },
    { label: 'touch', button: 0, pointerType: 'touch' },
  ])('moves the whole department rigidly with $label after a member returns to its aligned slot', ({ button, pointerType }) => {
    render(<HierarchySpaces departments={departments()} />)
    const originalParent = position('fa-scheme:anthony')
    const originalChild = position('fa-scheme:yuny')
    const originalEdges = JSON.stringify(flow().edges)
    dragMember('fa-scheme:yuny', 37, 53)
    expect(position('fa-scheme:anthony')).toEqual(originalParent)
    expect(position('fa-scheme:yuny')).toEqual(originalChild)

    const before = new Map(flow().nodes!.filter(item => item.id.startsWith('fa-scheme:'))
      .map(item => [item.id, { ...item.position }]))
    const heading = screen.getByRole('button', { name: 'Fair: drag to move department, click to focus' })
    fireEvent.pointerDown(heading, { pointerId: 9, pointerType, isPrimary: true, button, clientX: 400, clientY: 300 })
    fireEvent.pointerMove(heading, { pointerId: 9, pointerType, clientX: 280, clientY: 240 })
    fireEvent.pointerUp(heading, { pointerId: 9, pointerType, button, clientX: 280, clientY: 240 })

    // The viewport is at 50%: all members move by the same world delta.
    for (const [id, point] of before) expect(position(id)).toEqual({ x: point.x - 240, y: point.y - 120 })
    expect(JSON.stringify(flow().edges)).toBe(originalEdges)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBeGreaterThan(0)
  })

  it.each([
    { label: 'left mouse', button: 0, pointerType: 'mouse' },
    { label: 'right mouse', button: 2, pointerType: 'mouse' },
    { label: 'touch', button: 0, pointerType: 'touch' },
  ])('moves a team with $label freely across the canvas without moving a distant team or editing uplines', ({ button, pointerType }) => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    const originalEdges = JSON.stringify(flow().edges)
    const heading = screen.getByRole('button', { name: 'Anthony team: drag to move team, click to focus' })
    // A non-grid distance at 50% zoom also checks that no fixed dashboard cell
    // clamps a team when it moves outside the original department rectangle.
    dragGroup(heading, -513, -117, button, pointerType)
    for (const id of ['fa-scheme:anthony', 'fa-scheme:yuny']) {
      const point = before.get(id)!
      expect(position(id)).toEqual({ x: point.x - 1026, y: point.y - 234 })
    }
    for (const id of ['fa-scheme:chea', 'fa-scheme:howard']) expect(position(id)).toEqual(before.get(id))
    expect(JSON.stringify(flow().edges)).toBe(originalEdges)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('returns a leader dropped on blank canvas to the original team anchor', () => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    dragMember('fa-scheme:anthony', -211, 79)
    for (const [id, point] of before) expect(position(id)).toEqual(point)
    expect(node('fa-scheme:anthony').data.person.uplineStaffId).toBeNull()
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it.each(['top', 'right', 'bottom', 'left'])('lets the %s team border carry the same entire team', side => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    const border = screen.getByRole('button', { name: `Anthony team: move team by ${side} border` })
    dragGroup(border, -93, -61)
    for (const id of ['fa-scheme:anthony', 'fa-scheme:yuny']) {
      const point = before.get(id)!
      expect(position(id)).toEqual({ x: point.x - 186, y: point.y - 122 })
    }
    for (const id of ['fa-scheme:chea', 'fa-scheme:howard']) expect(position(id)).toEqual(before.get(id))
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('keeps a moved team anchored while a colliding neighbor yields as a rigid group', () => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    const movingShape = delta('fa-scheme:yuny', 'fa-scheme:anthony')
    const neighborShape = delta('fa-scheme:howard', 'fa-scheme:chea')
    const offset = delta('fa-scheme:chea', 'fa-scheme:anthony')
    dragGroup(screen.getByRole('button', { name: 'Anthony team: drag to move team, click to focus' }), offset.x / 2, offset.y / 2)
    expect(position('fa-scheme:anthony')).toEqual(before.get('fa-scheme:chea'))
    expect(position('fa-scheme:chea')).not.toEqual(before.get('fa-scheme:chea'))
    expect(rootsOverlap('fa-scheme:anthony', 'fa-scheme:chea')).toBe(false)
    expect(delta('fa-scheme:yuny', 'fa-scheme:anthony')).toEqual(movingShape)
    expect(delta('fa-scheme:howard', 'fa-scheme:chea')).toEqual(neighborShape)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it.each([
    { handleName: 'Anthony team: drag to move team, click to focus', label: 'team heading' },
    { handleName: 'Anthony team: move team by left border', label: 'team border' },
    { handleName: 'Fair: drag to move department, click to focus', label: 'department heading' },
  ])('supports keyboard movement on the $label without changing reporting lines', ({ handleName }) => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    const heading = screen.getByRole('button', { name: handleName })
    const isDepartment = handleName.startsWith('Fair:')
    fireEvent.keyDown(heading, { key: 'ArrowLeft' })
    fireEvent.keyDown(heading, { key: 'ArrowUp', shiftKey: true })
    for (const id of isDepartment
      ? ['fa-scheme:anthony', 'fa-scheme:yuny', 'fa-scheme:chea', 'fa-scheme:howard']
      : ['fa-scheme:anthony', 'fa-scheme:yuny']) {
      const point = before.get(id)!
      expect(position(id)).toEqual({ x: point.x - 40, y: point.y - 120 })
    }
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'pointercancel', 'lostpointercapture'])('restores a team border drag after %s and ignores its stale release', cancellation => {
    render(<HierarchySpaces departments={departments()} />)
    const before = positionsOf()
    const savedLayout = window.localStorage.getItem(window.localStorage.key(0)!)
    const border = screen.getByRole('button', { name: 'Anthony team: move team by left border' })
    const pointer = { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 }
    fireEvent.pointerDown(border, pointer)
    fireEvent.pointerMove(border, { ...pointer, clientX: 100, clientY: 150 })
    expect(position('fa-scheme:anthony')).not.toEqual(before.get('fa-scheme:anthony'))
    if (cancellation === 'Escape') fireEvent.keyDown(border, { key: 'Escape' })
    else if (cancellation === 'pointercancel') fireEvent.pointerCancel(border, pointer)
    else fireEvent.lostPointerCapture(border, pointer)
    for (const [id, point] of before) expect(position(id)).toEqual(point)
    fireEvent.pointerMove(border, { ...pointer, clientX: -200, clientY: -150 })
    fireEvent.pointerUp(border, { ...pointer, clientX: -200, clientY: -150 })
    for (const [id, point] of before) expect(position(id)).toEqual(point)
    expect(window.localStorage.getItem(window.localStorage.key(0)!)).toBe(savedLayout)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('grows and contracts a floating team frame with its members while retaining its leader anchor', () => {
    const data = departments()
    const view = render(<HierarchySpaces departments={data} />)
    // Place the small team away from its neighbor first; subsequent growth must
    // use this saved canvas anchor instead of returning it to its initial cell.
    dragGroup(screen.getByRole('button', { name: 'Anthony team: drag to move team, click to focus' }), -413, -87)
    const originalAnchor = position('fa-scheme:anthony')
    const originalFrame = teamFrame('team:fa:fa-scheme:anthony')
    const expanded = data.map(department => department.id === 'fa' ? { ...department, people: [
      ...department.people,
      ...['amy', 'ben', 'cal'].map(id => person(id, id.toUpperCase(), {
        uplineStaffId: 'anthony', titleName: 'Revenue Specialist', levelRank: 1, canRecruit: false,
      })),
    ] } : department)
    view.rerender(<HierarchySpaces departments={expanded} />)
    const expandedFrame = teamFrame('team:fa:fa-scheme:anthony')
    expect(expandedFrame.width).toBeGreaterThan(originalFrame.width)
    expect(position('fa-scheme:anthony')).toEqual(originalAnchor)
    expect(screen.getByRole('button', { name: 'Anthony team: drag to move team, click to focus' })).toHaveTextContent('5')
    const children = ['fa-scheme:yuny', 'fa-scheme:amy', 'fa-scheme:ben', 'fa-scheme:cal']
    for (const id of children) {
      const point = position(id)
      expect(point.x).toBeGreaterThanOrEqual(expandedFrame.x)
      expect(point.x + NODE_WIDTH).toBeLessThanOrEqual(expandedFrame.x + expandedFrame.width)
      expect(point.y + NODE_HEIGHT).toBeLessThanOrEqual(expandedFrame.y + expandedFrame.height)
    }
    expect(new Set(children.map(id => position(id).y)).size).toBe(1)
    view.rerender(<HierarchySpaces departments={data} />)
    expect(teamFrame('team:fa:fa-scheme:anthony').width).toBe(originalFrame.width)
    expect(position('fa-scheme:anthony')).toEqual(originalAnchor)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('retains measured card spacing when the same canvas receives a fresh server snapshot', async () => {
    vi.useFakeTimers()
    const data = departments()
    const view = render(<HierarchySpaces departments={data} />)
    // Long names, wrapped titles and line-limit details can make a real card
    // taller than its initial placeholder. A refresh must keep that measured
    // row spacing even if React Flow does not measure the unchanged card again.
    act(() => flow().onNodesChange?.([{
      type: 'dimensions', id: 'fa-scheme:anthony', dimensions: { width: NODE_WIDTH, height: 240 },
    }]))
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(delta('fa-scheme:yuny', 'fa-scheme:anthony').y).toBeGreaterThanOrEqual(240 + 78)
    const settled = positionsOf()
    const settledFrame = teamFrame('team:fa:fa-scheme:anthony')
    view.rerender(<HierarchySpaces departments={data.map(department => ({
      ...department, people: department.people.map(member => ({ ...member })),
    }))} />)
    expect(node('fa-scheme:anthony').measured?.height).toBe(240)
    for (const [id, point] of settled) expect(position(id)).toEqual(point)
    expect(teamFrame('team:fa:fa-scheme:anthony')).toEqual(settledFrame)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('Tidy separates overlapping teams in the active department and preserves each internal arrangement', () => {
    render(<HierarchySpaces departments={departments()} initialDepartmentId="fa" />)
    dragMember('fa-scheme:yuny', 37, 53)
    const anthonyShape = delta('fa-scheme:yuny', 'fa-scheme:anthony')
    const cheaShape = delta('fa-scheme:howard', 'fa-scheme:chea')
    const offset = delta('fa-scheme:chea', 'fa-scheme:anthony')
    // An in-progress canvas move supplies overlapping positions before its
    // release; pressing Tidy must also handle that current arrangement.
    act(() => flow().onNodesChange?.(['fa-scheme:anthony', 'fa-scheme:yuny'].map(id => ({
      type: 'position' as const, id, dragging: true,
      position: { x: position(id).x + offset.x, y: position(id).y + offset.y },
    }))))
    expect(rootsOverlap('fa-scheme:anthony', 'fa-scheme:chea')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }))
    expect(rootsOverlap('fa-scheme:anthony', 'fa-scheme:chea')).toBe(false)
    expect(delta('fa-scheme:yuny', 'fa-scheme:anthony')).toEqual(anthonyShape)
    expect(delta('fa-scheme:howard', 'fa-scheme:chea')).toEqual(cheaShape)
    expect(adapters.move).not.toHaveBeenCalled()
  })
})

describe('HierarchySpaces directors (the Revenue Director rail, design A 2026-09-12)', () => {
  function directed(): OrgDepartment[] {
    const [fair, ir] = departments()
    return [
      { ...fair, directors: [
        { staffId: 'peter', name: 'PETER', code: null, titleName: 'Revenue Director' },
        { staffId: 'kris', name: 'KRIS', code: null, titleName: 'Revenue Director' },
      ] },
      { ...ir, directors: [{ staffId: 'peter', name: 'PETER', code: null, titleName: 'Revenue Director' }] },
    ]
  }
  function frameOf(departmentId: string) {
    const frame = document.querySelector<SVGRectElement>(`.space-department[data-department-id="${departmentId}"]`)
    expect(frame, `frame ${departmentId}`).not.toBeNull()
    return {
      x: Number(frame!.getAttribute('x')), y: Number(frame!.getAttribute('y')),
      width: Number(frame!.getAttribute('width')), height: Number(frame!.getAttribute('height')),
    }
  }
  const cards = () => [...document.querySelectorAll<HTMLElement>('.space-director')]
  const cardPositions = () => cards().map(card => ({ x: parseFloat(card.style.left), y: parseFloat(card.style.top) }))

  it('draws every director once, A→Z, on a rail above all the frames — never as a node, never inside a frame', () => {
    render(<HierarchySpaces departments={directed()} />)
    expect(cards().map(card => card.dataset.director)).toEqual(['kris', 'peter'])
    expect(screen.getByRole('img', { name: 'KRIS, Revenue Director, directs Fair' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'PETER, Revenue Director, directs Fair · IR' })).toBeTruthy()
    expect(screen.getByText('Revenue Directors · reporting only')).toBeTruthy()
    expect(flow().nodes!.some(node => node.id.includes('peter') || node.id.includes('kris'))).toBe(false)
    const [kris, peter] = cardPositions()
    expect(kris.y).toBe(peter.y)
    expect(kris.x).toBeLessThan(peter.x)
    const highest = Math.min(frameOf('fa').y, frameOf('ir').y)
    for (const card of cardPositions()) expect(card.y + NODE_HEIGHT).toBeLessThan(highest)
    expect(within(cards()[1]).getByText('Fair · IR')).toBeTruthy()
    expect(screen.getByText(/2 directors/)).toBeTruthy()
  })

  it('draws one dashed line per director and sub-department, joined on one bus per frame that lands on its top edge', () => {
    render(<HierarchySpaces departments={directed()} />)
    const lines = [...document.querySelectorAll<SVGPathElement>('.space-director-line')]
    expect(lines.map(line => line.dataset.directorLine).sort()).toEqual(['kris:fa', 'peter:fa', 'peter:ir'])
    expect([...document.querySelectorAll<SVGGElement>('[data-director-bus]')].map(bus => bus.dataset.directorBus)).toEqual(['fa', 'ir'])
    expect(document.querySelectorAll('.space-director-bus')).toHaveLength(2)
    // The dot lands on the frame's top edge at its centre; no line points at a member.
    for (const id of ['fa', 'ir']) {
      const frame = frameOf(id)
      const dot = document.querySelector<SVGCircleElement>(`[data-director-bus="${id}"] .space-director-dot`)!
      expect(Number(dot.getAttribute('cx'))).toBeCloseTo(frame.x + frame.width / 2, 6)
      expect(Number(dot.getAttribute('cy'))).toBeCloseTo(frame.y, 6)
    }
    expect(lines.some(line => line.dataset.directorLine?.includes('scheme'))).toBe(false)
    expect(flow().edges).toHaveLength(3)
  })

  it('names the directors on the frame header, a team leader’s last row and the popover’s detach row, but keeps Upline for a member', () => {
    render(<HierarchySpaces departments={directed()} />)
    expect(screen.getByRole('button', { name: 'Fair: drag to move department, click to focus' })).toHaveTextContent('Reports to KRIS · PETER')
    expect(screen.getByRole('button', { name: 'IR: drag to move department, click to focus' })).toHaveTextContent('Reports to PETER')
    const anthony = within(screen.getByTestId('node:fa-scheme:anthony'))
    expect(anthony.getByText('Reports to')).toBeTruthy()
    expect(anthony.getByText('KRIS · PETER')).toBeTruthy()
    const yuny = within(screen.getByTestId('node:fa-scheme:yuny'))
    expect(yuny.getByText('Upline')).toBeTruthy()
    expect(yuny.getByText('Anthony')).toBeTruthy()
    fireEvent.click(yuny.getByRole('button', { name: 'Change upline of Yuny in Fair' }))
    expect(screen.getByText('reports to KRIS · PETER · no override')).toBeTruthy()
  })

  it('keeps the rail centred over the frames when a department is dragged, and follows the highest one', () => {
    render(<HierarchySpaces departments={directed()} />)
    const before = cardPositions()
    const lineBefore = document.querySelector<SVGPathElement>('[data-director-line="peter:ir"]')!.getAttribute('d')
    // Fair rises and moves left by (240, 120) in world units at 50 % zoom; IR stays.
    dragGroup(screen.getByRole('button', { name: 'Fair: drag to move department, click to focus' }), -120, -60)
    const after = cardPositions()
    after.forEach((point, index) => {
      // Fair is now the highest frame, 120 higher: the rail followed. Only the
      // union's left edge moved, so its centre — and the cards — moved half as far.
      expect(point.y).toBeCloseTo(before[index].y - 120, 6)
      expect(point.x).toBeCloseTo(before[index].x - 120, 6)
    })
    expect(document.querySelector<SVGPathElement>('[data-director-line="peter:ir"]')!.getAttribute('d')).not.toBe(lineBefore)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('never runs a glide backwards when the first animation frame is stamped before the glide began', async () => {
    // Chrome hands requestAnimationFrame a frame time that can precede the
    // performance.now() sampled when the glide was scheduled (a first load in
    // a background tab). Progress must clamp at 0: extrapolating the frames
    // backwards gave Fair a negative height, which the rail refuses.
    vi.useFakeTimers()
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(performance.now() - 40), 16))
    render(<HierarchySpaces departments={directed()} />)
    const start = frameOf('fa')
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    const early = frameOf('fa')
    expect(cards()).toHaveLength(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    const end = frameOf('fa')
    expect(end).not.toEqual(start)
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(early[key]).toBeGreaterThanOrEqual(Math.min(start[key], end[key]))
      expect(early[key]).toBeLessThanOrEqual(Math.max(start[key], end[key]))
    }
    expect(cards()).toHaveLength(2)
  })

  it('reports where the top of a tree now reports to after a detach', async () => {
    render(<HierarchySpaces departments={directed()} />)
    const yuny = within(screen.getByTestId('node:fa-scheme:yuny'))
    fireEvent.click(yuny.getByRole('button', { name: 'Change upline of Yuny in Fair' }))
    fireEvent.click(screen.getByRole('option', { name: /Top of their own tree/ }))
    await waitFor(() => expect(adapters.move).toHaveBeenCalledWith('fa-scheme', 'yuny', null))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('reporting to KRIS · PETER — no override'))
  })
})

describe('HierarchySpaces explicit upline edits', () => {
  it('sends raw staff IDs and the target membership scheme for a same-department connector', async () => {
    render(<HierarchySpaces departments={departments()} />)
    connect('fa-scheme:chea', 'fa-scheme:yuny')
    await waitFor(() => expect(adapters.move).toHaveBeenCalledExactlyOnceWith('fa-scheme', 'yuny', 'chea'))
    await waitFor(() => expect(screen.queryByText('Saving upline…')).not.toBeInTheDocument())
    // The action revalidates the route, so its response carries the fresh
    // page; a router.refresh() on top would render the whole page twice.
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('rejects a connector across departments before any write', () => {
    render(<HierarchySpaces departments={departments()} />)
    connect('ir-scheme:rachael', 'fa-scheme:yuny')
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an upline within the same sub-department')
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('keeps duplicate staff selections and the real Upline popover scoped to the selected membership', async () => {
    render(<HierarchySpaces departments={departments()} />)
    fireEvent.click(screen.getByTestId('node:ir-scheme:chea'))
    expect(screen.getByText('Chea Huan · IR')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change upline' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Chea Huan' })
    expect(within(dialog).getByRole('option', { name: /Rachael/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByRole('option', { name: /Chea Huan/ })).toHaveTextContent('Relationship Specialist')
    expect(within(dialog).queryByRole('option', { name: /Anthony|Howard|Yuny/ })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('option', { name: /Lawrence/ }))
    await waitFor(() => expect(adapters.move).toHaveBeenCalledExactlyOnceWith('ir-scheme', 'chea', 'lawrence'))
  })

  it('synchronizes keyboard selection with the footer and its scoped Change upline action', async () => {
    render(<HierarchySpaces departments={departments()} />)
    fireEvent.click(screen.getByTestId('node:fa-scheme:anthony'))
    expect(screen.getByText('Anthony · Fair')).toBeInTheDocument()

    // React Flow emits selection changes when keyboard navigation selects a
    // node; it need not emit the pointer-only onNodeClick callback.
    act(() => flow().onNodesChange?.([
      { type: 'select', id: 'fa-scheme:anthony', selected: false },
      { type: 'select', id: 'ir-scheme:chea', selected: true },
    ]))
    expect(screen.queryByText('Anthony · Fair')).not.toBeInTheDocument()
    expect(screen.getByText('Chea Huan · IR')).toBeInTheDocument()
    expect(node('fa-scheme:anthony').selected).toBe(false)
    expect(node('fa-scheme:anthony').data.selected).toBe(false)
    expect(node('ir-scheme:chea').selected).toBe(true)
    expect(node('ir-scheme:chea').data.selected).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Change upline' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Chea Huan' })
    expect(within(dialog).getByRole('option', { name: /Rachael/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).queryByRole('option', { name: /Anthony|Howard|Yuny/ })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('option', { name: /Lawrence/ }))
    await waitFor(() => expect(adapters.move).toHaveBeenCalledExactlyOnceWith('ir-scheme', 'chea', 'lawrence'))
  })

  it('opens a card Upline menu with its own department even when that person exists elsewhere', () => {
    render(<HierarchySpaces departments={departments()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change upline of Chea Huan in Fair' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Chea Huan' })
    expect(within(dialog).getByRole('option', { name: /Anthony/ })).toBeEnabled()
    expect(within(dialog).getByRole('option', { name: /Chea Huan/ })).toHaveTextContent('Team Leader')
    expect(within(dialog).queryByRole('option', { name: /Rachael|Lawrence/ })).not.toBeInTheDocument()
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('surfaces an authorization refusal from the writer without announcing or refreshing a successful edit', async () => {
    // This is the UI's response to the permission boundary, not a substitute
    // for testing the real server action or database permissions.
    adapters.move.mockResolvedValueOnce({ ok: false, reason: 'You do not have permission to change this hierarchy.' })
    render(<HierarchySpaces departments={departments()} />)
    connect('fa-scheme:chea', 'fa-scheme:yuny')
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to change this hierarchy.')
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('HierarchySpaces department membership actions', () => {
  it('changes the right-clicked IR membership title without changing the same person in Fair or either upline', async () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    const fairBefore = { ...node('fa-scheme:chea').data.person }
    const irUpline = node('ir-scheme:chea').data.person.uplineStaffId
    fireEvent.contextMenu(screen.getByTestId('node:ir-scheme:chea').querySelector('.org-card')!)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Actions for Chea Huan' }))
      .getByRole('menuitem', { name: /Change title/ }))
    const titles = screen.getByRole('menu', { name: 'Change Chea Huan title in IR' })
    expect(adapters.changeTitle).not.toHaveBeenCalled()
    fireEvent.click(within(titles).getByRole('menuitem', { name: 'Team Assistant' }))
    await waitFor(() => expect(adapters.changeTitle).toHaveBeenCalledOnce())
    const payload = adapters.changeTitle.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'chea', scheme_id: 'ir-scheme', title_id: 'assistant' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(node('fa-scheme:chea').data.person).toEqual(fairBefore)
    expect(node('ir-scheme:chea').data.person.uplineStaffId).toBe(irUpline)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.add).not.toHaveBeenCalled()
  })

  it('adds the right-clicked person to a destination without editing their original membership or upline', async () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    const original = { ...node('fa-scheme:yuny').data.person }
    const card = screen.getByTestId('node:fa-scheme:yuny').querySelector('.org-card')!
    fireEvent.contextMenu(card, { clientX: 320, clientY: 200 })

    const menu = screen.getByRole('menu', { name: 'Actions for Yuny' })
    expect(within(menu).getByRole('menuitem', { name: 'Change upline' })).toBeEnabled()
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.add).not.toHaveBeenCalled()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Add to department/ }))

    const destinations = screen.getByRole('menu', { name: 'Add Yuny to department' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(destinations).getByRole('menuitem', { name: 'Fair' })).toBeDisabled()
    expect(screen.queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    fireEvent.click(within(destinations).getByRole('menuitem', { name: 'IR' }))
    expect(adapters.add).not.toHaveBeenCalled()
    const titles = screen.getByRole('menu', { name: 'Add Yuny to IR as' })
    expect(titles).toHaveTextContent('No upline is copied. Set it in IR after adding.')
    expect(within(titles).getByRole('menuitem', { name: 'Team Assistant' })).toHaveTextContent('Current title')
    fireEvent.click(within(titles).getByRole('menuitem', { name: 'Team Leader' }))

    await waitFor(() => expect(adapters.add).toHaveBeenCalledOnce())
    const payload = adapters.add.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'yuny', scheme_id: 'ir-scheme', title_id: 'leader' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(node('fa-scheme:yuny').data.person).toEqual(original)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('adds from the selected card membership after a normal left click', async () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    fireEvent.click(screen.getByTestId('node:fa-scheme:howard'))
    expect(screen.getByText('Howard · Fair')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add to department/ }))
    expect(screen.getByRole('menu', { name: 'Add Howard to department' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adapters.add).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add Howard to department' }))
      .getByRole('menuitem', { name: 'IR' }))
    expect(adapters.add).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add Howard to IR as' }))
      .getByRole('menuitem', { name: 'Team Assistant' }))
    await waitFor(() => expect(adapters.add).toHaveBeenCalledOnce())
    const payload = adapters.add.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'howard', scheme_id: 'ir-scheme', title_id: 'assistant' })
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('adds the clicked IR card to Fair with a new title even when Fair is the home department', async () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    fireEvent.contextMenu(screen.getByTestId('node:ir-scheme:lawrence').querySelector('.org-card')!)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Actions for Lawrence' }))
      .getByRole('menuitem', { name: /Add to department/ }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add Lawrence to department' }))
      .getByRole('menuitem', { name: 'Fair' }))
    expect(adapters.add).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add Lawrence to Fair as' }))
      .getByRole('menuitem', { name: 'Revenue Specialist' }))
    await waitFor(() => expect(adapters.add).toHaveBeenCalledOnce())
    const payload = adapters.add.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'lawrence', scheme_id: 'fa-scheme', title_id: 'specialist' })
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('dismisses the right-click menu with Escape without performing a write', () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    fireEvent.contextMenu(screen.getByTestId('node:fa-scheme:anthony').querySelector('.org-card')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Anthony' })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adapters.add).not.toHaveBeenCalled()
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('opens the card menu with Shift+F10 and restores card focus after Escape', () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    const card = screen.getByLabelText('Yuny in Fair')
    card.focus()
    fireEvent.keyDown(card, { key: 'F10', shiftKey: true })
    const menu = screen.getByRole('menu', { name: 'Actions for Yuny' })
    expect(within(menu).getByRole('menuitem', { name: /Add to department/ })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(card).toHaveFocus()
    expect(adapters.add).not.toHaveBeenCalled()
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('keeps Change upline scoped to the membership that was right-clicked', () => {
    render(<HierarchySpaces departments={departments()} membershipDestinations={membershipDestinations()} />)
    fireEvent.contextMenu(screen.getByTestId('node:ir-scheme:chea').querySelector('.org-card')!)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Actions for Chea Huan' }))
      .getByRole('menuitem', { name: 'Change upline' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Chea Huan' })
    expect(within(dialog).getByRole('option', { name: /Rachael/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).queryByRole('option', { name: /Anthony|Howard|Yuny/ })).not.toBeInTheDocument()
    expect(adapters.add).not.toHaveBeenCalled()
    expect(adapters.move).not.toHaveBeenCalled()
  })
})

describe('HierarchySpaces deliberate drag transfers', () => {
  beforeEach(() => vi.useFakeTimers())

  async function waitForHover(milliseconds = 450) {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
  }

  function dragOver(moverId: string, targetId: string) {
    const mover = node(moverId)
    const target = position(targetId)
    const pointer = { clientX: target.x + 30, clientY: target.y + 20 }
    act(() => flow().onNodeDragStart?.(new MouseEvent('mousedown'), mover, [mover]))
    act(() => flow().onNodesChange?.([{
      type: 'position', id: moverId, position: { x: target.x + 10, y: target.y + 10 }, dragging: true,
    }]))
    act(() => {
      const current = node(moverId)
      flow().onNodeDrag?.(new MouseEvent('mousemove', pointer), current, [current])
    })
    return pointer
  }

  async function release(moverId: string, pointer: { clientX: number; clientY: number }, droppedNode = node(moverId)) {
    await act(async () => {
      flow().onNodeDragStop?.(new MouseEvent('mouseup', pointer), droppedNode, [droppedNode])
    })
  }

  it('returns a quick pass over another card to its aligned slot without changing the reporting line', async () => {
    render(<HierarchySpaces departments={departments()} />)
    const origin = position('fa-scheme:yuny')
    const pointer = dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    await waitForHover(449)
    await release('fa-scheme:yuny', pointer)
    await waitForHover(100)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('anthony')
    expect(position('fa-scheme:yuny')).toEqual(origin)
  })

  it('springs a blank card drop back to its team slot through intermediate positions', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    render(<HierarchySpaces departments={departments()} />)
    const origin = position('fa-scheme:yuny')
    const parentOrigin = position('fa-scheme:anthony')
    const originFrame = teamFrame('team:fa:fa-scheme:anthony')
    dragMember('fa-scheme:yuny', -193, 87)
    const released = position('fa-scheme:yuny')
    expect(released).toEqual({ x: origin.x - 193, y: origin.y + 87 })
    expect(teamFrame('team:fa:fa-scheme:anthony')).toEqual(originFrame)
    await waitForHover(250)
    expect(position('fa-scheme:yuny')).not.toEqual(released)
    expect(position('fa-scheme:yuny')).not.toEqual(origin)
    expect(teamFrame('team:fa:fa-scheme:anthony')).toEqual(originFrame)
    await waitForHover(300)
    expect(position('fa-scheme:yuny')).toEqual(origin)
    expect(position('fa-scheme:anthony')).toEqual(parentOrigin)
    expect(adapters.move).not.toHaveBeenCalled()
  })

  it('commits an armed drop to the correct membership and keeps its landing when server data refreshes', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    const data = departments()
    const view = render(<HierarchySpaces departments={data} />)
    const fairUpline = node('fa-scheme:chea').data.person.uplineStaffId
    const oldSourceFrame = teamFrame('team:ir:ir-scheme:rachael')
    const oldDestinationFrame = teamFrame('team:ir:ir-scheme:lawrence')
    const pointer = dragOver('ir-scheme:chea', 'ir-scheme:lawrence')
    const droppedPosition = position('ir-scheme:chea')
    await waitForHover()
    expect(adapters.move).not.toHaveBeenCalled()
    // Pulling a card across the canvas must not stretch its team rectangle
    // across neighboring teams before a reporting-line change is accepted.
    expect(teamFrame('team:ir:ir-scheme:rachael')).toEqual(oldSourceFrame)
    expect(teamFrame('team:ir:ir-scheme:lawrence')).toEqual(oldDestinationFrame)
    await release('ir-scheme:chea', pointer)
    expect(adapters.move).toHaveBeenCalledExactlyOnceWith('ir-scheme', 'chea', 'lawrence')
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(node('ir-scheme:chea').data.person.uplineStaffId).toBe('lawrence')
    expect(node('fa-scheme:chea').data.person.uplineStaffId).toBe(fairUpline)
    // A real-motion transfer begins at the dropped location and settles
    // through intermediate positions; replacing server data must not snap it.
    expect(position('ir-scheme:chea')).toEqual(droppedPosition)
    await waitForHover(250)
    const halfway = position('ir-scheme:chea')
    expect(halfway).not.toEqual(droppedPosition)
    const halfwayFrame = teamFrame('team:ir:ir-scheme:lawrence')
    expect(halfwayFrame.height).toBeGreaterThan(oldDestinationFrame.height)
    await waitForHover(300)
    expect(position('ir-scheme:chea')).not.toEqual(halfway)
    expect(rootsOverlap('ir-scheme:chea', 'ir-scheme:lawrence')).toBe(false)
    expect(teamFrame('team:ir:ir-scheme:lawrence').height).toBeGreaterThan(oldDestinationFrame.height)
    expect(teamFrame('team:ir:ir-scheme:lawrence').height).toBeGreaterThan(halfwayFrame.height)
    expect(teamFrame('team:ir:ir-scheme:rachael').height).toBeLessThan(oldSourceFrame.height)
    const landed = new Map(flow().nodes!.map(current => [current.id, { ...current.position }]))

    const refreshed = data.map(department => ({ ...department, people: department.people.map(person => ({
      ...person,
      uplineStaffId: department.id === 'ir' && person.staffId === 'chea' ? 'lawrence' : person.uplineStaffId,
    })) }))
    view.rerender(<HierarchySpaces departments={refreshed} />)
    for (const [id, point] of landed) expect(position(id)).toEqual(point)
    expect(node('ir-scheme:chea').data.uplineName).toBe('Lawrence')
    expect(adapters.move).toHaveBeenCalledOnce()
  })

  it('keeps team frames settled while an accepted drag transfer is waiting for the server', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    let finishWrite!: (result: { ok: true }) => void
    adapters.move.mockReturnValueOnce(new Promise<{ ok: true }>(resolve => { finishWrite = resolve }))
    render(<HierarchySpaces departments={departments()} />)
    const sourceFrame = teamFrame('team:fa:fa-scheme:anthony')
    const targetFrame = teamFrame('team:fa:fa-scheme:chea')
    const pointer = dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    await waitForHover()
    await release('fa-scheme:yuny', pointer)
    expect(adapters.move).toHaveBeenCalledExactlyOnceWith('fa-scheme', 'yuny', 'chea')
    expect(screen.getByText('Saving upline…')).toBeInTheDocument()
    expect(node('fa-scheme:yuny').data.pending).toBe(true)
    expect(teamFrame('team:fa:fa-scheme:anthony')).toEqual(sourceFrame)
    expect(teamFrame('team:fa:fa-scheme:chea')).toEqual(targetFrame)
    await waitForHover(1000)
    expect(teamFrame('team:fa:fa-scheme:anthony')).toEqual(sourceFrame)
    expect(teamFrame('team:fa:fa-scheme:chea')).toEqual(targetFrame)
    await act(async () => { finishWrite({ ok: true }) })
    await waitForHover(550)
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('chea')
    expect(teamFrame('team:fa:fa-scheme:chea').width).toBeGreaterThan(targetFrame.width)
    expect(teamFrame('team:fa:fa-scheme:anthony').height).toBeLessThan(sourceFrame.height)
  })

  it.each(['pointer', 'keyboard'])('completes a transfer before a %s group gesture can save an intermediate arrangement', async gesture => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    render(<HierarchySpaces departments={departments()} />)
    const canonicalShape = delta('ir-scheme:chea', 'ir-scheme:rachael')
    const destinationOrigin = position('ir-scheme:lawrence')
    const pointer = dragOver('ir-scheme:chea', 'ir-scheme:lawrence')
    await waitForHover()
    await release('ir-scheme:chea', pointer)
    await waitForHover(120)
    expect(node('ir-scheme:chea').data.person.uplineStaffId).toBe('lawrence')
    expect(node('ir-scheme:chea').data.pending).toBe(false)
    expect(delta('ir-scheme:chea', 'ir-scheme:lawrence')).not.toEqual(canonicalShape)
    const movement = gesture === 'pointer' ? { x: 166, y: -78 } : { x: 40, y: 0 }
    if (gesture === 'pointer') {
      dragGroup(screen.getByRole('button', { name: 'Lawrence team: move team by left border' }), 83, -39)
    } else {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Lawrence team: drag to move team, click to focus' }), { key: 'ArrowRight' })
    }
    // An interrupted transfer cannot leave the incoming card mid-flight while
    // the frame and its saved layout are subsequently moved as one rigid team.
    expect(delta('ir-scheme:chea', 'ir-scheme:lawrence')).toEqual(canonicalShape)
    expect(position('ir-scheme:lawrence')).toEqual({
      x: destinationOrigin.x + movement.x, y: destinationOrigin.y + movement.y,
    })
    await waitForHover(600)
    expect(delta('ir-scheme:chea', 'ir-scheme:lawrence')).toEqual(canonicalShape)
    const remembered = readManualLayout(window.localStorage, 'spaces.v1.fa-scheme.ir-scheme')
    const savedLeader = remembered.get('ir-scheme:lawrence')!
    expect(remembered.get('ir-scheme:chea')).toEqual({
      x: savedLeader.x + canonicalShape.x, y: savedLeader.y + canonicalShape.y,
    })
    expect(adapters.move).toHaveBeenCalledExactlyOnceWith('ir-scheme', 'chea', 'lawrence')
  })

  it('rechecks the release position rather than committing the last armed hover after the pointer left', async () => {
    render(<HierarchySpaces departments={departments()} />)
    dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    await waitForHover()
    // Browsers may deliver mouseup without a final mousemove at its location.
    await release('fa-scheme:yuny', { clientX: -2000, clientY: -2000 })
    expect(adapters.move).not.toHaveBeenCalled()
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('anthony')
  })

  it.each([
    { targetId: 'fa-scheme:howard', reason: 'title cannot hold downlines' },
    { targetId: 'ir-scheme:rachael', reason: 'Each sub-department has its own hierarchy' },
  ])('refuses the invalid target $targetId even after a sustained hover', async ({ targetId, reason }) => {
    render(<HierarchySpaces departments={departments()} />)
    const origin = position('fa-scheme:yuny')
    const pointer = dragOver('fa-scheme:yuny', targetId)
    await waitForHover(600)
    await release('fa-scheme:yuny', pointer)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(reason)
    expect(position('fa-scheme:yuny')).toEqual(origin)
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('anthony')
  })

  it('cancels an armed transfer with Escape and ignores a final stale drag position', async () => {
    render(<HierarchySpaces departments={departments()} />)
    const origin = position('fa-scheme:yuny')
    const pointer = dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    const staleDraggedNode = node('fa-scheme:yuny')
    await waitForHover()
    fireEvent.keyDown(screen.getByTestId('node:fa-scheme:yuny'), { key: 'Escape' })
    expect(position('fa-scheme:yuny')).toEqual(origin)
    act(() => flow().onNodesChange?.([{
      type: 'position', id: 'fa-scheme:yuny', position: staleDraggedNode.position, dragging: true,
    }]))
    await release('fa-scheme:yuny', pointer, staleDraggedNode)
    expect(position('fa-scheme:yuny')).toEqual(origin)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('restores the original arrangement and upline when the server refuses an armed drop', async () => {
    adapters.move.mockResolvedValueOnce({ ok: false, reason: 'This team has no direct lines available.' })
    render(<HierarchySpaces departments={departments()} />)
    const origins = new Map(flow().nodes!.map(current => [current.id, { ...current.position }]))
    const pointer = dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    await waitForHover()
    await release('fa-scheme:yuny', pointer)
    expect(adapters.move).toHaveBeenCalledExactlyOnceWith('fa-scheme', 'yuny', 'chea')
    expect(screen.getByRole('alert')).toHaveTextContent('This team has no direct lines available.')
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('anthony')
    for (const [id, point] of origins) expect(position(id)).toEqual(point)
  })
})
