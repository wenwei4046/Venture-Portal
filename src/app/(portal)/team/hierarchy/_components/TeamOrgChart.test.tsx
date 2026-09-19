import { useState, type ComponentType, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection, Node, ReactFlowProps } from '@xyflow/react'
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

function Chart({ roster = people(), initialDepartment = ALL_DEPARTMENTS }: {
  roster?: ChartPerson[]; initialDepartment?: string
}) {
  const [focused, setFocused] = useState<string | null>(null)
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
  it('finds a person outside the focused department and reveals their card', async () => {
    render(<Chart initialDepartment="Finance" />)
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
