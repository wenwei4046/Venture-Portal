import type { ComponentType, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection, ReactFlowProps } from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import type { PersonNode } from './HierarchyPersonCard'
import type { OrgDepartment, OrgPerson } from './org-chart-types'
import HierarchySpaces from './HierarchySpaces'

type FlowProps = ReactFlowProps<PersonNode>
const adapters = vi.hoisted(() => ({
  flow: null as FlowProps | null,
  move: vi.fn(),
  router: { refresh: vi.fn() },
  viewport: {
    fitBounds: vi.fn(), setCenter: vi.fn(), getZoom: () => 0.5,
    zoomIn: vi.fn(), zoomOut: vi.fn(),
    getViewport: () => ({ x: 0, y: 0, zoom: 0.5 }), setViewport: vi.fn(),
    screenToFlowPosition: (point: { x: number; y: number }) => point,
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => adapters.router }))
vi.mock('../../../hierarchy-actions', () => ({ moveOnChart: adapters.move }))
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
        person('yuny', 'Yuny', { uplineStaffId: 'anthony', titleName: 'Team Assistant', levelRank: 3 }),
        person('chea', 'Chea Huan'),
        person('howard', 'Howard', { uplineStaffId: 'chea', titleName: 'Revenue Specialist', levelRank: 2, canRecruit: false }),
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
  ])('moves the whole department rigidly with $label after a member was freely arranged', ({ button, pointerType }) => {
    render(<HierarchySpaces departments={departments()} />)
    const originalParent = position('fa-scheme:anthony')
    const originalChild = position('fa-scheme:yuny')
    const originalEdges = JSON.stringify(flow().edges)
    dragMember('fa-scheme:yuny', 37, 53)
    expect(position('fa-scheme:anthony')).toEqual(originalParent)
    expect(position('fa-scheme:yuny')).toEqual({ x: originalChild.x + 37, y: originalChild.y + 53 })

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

describe('HierarchySpaces explicit upline edits', () => {
  it('sends raw staff IDs and the target membership scheme for a same-department connector', async () => {
    render(<HierarchySpaces departments={departments()} />)
    connect('fa-scheme:chea', 'fa-scheme:yuny')
    await waitFor(() => expect(adapters.move).toHaveBeenCalledExactlyOnceWith('fa-scheme', 'yuny', 'chea'))
    await waitFor(() => expect(adapters.router.refresh).toHaveBeenCalledOnce())
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

  it('keeps a quick pass over another card as a layout move without changing the reporting line', async () => {
    render(<HierarchySpaces departments={departments()} />)
    const pointer = dragOver('fa-scheme:yuny', 'fa-scheme:chea')
    const droppedPosition = position('fa-scheme:yuny')
    await waitForHover(449)
    await release('fa-scheme:yuny', pointer)
    await waitForHover(100)
    expect(adapters.move).not.toHaveBeenCalled()
    expect(adapters.router.refresh).not.toHaveBeenCalled()
    expect(node('fa-scheme:yuny').data.person.uplineStaffId).toBe('anthony')
    expect(position('fa-scheme:yuny')).toEqual(droppedPosition)
  })

  it('commits an armed drop to the correct membership and keeps its landing when server data refreshes', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: false })
    const data = departments()
    const view = render(<HierarchySpaces departments={data} />)
    const fairUpline = node('fa-scheme:chea').data.person.uplineStaffId
    const pointer = dragOver('ir-scheme:chea', 'ir-scheme:lawrence')
    const droppedPosition = position('ir-scheme:chea')
    await waitForHover()
    expect(adapters.move).not.toHaveBeenCalled()
    await release('ir-scheme:chea', pointer)
    expect(adapters.move).toHaveBeenCalledExactlyOnceWith('ir-scheme', 'chea', 'lawrence')
    expect(adapters.router.refresh).toHaveBeenCalledOnce()
    expect(node('ir-scheme:chea').data.person.uplineStaffId).toBe('lawrence')
    expect(node('fa-scheme:chea').data.person.uplineStaffId).toBe(fairUpline)
    // A real-motion transfer begins at the dropped location and settles
    // through intermediate positions; replacing server data must not snap it.
    expect(position('ir-scheme:chea')).toEqual(droppedPosition)
    await waitForHover(250)
    const halfway = position('ir-scheme:chea')
    expect(halfway).not.toEqual(droppedPosition)
    await waitForHover(300)
    expect(position('ir-scheme:chea')).not.toEqual(halfway)
    expect(rootsOverlap('ir-scheme:chea', 'ir-scheme:lawrence')).toBe(false)
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
