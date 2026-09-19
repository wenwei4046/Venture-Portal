import { useState, type ComponentType, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection, Node, ReactFlowInstance, ReactFlowProps } from '@xyflow/react'
import { layoutKey, readManualLayout, writeManualLayout } from '@/lib/commission/chart-layout-store'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import TeamOrgChart, { ALL_DEPARTMENTS, type ChartPerson } from './TeamOrgChart'

type PersonNode = Node<{ person: ChartPerson; invalidTarget: boolean; selected: boolean }>
type FlowProps = ReactFlowProps<PersonNode>
const adapters = vi.hoisted(() => ({
  flow: null as FlowProps | null,
  setReportsTo: vi.fn(),
  undoHierarchyMove: vi.fn(),
  router: { refresh: vi.fn() },
  viewport: {
    getIntersectingNodes: vi.fn(), fitBounds: vi.fn(), setCenter: vi.fn(),
    getZoom: () => 0.5, zoomIn: vi.fn(), zoomOut: vi.fn(),
    getViewport: () => ({ x: 0, y: 0, zoom: 0.5 }), setViewport: vi.fn(),
    screenToFlowPosition: (point: { x: number; y: number }) => point,
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => adapters.router }))
vi.mock('../actions', () => ({
  setReportsTo: adapters.setReportsTo,
  undoHierarchyMove: adapters.undoHierarchyMove,
}))
vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    ViewportPortal: ({ children }: { children: ReactNode }) => children,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    useReactFlow: () => adapters.viewport,
    useViewport: () => ({ x: 0, y: 0, zoom: 0.5 }),
    // Replace the renderer only: company grouping, cards, reporting guards,
    // search, layout gestures and undo still run through the real component.
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

function person(id: string, name: string, extra: Partial<ChartPerson> = {}): ChartPerson {
  return {
    id, name, code: id.toUpperCase(), title: 'Manager', department: 'Finance',
    commissionDept: false, canRecruit: null, isDepartmentHead: false, leadIds: [],
    levelRank: 4, levelName: 'Manager', reportsTo: null, ...extra,
  }
}

function people(): ChartPerson[] {
  return [
    person('alice', 'Alice'),
    person('ben', 'Ben', { reportsTo: 'alice', levelRank: 2, levelName: 'Executive' }),
    person('cara', 'Cara'),
    person('hannah', 'Hannah', { department: 'HR' }),
    person('anthony', 'Anthony', { department: 'Revenue', commissionDept: true, canRecruit: true }),
    person('yuny', 'Yuny', { department: 'Revenue', commissionDept: true, canRecruit: false,
      title: 'Revenue Specialist', reportsTo: 'anthony', levelRank: 2, levelName: 'Executive' }),
  ]
}

function Chart({ roster = people(), initialDepartment = ALL_DEPARTMENTS, initialFocused = null }: {
  roster?: ChartPerson[]; initialDepartment?: string; initialFocused?: string | null
}) {
  const [focused, setFocused] = useState<string | null>(initialFocused)
  const [department, setDepartment] = useState(initialDepartment)
  return <TeamOrgChart people={roster} commissionHref="/revenue/fair/hierarchy"
    focused={focused} onFocus={setFocused} focusDept={department} onFocusDept={setDepartment} />
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

function connect(source: string, target: string) {
  const connection: Connection = { source, target, sourceHandle: null, targetHandle: null }
  act(() => flow().onConnect?.(connection))
}

function initializeFlow() {
  act(() => flow().onInit?.(adapters.viewport as unknown as ReactFlowInstance<PersonNode>))
}

function frame(kind: 'department' | 'team', id: string) {
  const element = document.querySelector<SVGRectElement>(`.space-${kind}[data-${kind}-id="${id}"]`)
  expect(element, `${kind} frame ${id}`).not.toBeNull()
  return {
    x: Number(element!.getAttribute('x')), y: Number(element!.getAttribute('y')),
    width: Number(element!.getAttribute('width')), height: Number(element!.getAttribute('height')),
  }
}

function dragGroup(handle: HTMLElement, dx: number, dy: number) {
  const start = { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 }
  fireEvent.pointerDown(handle, start)
  fireEvent.pointerMove(handle, { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy })
  fireEvent.pointerUp(handle, { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy })
}

beforeEach(() => {
  vi.clearAllMocks()
  adapters.flow = null
  adapters.viewport.getIntersectingNodes.mockReturnValue([])
  adapters.setReportsTo.mockImplementation(async (_id: string, reportsTo: string | null) => ({ ok: true, reportsTo }))
  adapters.undoHierarchyMove.mockResolvedValue({ undone: true, note: 'Previous reporting line restored.' })
  window.localStorage.clear()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('company hierarchy reporting rules', () => {
  it('writes a valid connector and retains the previous reporting line for Undo', async () => {
    render(<Chart />)
    connect('cara', 'ben')
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('ben', 'cara'))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(adapters.undoHierarchyMove).toHaveBeenCalledWith({
      staffId: 'ben', reportsTo: 'alice', movedTo: 'cara',
    }))
    expect(await screen.findByText('Previous reporting line restored.')).toBeTruthy()
  })

  it.each([
    { label: 'a cycle', source: 'ben', target: 'alice', reason: /own report/i },
    { label: 'a lower ladder rank', source: 'ben', target: 'cara', reason: /stands above/i },
    { label: 'the commission department boundary', source: 'alice', target: 'yuny', reason: /commission upline/i },
  ])('refuses $label before writing', ({ source, target, reason }) => {
    render(<Chart />)
    connect(source, target)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(reason)
  })

  it('refuses a Revenue manager whose title cannot hold downlines', () => {
    const roster = people().concat(person('other', 'Other Specialist', {
      department: 'Revenue', commissionDept: true, canRecruit: false,
      title: 'Revenue Specialist', levelRank: 2,
    }))
    render(<Chart roster={roster} />)
    connect('other', 'yuny')
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/cannot hold downlines/i)
  })

  it('still permits reporting across ordinary departments', async () => {
    render(<Chart />)
    connect('hannah', 'ben')
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('ben', 'hannah'))
  })

  it('does not announce a successful move or offer Undo when the server refuses it', async () => {
    adapters.setReportsTo.mockResolvedValue({ ok: false, reason: 'You do not have permission to move staff.' })
    render(<Chart />)
    connect('cara', 'ben')
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to move staff.')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('never writes a reporting change when a person is dropped on blank canvas', () => {
    render(<Chart />)
    const before = node('ben')
    const reporting = JSON.stringify(flow().edges)
    act(() => flow().onNodeDragStart?.(new MouseEvent('mousedown'), before, [before]))
    const moved = { ...node('ben'), position: { x: before.position.x + 100, y: before.position.y + 200 } }
    act(() => flow().onNodeDragStop?.(new MouseEvent('mouseup'), moved, [moved]))
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(JSON.stringify(flow().edges)).toBe(reporting)
  })

  it('keeps staff on their assigned slots when renderer changes request deletion or a keyboard move', () => {
    render(<Chart />)
    const original = { ...node('ben').position }
    expect(flow().deleteKeyCode).toBeNull()
    expect(node('ben').deletable).toBe(false)
    act(() => flow().onNodesChange?.([
      { type: 'remove', id: 'ben' },
      { type: 'position', id: 'alice', position: { x: 9000, y: 9000 } },
    ]))
    expect(node('ben').position).toEqual(original)
    expect(node('alice').position).not.toEqual({ x: 9000, y: 9000 })
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })
})

describe('company hierarchy grouped canvas', () => {
  it('opens a wide horizontal company at a readable zoom from its left edge', () => {
    const roster = people().concat(Array.from({ length: 8 }, (_, index) =>
      person(`branch-${index}`, `Branch manager ${index}`, { department: `Branch ${index}` })))
    render(<Chart roster={roster} />)
    const canvas = document.querySelector('.space-canvas')!
    Object.defineProperty(canvas, 'clientWidth', { value: 900, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 700, configurable: true })
    initializeFlow()
    expect(adapters.viewport.setViewport).toHaveBeenCalled()
    const viewport = adapters.viewport.setViewport.mock.calls.at(-1)![0] as { x: number; y: number; zoom: number }
    const departments = [...document.querySelectorAll<SVGRectElement>('.space-department')]
    const left = Math.min(...departments.map(element => Number(element.getAttribute('x'))))
    const right = Math.max(...departments.map(element => Number(element.getAttribute('x')) + Number(element.getAttribute('width'))))
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.45)
    expect(viewport.zoom).toBeLessThanOrEqual(0.7)
    expect(viewport.x + left * viewport.zoom).toBeCloseTo(32)
    expect(viewport.x + right * viewport.zoom).toBeGreaterThan(900)
  })

  it('centers an initially selected far-right person after initializing the default company view', () => {
    const roster = people().concat(Array.from({ length: 8 }, (_, index) =>
      person(`branch-${index}`, `Branch manager ${index}`, { department: `Branch ${index}` })))
    render(<Chart roster={roster} initialFocused="yuny" />)
    expect(adapters.viewport.setCenter).not.toHaveBeenCalled()
    initializeFlow()
    const selected = node('yuny')
    expect(selected.position.x).toBeGreaterThan(3000)
    expect(adapters.viewport.setViewport).toHaveBeenCalled()
    expect(adapters.viewport.setCenter).toHaveBeenLastCalledWith(
      selected.position.x + NODE_WIDTH / 2,
      selected.position.y + NODE_HEIGHT / 2,
      expect.objectContaining({ zoom: 1 }),
    )
    expect(adapters.viewport.setCenter.mock.invocationCallOrder.at(-1))
      .toBeGreaterThan(adapters.viewport.setViewport.mock.invocationCallOrder.at(-1)!)
  })

  it('starts every department and its teams side by side on one top-aligned row', () => {
    render(<Chart roster={people().concat(person('daniel', 'Daniel'), person('elise', 'Elise'))} />)
    const departments = ['Finance', 'HR', 'Revenue'].map(id => frame('department', id))
    for (let index = 1; index < departments.length; index++) {
      expect(departments[index].y).toBe(departments[0].y)
      expect(departments[index].x).toBeGreaterThan(departments[index - 1].x + departments[index - 1].width)
    }
    const teams = ['alice', 'cara', 'daniel', 'elise'].map(id => frame('team', `team:Finance:${id}`))
    for (let index = 1; index < teams.length; index++) {
      expect(teams[index].y).toBe(teams[0].y)
      expect(teams[index].x).toBeGreaterThan(teams[index - 1].x + teams[index - 1].width)
    }
  })

  it('ignores saved vertical layouts from v1 and stores the fresh horizontal arrangement in v2', () => {
    writeManualLayout(window.localStorage, 'company.spaces.v1', new Map(people().map((member, index) => [
      member.id, { x: 7000, y: 5000 + index * 500 },
    ])))
    render(<Chart />)
    const top = frame('department', 'Finance').y
    expect(frame('department', 'HR').y).toBe(top)
    expect(frame('department', 'Revenue').y).toBe(top)
    expect(node('alice').position.x).toBeLessThan(7000)
    expect(node('alice').position.y).toBeLessThan(5000)
    expect(window.localStorage.getItem(layoutKey('company.spaces.v2.horizontal'))).not.toBeNull()
    expect(readManualLayout(window.localStorage, 'company.spaces.v2.horizontal').get('alice'))
      .toEqual(node('alice').position)
  })

  it('Tidy restores the horizontal arrangement after departments and teams are dragged vertically', () => {
    render(<Chart />)
    const defaults = new Map(flow().nodes!.map(item => [item.id, { ...item.position }]))
    const edges = JSON.stringify(flow().edges)
    dragGroup(screen.getByRole('button', { name: /Finance: drag to move department/i }), 0, 200)
    dragGroup(screen.getByRole('button', { name: /Alice team: drag to move team/i }), 0, 100)
    expect(node('alice').position.y).toBeGreaterThan(defaults.get('alice')!.y)
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }))
    for (const [id, point] of defaults) expect(node(id).position).toEqual(point)
    expect(frame('department', 'Revenue').y).toBe(frame('department', 'Finance').y)
    expect(JSON.stringify(flow().edges)).toBe(edges)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(readManualLayout(window.localStorage, 'company.spaces.v2.horizontal').get('alice'))
      .toEqual(defaults.get('alice'))
  })

  it('measured card heights preserve a manually moved group while reserving room for its reports', () => {
    render(<Chart />)
    dragGroup(screen.getByRole('button', { name: /Finance: drag to move department/i }), 0, 200)
    const leader = { ...node('alice').position }
    const teamTop = frame('team', 'team:Finance:alice').y
    const childBefore = { ...node('ben').position }
    const measuredHeight = NODE_HEIGHT + 80
    act(() => flow().onNodesChange?.([{
      type: 'dimensions', id: 'alice', dimensions: { width: NODE_WIDTH, height: measuredHeight },
    }]))
    expect(node('alice').position).toEqual(leader)
    expect(frame('team', 'team:Finance:alice').y).toBe(teamTop)
    expect(node('ben').position.y).toBeGreaterThan(childBefore.y)
    expect(node('ben').position.y).toBeGreaterThan(leader.y + measuredHeight)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('finds a person outside the focused department and reveals their card', async () => {
    render(<Chart initialDepartment="Finance" />)
    initializeFlow()
    expect(screen.queryByTestId('node:yuny')).toBeNull()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Yuny' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(await screen.findByTestId('node:yuny')).toBeTruthy()
    await waitFor(() => expect(adapters.viewport.setCenter).toHaveBeenCalled())
    expect(node('yuny').data.selected).toBe(true)
  })

  it('encloses departments and independent reporting teams in separate frames', () => {
    render(<Chart />)
    expect(document.querySelectorAll('.space-department')).toHaveLength(3)
    expect(document.querySelectorAll('.space-team')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Alice team: drag to move team/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cara team: drag to move team/i })).toBeTruthy()
    expect(flow().edges?.find(edge => edge.source === 'alice' && edge.target === 'ben')).toBeTruthy()
  })

  it('keeps Revenue teams separate while preserving every derived director reporting line', () => {
    const roster = [
      person('director', 'Director', { department: 'Revenue', commissionDept: true,
        isDepartmentHead: true, canRecruit: true, title: 'Revenue Director', levelRank: null }),
      person('anthony', 'Anthony', { department: 'Revenue', commissionDept: true,
        canRecruit: true, leadIds: ['director'] }),
      person('chea', 'Chea Huan', { department: 'Revenue', commissionDept: true,
        canRecruit: true, leadIds: ['director'] }),
    ]
    render(<Chart roster={roster} />)
    expect(screen.getByRole('button', { name: /Anthony team: drag to move team/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Chea Huan team: drag to move team/i })).toBeTruthy()
    for (const target of ['anthony', 'chea']) {
      expect(flow().edges?.find(edge => edge.source === 'director' && edge.target === target)?.style?.strokeDasharray)
        .toBeTruthy()
    }
    expect(screen.getByTestId('node:director')).toBeTruthy()
  })

  it('moves a team as a rigid group without changing reporting lines', () => {
    render(<Chart />)
    const alice = { ...node('alice').position }, ben = { ...node('ben').position }
    const edges = JSON.stringify(flow().edges)
    const heading = screen.getByRole('button', { name: /Alice team: drag to move team/i })
    fireEvent.keyDown(heading, { key: 'ArrowLeft' })
    const afterAlice = node('alice').position, afterBen = node('ben').position
    expect(afterAlice.x).toBeLessThan(alice.x)
    expect({ x: afterBen.x - afterAlice.x, y: afterBen.y - afterAlice.y })
      .toEqual({ x: ben.x - alice.x, y: ben.y - alice.y })
    expect(JSON.stringify(flow().edges)).toBe(edges)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBeGreaterThan(0)
  })

  it('retains the arranged layout across department filters and a page remount', () => {
    const view = render(<Chart />)
    fireEvent.keyDown(screen.getByRole('button', { name: /Alice team: drag to move team/i }), { key: 'ArrowLeft' })
    const arranged = { ...node('alice').position }
    fireEvent.click(screen.getByTestId('node:alice'))
    expect(node('alice').data.selected).toBe(true)
    expect(node('alice').position).toEqual(arranged)
    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }))
    expect(screen.queryByTestId('node:alice')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Whole company' }))
    expect(node('alice').position).toEqual(arranged)
    view.unmount()
    render(<Chart />)
    expect(node('alice').position).toEqual(arranged)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'pointer cancellation'])('restores a group drag on %s without saving a reporting change', method => {
    render(<Chart />)
    const before = new Map(flow().nodes!.map(item => [item.id, { ...item.position }]))
    const heading = screen.getByRole('button', { name: /Finance: drag to move department/i })
    const pointer = { pointerId: 9, pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 }
    fireEvent.pointerDown(heading, pointer)
    fireEvent.pointerMove(heading, { ...pointer, clientX: 100, clientY: 200 })
    expect(node('alice').position).not.toEqual(before.get('alice'))
    if (method === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
    else fireEvent.pointerCancel(heading, { pointerId: 9 })
    for (const [id, point] of before) expect(node(id).position).toEqual(point)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })
})
