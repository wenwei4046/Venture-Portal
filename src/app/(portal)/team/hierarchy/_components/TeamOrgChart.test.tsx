import { useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection, Node, ReactFlowInstance, ReactFlowProps } from '@xyflow/react'
import { layoutKey, readManualLayout, writeManualLayout } from '@/lib/commission/chart-layout-store'
import { NODE_WIDTH } from '@/lib/org-layout'
import { COMPANY_CARD_HEIGHT, companyZoneId } from '@/lib/company-chart-structure'
import TeamOrgChart, { ALL_DEPARTMENTS, type ChartPerson } from './TeamOrgChart'

type PersonNode = Node<{ person: ChartPerson; invalidTarget: boolean; selected: boolean }>
type CanvasNode = Node<Record<string, unknown>>
type FlowProps = ReactFlowProps<CanvasNode>
const STORAGE_NAMESPACE = 'company.spaces.v4.levels'
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
      return <div>
        {props.nodes?.map(node => {
          const Card = props.nodeTypes![node.type!] as ComponentType<{ data: CanvasNode['data'] }>
          return <div key={node.id} data-testid={`node:${node.id}`}
          onClick={event => props.onNodeClick?.(event, node)}>
          <Card data={node.data} />
        </div>})}
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

function multipleRoles(): ChartPerson[] {
  const revenue = { department: 'Revenue', commissionDept: true, leadIds: ['peter'] }
  return [
    person('peter', 'Peter', { ...revenue, leadIds: [], isDepartmentHead: true, title: 'Revenue Director', levelRank: null, canRecruit: true }),
    person('rachael', 'Rachael', { ...revenue, staffId: 'rachael', title: 'Team Leader', canRecruit: true,
      subDepartment: 'Fair', schemeId: 'fair', membershipHref: '/revenue/fair/hierarchy' }),
    person('chea', 'Chea Huan', { ...revenue, staffId: 'chea', title: 'Revenue Specialist', levelRank: 2,
      reportsTo: 'rachael', subDepartment: 'Fair', schemeId: 'fair', membershipHref: '/revenue/fair/hierarchy' }),
    person('ir:rachael', 'Rachael', { ...revenue, staffId: 'rachael', title: 'Head of IR', levelRank: 6, canRecruit: true,
      subDepartment: 'IR', schemeId: 'ir', secondaryRole: true, membershipHref: '/revenue/ir/hierarchy' }),
    person('ir:chea', 'Chea Huan', { ...revenue, staffId: 'chea', title: 'Relationship Specialist', levelRank: 2,
      reportsTo: 'ir:rachael', subDepartment: 'IR', schemeId: 'ir', secondaryRole: true, membershipHref: '/revenue/ir/hierarchy' }),
  ]
}

function rankedPeople(): ChartPerson[] {
  return [
    person('finance-head', 'Finance Head', { levelRank: 6 }),
    person('finance-manager', 'Finance Manager', { levelRank: 4, reportsTo: 'finance-head' }),
    person('finance-peer', 'Finance Peer', { levelRank: 4, reportsTo: 'finance-manager' }),
    person('finance-junior', 'Finance Junior', { levelRank: 2, reportsTo: 'finance-peer' }),
    person('hr-manager', 'HR Manager', { department: 'HR', levelRank: 4 }),
    person('hr-junior', 'HR Junior', { department: 'HR', levelRank: 2, reportsTo: 'hr-manager' }),
    person('cross-manager', 'Cross Manager', { department: 'Marketing', levelRank: 3 }),
    person('higher-report', 'Higher Report', { department: 'IT', levelRank: 5, reportsTo: 'cross-manager' }),
  ]
}

function Chart({ roster = people(), initialDepartment = ALL_DEPARTMENTS, initialFocused = null, canEdit = true }: {
  roster?: ChartPerson[]; initialDepartment?: string; initialFocused?: string | null; canEdit?: boolean
}) {
  const [focused, setFocused] = useState<string | null>(initialFocused)
  const [department, setDepartment] = useState(initialDepartment)
  return <TeamOrgChart people={roster} commissionHref="/revenue/fair/hierarchy"
    focused={focused} onFocus={setFocused} focusDept={department} onFocusDept={setDepartment} canEdit={canEdit} />
}

function renderChart({ overview = false, ...props }: ComponentProps<typeof Chart> & { overview?: boolean } = {}) {
  const view = render(<Chart {...props} />)
  if (!overview) fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
  return view
}

function flow(): FlowProps {
  expect(adapters.flow).not.toBeNull()
  return adapters.flow!
}

function node(id: string): PersonNode {
  const result = flow().nodes?.find(candidate => candidate.id === id)
  expect(result, `node ${id}`).toBeDefined()
  return result as PersonNode
}

function connect(source: string, target: string) {
  const connection: Connection = { source, target, sourceHandle: null, targetHandle: null }
  act(() => flow().onConnect?.(connection))
}

function initializeFlow() {
  act(() => flow().onInit?.(adapters.viewport as unknown as ReactFlowInstance<CanvasNode>))
}

function frame(department: string, subDepartment: string | null = null) {
  const id = JSON.stringify([department, subDepartment])
  const element = [...document.querySelectorAll<SVGRectElement>('.space-department')]
    .find(candidate => candidate.getAttribute('data-department-id') === id)
  expect(element, `department frame ${id}`).toBeDefined()
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
  it('refuses a director reporting under a derived report of the second assigned head', () => {
    const director = { department: 'Revenue', commissionDept: true, isDepartmentHead: true,
      canRecruit: true, title: 'Revenue Director', levelRank: 8 }
    renderChart({ roster: [
      person('kris', 'Kris', director), person('peter', 'Peter', director),
      person('anthony', 'Anthony', { department: 'Revenue', commissionDept: true,
        canRecruit: true, leadIds: ['kris', 'peter'], levelRank: null }),
    ] })
    connect('anthony', 'peter')
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/own report/i)
  })

  it('connects a Revenue Director to a senior company manager without a commission-change notice', async () => {
    renderChart({ roster: [
      person('ceo', 'CEO', { department: 'Director', levelRank: 10 }),
      person('kris', 'Kris', { department: 'Revenue', commissionDept: true,
        isDepartmentHead: true, canRecruit: true, title: 'Revenue Director', levelRank: 8 }),
    ] })
    connect('ceo', 'kris')
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('kris', 'ceo'))
    const message = await screen.findByText('Kris now reports to CEO.')
    expect(message.textContent).not.toMatch(/override|sales|month/i)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('writes a valid connector and retains the previous reporting line for Undo', async () => {
    renderChart()
    connect('cara', 'ben')
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('ben', 'cara'))
    const undo = await screen.findByRole('button', { name: 'Undo' })
    await waitFor(() => expect(undo).toBeEnabled())
    fireEvent.click(undo)
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
    renderChart()
    connect(source, target)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(reason)
  })

  it('refuses a Revenue manager whose title cannot hold downlines', () => {
    const roster = people().concat(person('other', 'Other Specialist', {
      department: 'Revenue', commissionDept: true, canRecruit: false,
      title: 'Revenue Specialist', levelRank: 2,
    }))
    renderChart({ roster })
    connect('other', 'yuny')
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/cannot hold downlines/i)
  })

  it('still permits reporting across ordinary departments', async () => {
    renderChart()
    connect('hannah', 'ben')
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('ben', 'hannah'))
  })

  it('does not announce a successful move or offer Undo when the server refuses it', async () => {
    adapters.setReportsTo.mockResolvedValue({ ok: false, reason: 'You do not have permission to move staff.' })
    renderChart()
    connect('cara', 'ben')
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to move staff.')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
  })

  it('never writes a reporting change when a person is dropped on blank canvas', () => {
    renderChart()
    const before = node('ben')
    const reporting = JSON.stringify(flow().edges)
    act(() => flow().onNodeDragStart?.(new MouseEvent('mousedown'), before, [before]))
    const moved = { ...node('ben'), position: { x: before.position.x + 100, y: before.position.y + 200 } }
    act(() => flow().onNodeDragStop?.(new MouseEvent('mouseup'), moved, [moved]))
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(JSON.stringify(flow().edges)).toBe(reporting)
  })

  it('keeps staff on their assigned slots when renderer changes request deletion or a keyboard move', () => {
    renderChart()
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
  it('opens a wide company overview at a readable zoom with its level labels visible', () => {
    const roster = people().concat(Array.from({ length: 8 }, (_, index) =>
      person(`branch-${index}`, `Branch manager ${index}`, { department: `Branch ${index}` })))
    renderChart({ roster })
    const canvas = document.querySelector('.space-canvas')!
    Object.defineProperty(canvas, 'clientWidth', { value: 900, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 700, configurable: true })
    initializeFlow()
    expect(adapters.viewport.setViewport).toHaveBeenCalled()
    const viewport = adapters.viewport.setViewport.mock.calls.at(-1)![0] as { x: number; y: number; zoom: number }
    const departments = [...document.querySelectorAll<SVGRectElement>('.space-department')]
    const left = Math.min(...departments.map(element => Number(element.getAttribute('x'))))
    const right = Math.max(...departments.map(element => Number(element.getAttribute('x')) + Number(element.getAttribute('width'))))
    const levelLabel = document.querySelector<HTMLElement>('.company-level-label')!
    const labelLeft = Number.parseFloat(levelLabel.style.left)
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.45)
    expect(viewport.zoom).toBeLessThanOrEqual(0.85)
    expect(labelLeft).toBeLessThan(left)
    expect(viewport.x + labelLeft * viewport.zoom).toBeCloseTo(32)
    expect(viewport.x + left * viewport.zoom).toBeGreaterThan(32)
    expect(viewport.x + right * viewport.zoom).toBeGreaterThan(900)
  })

  it('expands and centers an initially selected person after initializing the default company view', () => {
    const roster = people().concat(Array.from({ length: 8 }, (_, index) =>
      person(`branch-${index}`, `Branch manager ${index}`, { department: `Branch ${index}` })))
    renderChart({ roster, initialFocused: 'yuny', overview: true })
    expect(adapters.viewport.setCenter).not.toHaveBeenCalled()
    initializeFlow()
    const selected = node('yuny')
    expect(selected.data.selected).toBe(true)
    expect(screen.getByTestId('node:anthony')).toBeTruthy()
    expect(screen.queryByTestId(`node:summary:${companyZoneId(selected.data.person)}`)).toBeNull()
    expect(adapters.viewport.setViewport).toHaveBeenCalled()
    expect(adapters.viewport.setCenter).toHaveBeenLastCalledWith(
      selected.position.x + NODE_WIDTH / 2,
      selected.position.y + COMPANY_CARD_HEIGHT / 2,
      expect.objectContaining({ zoom: 1 }),
    )
    expect(adapters.viewport.setCenter.mock.invocationCallOrder.at(-1))
      .toBeGreaterThan(adapters.viewport.setViewport.mock.invocationCallOrder.at(-1)!)
  })

  it('places real directors above department zones and reports below their managers', () => {
    const roster = people().map(member => member.department === 'Revenue' ? { ...member, leadIds: ['director'] } : member)
    roster.push(person('director', 'Director', { department: 'Revenue', isDepartmentHead: true, levelRank: null }))
    renderChart({ roster })
    expect(node('director').position.y + COMPANY_CARD_HEIGHT).toBeLessThan(frame('Revenue').y)
    expect(node('ben').position.y).toBeGreaterThan(node('alice').position.y + COMPANY_CARD_HEIGHT)
    expect(node('yuny').position.y).toBeGreaterThan(node('anthony').position.y + COMPANY_CARD_HEIGHT)
    expect(document.querySelectorAll('.space-team')).toHaveLength(0)
  })

  it('ignores legacy layouts and stores the new hierarchy with a structural fingerprint', () => {
    writeManualLayout(window.localStorage, 'company.spaces.v1', new Map(people().map((member, index) => [
      member.id, { x: 7000, y: 5000 + index * 500 },
    ])))
    renderChart()
    expect(node('alice').position.x).toBeLessThan(7000)
    expect(node('alice').position.y).toBeLessThan(5000)
    expect(window.localStorage.getItem(`${layoutKey(STORAGE_NAMESPACE)}.structure`)).not.toBeNull()
    expect(readManualLayout(window.localStorage, STORAGE_NAMESPACE).get('alice'))
      .toEqual(node('alice').position)
  })

  it('Tidy restores the arrangement while group drags leave level heights locked', () => {
    renderChart()
    const defaults = new Map(flow().nodes!.map(item => [item.id, { ...item.position }]))
    const edges = JSON.stringify(flow().edges)
    dragGroup(screen.getByRole('button', { name: /Finance: drag to move department/i }), -200, 200)
    dragGroup(screen.getByRole('button', { name: /Alice team: drag to move team/i }), -100, 100)
    expect(node('alice').position.x).not.toBe(defaults.get('alice')!.x)
    for (const [id, point] of defaults) expect(node(id).position.y).toBe(point.y)
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }))
    for (const [id, point] of defaults) expect(node(id).position).toEqual(point)
    expect(JSON.stringify(flow().edges)).toBe(edges)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(readManualLayout(window.localStorage, STORAGE_NAMESPACE).get('alice'))
      .toEqual(defaults.get('alice'))
  })

  it('measured card heights preserve a manually moved group while reserving room for its reports', () => {
    renderChart()
    dragGroup(screen.getByRole('button', { name: /Finance: drag to move department/i }), -200, 200)
    const leader = { ...node('alice').position }
    const teamHeading = screen.getByRole('button', { name: /Alice team: drag to move team/i })
    const teamTop = teamHeading.style.top
    const childBefore = { ...node('ben').position }
    const measuredHeight = COMPANY_CARD_HEIGHT + 80
    act(() => flow().onNodesChange?.([{
      type: 'dimensions', id: 'alice', dimensions: { width: NODE_WIDTH, height: measuredHeight },
    }]))
    expect(node('alice').position).toEqual(leader)
    expect(teamHeading.style.top).toBe(teamTop)
    expect(node('ben').position.y).toBeGreaterThan(childBefore.y)
    expect(node('ben').position.y).toBeGreaterThan(leader.y + measuredHeight)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('finds a person outside the focused department and reveals their card', async () => {
    renderChart({ initialDepartment: 'Finance' })
    initializeFlow()
    expect(screen.queryByTestId('node:yuny')).toBeNull()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Yuny' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(await screen.findByTestId('node:yuny')).toBeTruthy()
    await waitFor(() => expect(adapters.viewport.setCenter).toHaveBeenCalled())
    expect(node('yuny').data.selected).toBe(true)
  })

  it('encloses departments in zones and gives independent reporting teams movable headings', () => {
    renderChart()
    expect(document.querySelectorAll('.space-department')).toHaveLength(3)
    expect(document.querySelectorAll('.space-team')).toHaveLength(0)
    expect(document.querySelectorAll('.company-team-heading')).toHaveLength(4)
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
    renderChart({ roster })
    expect(screen.getByRole('button', { name: /Anthony team: drag to move team/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Chea Huan team: drag to move team/i })).toBeTruthy()
    for (const target of ['anthony', 'chea']) {
      expect(flow().edges?.find(edge => edge.source === 'director' && edge.target === target)?.style?.strokeDasharray)
        .toBeTruthy()
    }
    expect(screen.getByTestId('node:director')).toBeTruthy()
  })

  it('moves a team as a rigid group without changing reporting lines', () => {
    renderChart()
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

  it('retains the arranged layout across department filters and selected-card changes', () => {
    renderChart()
    fireEvent.keyDown(screen.getByRole('button', { name: /Alice team: drag to move team/i }), { key: 'ArrowLeft' })
    const arranged = { ...node('alice').position }
    fireEvent.click(screen.getByTestId('node:alice'))
    expect(node('alice').data.selected).toBe(true)
    expect(node('alice').position).toEqual(arranged)
    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }))
    expect(screen.queryByTestId('node:alice')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finance' }))
    expect(node('alice').position).toEqual(arranged)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('restores an overview arrangement on remount when its structural fingerprint matches', () => {
    const view = renderChart({ overview: true })
    const id = `summary:${JSON.stringify(['Finance', null])}`
    fireEvent.keyDown(screen.getByRole('button', { name: /Finance: drag to move department/i }), { key: 'ArrowLeft' })
    const arranged = { ...flow().nodes!.find(item => item.id === id)!.position }
    view.unmount()
    renderChart({ overview: true })
    expect(flow().nodes!.find(item => item.id === id)!.position).toEqual(arranged)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('ignores saved positions when the structural fingerprint belongs to a different expansion state', () => {
    const view = renderChart({ overview: true })
    const summary = flow().nodes!.find(item => item.type === 'summary')!
    writeManualLayout(window.localStorage, STORAGE_NAMESPACE, new Map([[summary.id, { x: 9999, y: 9999 }]]))
    window.localStorage.setItem(`${layoutKey(STORAGE_NAMESPACE)}.structure`, 'another structure')
    view.unmount()
    renderChart({ overview: true })
    expect(flow().nodes!.find(item => item.id === summary.id)!.position).not.toEqual({ x: 9999, y: 9999 })
  })

  it.each(['Escape', 'pointer cancellation'])('restores a group drag on %s without saving a reporting change', method => {
    renderChart()
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

describe('company hierarchy overview and independent roles', () => {
  it('centers a selected team leader on the new position after expanding their hidden reports', () => {
    const roster = [person('leader', 'Leader'), ...Array.from({ length: 4 }, (_, index) =>
      person(`report-${index}`, `Report ${index}`, { reportsTo: 'leader', levelRank: 2 }))]
    renderChart({ roster, overview: true })
    fireEvent.click(screen.getByRole('button', { name: 'Explore Finance' }))
    const collapsed = { ...node('leader').position }
    expect(screen.queryByTestId('node:report-0')).toBeNull()
    initializeFlow()
    fireEvent.click(screen.getByTestId('node:leader'))
    const expanded = node('leader').position
    expect(screen.getByTestId('node:report-3')).toBeTruthy()
    expect(expanded.x).not.toBe(collapsed.x)
    expect(adapters.viewport.setCenter).toHaveBeenLastCalledWith(
      expanded.x + NODE_WIDTH / 2,
      expanded.y + COMPANY_CARD_HEIGHT / 2,
      expect.objectContaining({ zoom: 1 }),
    )
  })

  it('starts with real directors and noneditable summaries, then expands a department and its actual team', () => {
    renderChart({ roster: multipleRoles(), overview: true })
    expect(screen.getByTestId('node:peter')).toBeTruthy()
    expect(screen.queryByTestId('node:rachael')).toBeNull()
    const summaries = flow().nodes!.filter(item => item.type === 'summary')
    expect(summaries).toHaveLength(2)
    for (const summary of summaries) {
      expect(summary).toMatchObject({ draggable: false, connectable: false, deletable: false, selectable: false })
      expect(summary.data).toMatchObject({ people: 2, roles: 2, teams: 1 })
      expect(flow().edges?.find(edge => edge.source === 'peter' && edge.target === summary.id)).toBeTruthy()
    }
    connect(summaries[0].id, 'rachael')
    connect('peter', summaries[0].id)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Explore Revenue · Fair' }))
    expect(screen.getByTestId('node:rachael')).toBeTruthy()
    expect(screen.queryByTestId('node:chea')).toBeNull()
    fireEvent.click(within(screen.getByTestId('node:rachael')).getByRole('button', { name: /Expand 1 member/ }))
    expect(screen.getByTestId('node:chea')).toBeTruthy()
    expect(flow().edges?.find(edge => edge.source === 'rachael' && edge.target === 'chea')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Whole company' }))
    expect(screen.queryByTestId('node:rachael')).toBeNull()
    expect(screen.getByTestId('node:peter')).toBeTruthy()
    expect(flow().nodes!.filter(item => item.type === 'summary')).toHaveLength(2)
  })

  it('shows each role with its own title and manager while counting actual people once', () => {
    renderChart({ roster: multipleRoles() })
    expect(document.querySelector('.space-overview p')).toHaveTextContent('3 people · 5 roles · 1 departments')
    expect(within(screen.getByTestId('node:rachael')).getByText('Team Leader')).toBeTruthy()
    expect(within(screen.getByTestId('node:ir:rachael')).getByText('Head of IR')).toBeTruthy()
    expect(node('rachael').data.person.staffId).toBe(node('ir:rachael').data.person.staffId)
    expect(flow().edges?.find(edge => edge.source === 'rachael' && edge.target === 'chea')).toBeTruthy()
    expect(flow().edges?.find(edge => edge.source === 'ir:rachael' && edge.target === 'ir:chea')).toBeTruthy()
    expect(flow().edges?.find(edge => edge.source === 'rachael' && edge.target === 'ir:chea')).toBeUndefined()
    expect(frame('Revenue', 'Fair').width).toBeGreaterThan(0)
    expect(frame('Revenue', 'IR').width).toBeGreaterThan(0)
  })

  it('searches across collapsed roles and switches to the selected role without losing its identity', () => {
    renderChart({ roster: multipleRoles(), overview: true })
    initializeFlow()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Rachael' } })
    expect(screen.getByRole('button', { name: 'Rachael Team Leader · Fair' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rachael Head of IR · IR' }))
    expect(node('ir:rachael').data.selected).toBe(true)
    const choices = screen.getByLabelText('Roles held by Rachael')
    expect(within(choices).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(choices).getByRole('button', { name: 'Fair · Team Leader' }))
    expect(node('rachael').data.selected).toBe(true)
    expect(node('ir:rachael').data.selected).toBe(false)
    expect(adapters.viewport.setCenter).toHaveBeenLastCalledWith(
      node('rachael').position.x + NODE_WIDTH / 2,
      node('rachael').position.y + COMPANY_CARD_HEIGHT / 2,
      expect.objectContaining({ zoom: 1 }),
    )
  })

  it('lists every matching role instead of limiting a person to the first eight results', () => {
    const roster = multipleRoles().filter(role => role.id === 'peter' || role.id === 'rachael')
    roster.push(...Array.from({ length: 9 }, (_, index) => person(`scheme-${index}:rachael`, 'Rachael', {
      ...roster[1], id: `scheme-${index}:rachael`, title: `Role ${index}`, subDepartment: `Branch ${index}`,
      schemeId: `scheme-${index}`, secondaryRole: true,
    })))
    renderChart({ roster, overview: true })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Rachael' } })
    expect(screen.getAllByRole('button', { name: /^Rachael / })).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Rachael Role 8 · Branch 8' }))
    expect(within(screen.getByLabelText('Roles held by Rachael')).getAllByRole('button')).toHaveLength(10)
  })

  it.each([
    { source: 'ir:rachael', target: 'chea' },
    { source: 'rachael', target: 'ir:chea' },
  ])('refuses a connector involving additional role $source → $target', ({ source, target }) => {
    renderChart({ roster: multipleRoles() })
    connect(source, target)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Edit this role in its Revenue sub-department')
  })

  it.each([
    { mover: 'ir:chea', target: 'rachael' },
    { mover: 'chea', target: 'ir:rachael' },
  ])('prevents drag transfers involving additional role $mover → $target', ({ mover, target }) => {
    renderChart({ roster: multipleRoles() })
    expect(node('ir:chea')).toMatchObject({ draggable: false, connectable: false })
    const origin = { ...node(mover).position }
    adapters.viewport.getIntersectingNodes.mockReturnValue([node(target)])
    act(() => flow().onNodeDragStart?.(new MouseEvent('mousedown'), node(mover), [node(mover)]))
    act(() => flow().onNodeDragStop?.(new MouseEvent('mouseup'), node(mover), [node(mover)]))
    expect(node(mover).position).toEqual(origin)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  // PR4b (2026-10-10): Team · View without the Salary tick reads the chart
  // through the directory, and without Team · Edit nothing on it moves.
  it('is read only without Team · Edit — no drag, no line drawn, no Detach', () => {
    renderChart({ roster: multipleRoles(), canEdit: false })
    expect(flow().nodesDraggable).toBe(false)
    expect(flow().nodesConnectable).toBe(false)
    fireEvent.click(screen.getByTestId('node:chea'))
    expect(screen.queryByRole('button', { name: /Detach/ })).toBeNull()
    // No usage hints under the chart (2026-10-12: the wording made the view messy).
    expect(screen.queryByText(/Click a card to select it/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/can be changed by dragging/)
  })

  it('offers the exact Revenue edit link instead of Detach for an additional role', () => {
    renderChart({ roster: multipleRoles() })
    fireEvent.click(screen.getByTestId('node:ir:chea'))
    expect(screen.queryByRole('button', { name: /Detach Chea Huan/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Edit Chea Huan’s IR role on Revenue/ })).toHaveAttribute('href', '/revenue/ir/hierarchy')
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('applies company ladder warnings only to the primary roster line', () => {
    const roster = multipleRoles().map(role => role.id === 'chea' ? { ...role, levelRank: 5 }
      : role.id === 'ir:chea' ? { ...role, levelRank: 8 } : role)
    renderChart({ roster })
    expect(document.querySelector('.space-overview p')).toHaveTextContent('1 line breaks the ladder')
    expect(flow().edges?.find(edge => edge.target === 'chea')?.style?.stroke).toBe('rgb(var(--danger))')
    expect(flow().edges?.find(edge => edge.target === 'ir:chea')?.style?.stroke).not.toBe('rgb(var(--danger))')
  })

  it('automatically expands the department and team for a focused additional role', () => {
    renderChart({ roster: multipleRoles(), overview: true, initialFocused: 'ir:chea' })
    initializeFlow()
    expect(node('ir:chea').data.selected).toBe(true)
    expect(screen.getByTestId('node:ir:rachael')).toBeTruthy()
    expect(screen.queryByTestId('node:chea')).toBeNull()
    expect(adapters.viewport.setCenter).toHaveBeenLastCalledWith(
      node('ir:chea').position.x + NODE_WIDTH / 2,
      node('ir:chea').position.y + COMPANY_CARD_HEIGHT / 2,
      expect.objectContaining({ zoom: 1 }),
    )
  })
})

describe('company-wide level alignment', () => {
  it('aligns matching levels across departments and reporting depths, including cross-department management', () => {
    renderChart({ roster: rankedPeople() })
    expect(node('finance-manager').position.y).toBe(node('finance-peer').position.y)
    expect(node('finance-peer').position.y).toBe(node('hr-manager').position.y)
    expect(node('finance-junior').position.y).toBe(node('hr-junior').position.y)
    expect(node('finance-head').position.y).toBeLessThan(node('higher-report').position.y)
    expect(node('higher-report').position.y).toBeLessThan(node('finance-manager').position.y)
    expect(node('finance-manager').position.y).toBeLessThan(node('cross-manager').position.y)
    expect(node('cross-manager').position.y).toBeLessThan(node('finance-junior').position.y)
    const upward = flow().edges!.find(edge => edge.target === 'higher-report')!
    expect(upward).toMatchObject({
      source: 'cross-manager', target: 'higher-report', sourceHandle: 'source-top', targetHandle: 'target-bottom',
      markerEnd: { type: 'arrowclosed' },
    })
    expect(upward.style?.stroke).toBe('rgb(var(--danger))')
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('uses the level of each role rather than merging the heights of one staff identity', () => {
    renderChart({ roster: multipleRoles() })
    expect(node('ir:rachael').position.y).toBeLessThan(node('rachael').position.y)
    expect(node('chea').position.y).toBe(node('ir:chea').position.y)
    expect(node('rachael').position.y).toBeLessThan(node('chea').position.y)
  })

  it('scopes level guides to visible roles while retaining their global heights', () => {
    const roster = multipleRoles().concat(person('finance-manager', 'Finance Manager'))
    renderChart({ roster })
    const guideKeys = () => [...document.querySelectorAll<HTMLElement>('.company-level-label')]
      .map(label => label.dataset.levelRow)
    expect(guideKeys()).toContain('department-heads')
    expect(guideKeys()).toContain('level:6')
    const financeY = node('finance-manager').position.y
    fireEvent.click(screen.getByRole('button', { name: 'Finance' }))
    expect(screen.queryByTestId('node:peter')).toBeNull()
    expect(guideKeys()).toEqual(['level:4'])
    expect(node('finance-manager').position.y).toBe(financeY)
    const guide = document.querySelector<SVGLineElement>('.company-level-guide')!
    expect(Number(guide.getAttribute('y1'))).toBe(financeY)
    expect(Number(guide.getAttribute('y2'))).toBe(financeY)
  })

  it('keeps same-level managers and reports apart and uses facing side ports in both directions', () => {
    const roster = [
      person('manager', 'Manager', { levelRank: 4 }),
      person('report', 'Report', { department: 'HR', levelRank: 4, reportsTo: 'manager' }),
    ]
    renderChart({ roster })
    const assertSidePorts = () => {
      const source = node('manager').position, target = node('report').position
      expect(source.y).toBe(target.y)
      expect(Math.abs(source.x - target.x)).toBeGreaterThanOrEqual(NODE_WIDTH)
      expect(flow().edges!.find(edge => edge.target === 'report')).toMatchObject({
        source: 'manager', target: 'report', markerEnd: { type: 'arrowclosed' },
        sourceHandle: source.x < target.x ? 'source-right' : 'source-left',
        targetHandle: source.x < target.x ? 'target-left' : 'target-right',
      })
    }
    assertSidePorts()
    const heading = screen.getByRole('button', { name: /HR: drag to move department/i })
    for (const side of [-1, 1]) {
      const targetX = node('manager').position.x + side * NODE_WIDTH * 3
      dragGroup(heading, (targetX - node('report').position.x) * 0.5, 200)
      expect(Math.sign(node('report').position.x - node('manager').position.x)).toBe(side)
      assertSidePorts()
    }
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('preserves level heights through collapse, expansion, filters, Tidy and reload', () => {
    const roster = rankedPeople()
    const view = renderChart({ roster })
    const heights = new Map(flow().nodes!.map(item => [item.id, item.position.y]))
    fireEvent.click(within(screen.getByTestId('node:finance-head')).getByRole('button', { name: /Collapse 3 members/ }))
    expect(screen.queryByTestId('node:finance-manager')).toBeNull()
    expect(node('hr-manager').position.y).toBe(heights.get('hr-manager'))
    fireEvent.click(within(screen.getByTestId('node:finance-head')).getByRole('button', { name: /Expand 3 members/ }))
    fireEvent.click(screen.getByRole('button', { name: 'HR' }))
    expect(node('hr-manager').position.y).toBe(heights.get('hr-manager'))
    expect(node('hr-junior').position.y).toBe(heights.get('hr-junior'))
    fireEvent.click(screen.getByRole('button', { name: 'Whole company' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }))
    for (const [id, y] of heights) expect(node(id).position.y).toBe(y)
    view.unmount()
    renderChart({ roster })
    for (const [id, y] of heights) expect(node(id).position.y).toBe(y)
  })

  it('locks vertical group dragging and arrow keys while allowing horizontal arrangement', () => {
    renderChart({ roster: rankedPeople() })
    const heading = screen.getByRole('button', { name: /Finance: drag to move department/i })
    const before = new Map(flow().nodes!.map(item => [item.id, { ...item.position }]))
    dragGroup(heading, 0, 400)
    fireEvent.keyDown(heading, { key: 'ArrowDown' })
    fireEvent.keyDown(heading, { key: 'ArrowUp', shiftKey: true })
    for (const [id, point] of before) expect(node(id).position).toEqual(point)
    dragGroup(heading, -100, 400)
    expect(node('finance-head').position.x).not.toBe(before.get('finance-head')!.x)
    for (const [id, point] of before) expect(node(id).position.y).toBe(point.y)
    expect(adapters.setReportsTo).not.toHaveBeenCalled()
  })

  it('retains the tallest measured card in a level after that card is hidden', () => {
    renderChart({ roster: rankedPeople() })
    const originalJuniorY = node('hr-junior').position.y
    act(() => flow().onNodesChange?.([{
      type: 'dimensions', id: 'finance-manager', dimensions: { width: NODE_WIDTH, height: COMPANY_CARD_HEIGHT + 200 },
    }]))
    const spaciousJuniorY = node('hr-junior').position.y
    expect(spaciousJuniorY).toBeGreaterThan(originalJuniorY)
    expect(node('finance-junior').position.y).toBe(spaciousJuniorY)
    fireEvent.click(within(screen.getByTestId('node:finance-head')).getByRole('button', { name: /Collapse 3 members/ }))
    expect(screen.queryByTestId('node:finance-manager')).toBeNull()
    expect(node('hr-junior').position.y).toBe(spaciousJuniorY)
    fireEvent.click(screen.getByRole('button', { name: 'HR' }))
    expect(node('hr-junior').position.y).toBe(spaciousJuniorY)
    fireEvent.click(screen.getByRole('button', { name: 'Whole company' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(node('finance-junior').position.y).toBe(spaciousJuniorY)
  })

  it('migrates saved X positions from the matching legacy structure while replacing old free-form Y', () => {
    const roster = multipleRoles()
    const view = renderChart({ roster, overview: true })
    const originalNodes = new Map(flow().nodes!.map(item => [item.id, { ...item.position }]))
    const currentStructure = JSON.parse(window.localStorage.getItem(`${layoutKey(STORAGE_NAMESPACE)}.structure`)!) as {
      members: unknown[]; departments: unknown[]; leaders: unknown[]
    }
    const legacyNamespace = 'company.spaces.v3.structure'
    window.localStorage.setItem(`${layoutKey(legacyNamespace)}.structure`, JSON.stringify({
      members: currentStructure.members, departments: currentStructure.departments, leaders: currentStructure.leaders,
    }))
    const oldPositions = readManualLayout(window.localStorage, STORAGE_NAMESPACE)
    writeManualLayout(window.localStorage, legacyNamespace, new Map([...oldPositions].map(([id, point]) => [
      id, { x: point.x + 600, y: point.y + 9000 },
    ])))
    window.localStorage.removeItem(layoutKey(STORAGE_NAMESPACE))
    window.localStorage.removeItem(`${layoutKey(STORAGE_NAMESPACE)}.structure`)
    view.unmount()
    renderChart({ roster, overview: true })
    for (const [id, point] of originalNodes) {
      const actual = flow().nodes!.find(item => item.id === id)!.position
      expect(actual.x).toBe(Math.round(point.x + 600))
      expect(actual.y).toBe(point.y)
    }
  })
})
