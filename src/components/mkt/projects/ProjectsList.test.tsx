import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { boardFromRow } from '@/lib/marketing/board'
import { projectRows } from '@/lib/marketing/projects'

// Projects as a Drive (2026-11-17 — docs/design_handoff_workflow_projects/ › 2): moving through the levels and the
// address, selecting and the details pane, the three ways to delete — each asked twice — the 6 seconds of Undo, and
// who may delete at all. The database's side: tests/member-sql/validate-marketing-project-delete.mjs.

const actions = vi.hoisted(() => ({ deleteMktProject: vi.fn(), restoreMktProject: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import ProjectsList from './ProjectsList'

const MEI = '00000000-0000-0000-0000-00000000000a'
const CAR = '10000000-0000-0000-0000-000000000001'
const HK = '10000000-0000-0000-0000-000000000004'
const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const BATCH = '30000000-0000-0000-0000-000000000001'

const board = boardFromRow({
  today: '2026-11-17',
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres', emoji: '🛋️' }, { id: HK, code: 'HK', name: 'Hookka' }],
  projects: [
    { id: id(1), trackId: 'MKT-CAR-2611-001', kind: 'product', sub: CAR, title: 'Year-End Package', status: 'active', updatedAt: '2026-11-16T01:00:00Z' },
    { id: id(2), trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: CAR, parent: id(1), title: 'Reels video 1/2', status: 'active', cur: 0, updatedAt: '2026-11-16T02:00:00Z' },
    { id: id(4), trackId: 'TSK-CAR-2611-002', kind: 'quick', sub: CAR, title: 'Meta Ads × 1', qType: 'ads', status: 'active', cur: 0, updatedAt: '2026-11-17T01:00:00Z' },
    { id: id(6), trackId: 'TSK-HK-2611-001', kind: 'quick', sub: HK, title: 'Rug video', qType: 'content', status: 'active', cur: 0, updatedAt: '2026-11-14T01:00:00Z' },
  ],
  stages: [
    { project: id(2), idx: 0, name: 'Edit', owner: MEI, status: 'accepted', dueOn: '2026-11-20' },
    { project: id(4), idx: 0, name: 'Run', owner: MEI, status: 'accepted', dueOn: '2026-11-20' },
    { project: id(6), idx: 0, name: 'Shoot', owner: MEI, status: 'accepted', dueOn: '2026-11-25' },
  ],
})
const rows = projectRows(board)
const draw = (more: Partial<{ sub: string | null; project: string | null; q: string; canDelete: boolean }> = {}) =>
  render(<ProjectsList rows={rows} subs={board.subs} sub={null} project={null} q="" canDelete {...more} />)
const card = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  actions.deleteMktProject.mockReset().mockResolvedValue({ ok: true, batch: BATCH, title: 'x' })
  actions.restoreMktProject.mockReset().mockResolvedValue({ ok: true })
  router.push.mockReset()
  window.history.replaceState(null, '', '/marketing/projects')
})
afterEach(() => vi.useRealTimers())

describe('Projects › moving through the levels', () => {
  it('the root lists the subsidiaries; one opens with a click, the path in the address', () => {
    draw()
    expect(screen.getByText('Subsidiaries')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Carres/ }))
    expect(window.location.search).toBe('?sub=CAR')
    expect(screen.getByText('Projects', { selector: 'div' })).toBeTruthy()
    expect(screen.getByText('Quick tasks')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Open · 2' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Search in Carres')).toBeTruthy()
  })

  it('a project folder: one click selects (the pane), a double click opens it — its tasks, its crumbs', () => {
    draw({ sub: 'CAR' })
    fireEvent.click(card(/Project Year-End Package/))
    const pane = screen.getByRole('complementary', { name: 'Details' })
    expect(within(pane).getByText('Open project')).toBeTruthy()
    fireEvent.doubleClick(card(/Project Year-End Package/))
    expect(window.location.search).toBe(`?sub=CAR&p=${id(1)}`)
    expect(screen.getByText('Reels video 1/2')).toBeTruthy()
    expect(screen.queryByText('Meta Ads × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Carres' }))
    expect(window.location.search).toBe('?sub=CAR')
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(window.location.search).toBe('')
  })

  it('opens where the address says; a project of another subsidiary is not followed', () => {
    draw({ sub: 'CAR', project: 'MKT-CAR-2611-001' })
    expect(screen.getByText('Year-End Package', { selector: '[aria-current]' })).toBeTruthy()
    cleanupAnd(() => draw({ sub: 'HK', project: id(1) }))
    expect(screen.getByText('Rug video')).toBeTruthy()
  })

  it('a search looks under the level, flat', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Find a project'), { target: { value: 'video' } })
    expect(screen.getByText('Results · 2')).toBeTruthy()
    expect(screen.getByText('Reels video 1/2')).toBeTruthy()
    expect(screen.getByText('Rug video')).toBeTruthy()
  })

  it('a file opens its task on a double click; the list view draws the same rows', () => {
    draw({ sub: 'CAR' })
    fireEvent.doubleClick(card(/Quick Task Meta Ads/))
    expect(router.push).toHaveBeenCalledWith(`/marketing/projects/${id(4)}`)
    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    expect(screen.getByRole('table', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByText('TSK-CAR-2611-002 · Quick Task')).toBeTruthy()
  })
})

describe('Projects › deleting, asked twice, with Undo', () => {
  it('the hover ✕: the first click arms it, leaving disarms, the second deletes', async () => {
    draw({ sub: 'CAR' })
    const c = card(/Quick Task Meta Ads/)
    fireEvent.click(within(c).getByRole('button', { name: 'Delete Meta Ads × 1' }))
    expect(within(c).getByText('Delete?')).toBeTruthy()
    fireEvent.mouseLeave(c)
    expect(within(c).queryByText('Delete?')).toBeNull()
    fireEvent.click(within(c).getByRole('button', { name: 'Delete Meta Ads × 1' }))
    expect(actions.deleteMktProject).not.toHaveBeenCalled()
    fireEvent.click(within(c).getByRole('button', { name: /click again/ }))
    expect(actions.deleteMktProject).toHaveBeenCalledWith(id(4))
    expect(screen.queryByText('Meta Ads × 1')).toBeNull()
    expect(await screen.findByText('Deleted “Meta Ads × 1”')).toBeTruthy()
  })

  it('the right-click menu: never selects, Delete… then Click to confirm; a project takes its tasks', async () => {
    draw({ sub: 'CAR' })
    const f = card(/Project Year-End Package/)
    const ev = fireEvent.contextMenu(f)
    expect(ev).toBe(false) // the browser's own menu is held back
    expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull()
    const m = screen.getByRole('menu', { name: 'MKT-CAR-2611-001 · Project' })
    fireEvent.click(within(m).getByRole('menuitem', { name: /Delete…/ }))
    expect(actions.deleteMktProject).not.toHaveBeenCalled()
    fireEvent.click(within(m).getByRole('menuitem', { name: /Click to confirm · deletes its tasks/ }))
    expect(actions.deleteMktProject).toHaveBeenCalledWith(id(1))
    expect(screen.queryByText('Year-End Package')).toBeNull()
    expect(await screen.findByText('Deleted “Year-End Package”')).toBeTruthy()
  })

  it('the pane’s Delete arms, then deletes; Undo within 6 seconds puts it back on the page and in the database', async () => {
    draw({ sub: 'CAR' })
    fireEvent.click(card(/Quick Task Meta Ads/))
    const pane = screen.getByRole('complementary', { name: 'Details' })
    expect(within(pane).getByText('You can undo for 6 seconds.')).toBeTruthy()
    fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(pane).getByRole('button', { name: 'Click again to delete' }))
    expect(screen.queryByText('Meta Ads × 1')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Meta Ads × 1')).toBeTruthy()
    await waitFor(() => expect(actions.restoreMktProject).toHaveBeenCalledWith(BATCH))
  })

  it('the Undo goes after 6 seconds', async () => {
    vi.useFakeTimers()
    draw({ sub: 'CAR' })
    fireEvent.click(card(/Quick Task Meta Ads/))
    const pane = screen.getByRole('complementary', { name: 'Details' })
    fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(pane).getByRole('button', { name: 'Click again to delete' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(6100) })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('a refusal puts the row back and says why', async () => {
    actions.deleteMktProject.mockResolvedValue({ ok: false, reason: 'Only Marketing\'s managers delete projects.' })
    draw({ sub: 'CAR' })
    fireEvent.contextMenu(card(/Quick Task Meta Ads/))
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete…/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Click to confirm/ }))
    expect(await screen.findByText('Only Marketing\'s managers delete projects.')).toBeTruthy()
    expect(screen.getByText('Meta Ads × 1')).toBeTruthy()
  })

  it('deleting the project one is inside goes back up to the subsidiary', async () => {
    draw({ sub: 'CAR', project: id(1) })
    fireEvent.click(screen.getByText('Reels video 1/2'))
    // Inside, the project itself is opened from the subsidiary: delete it there.
    fireEvent.click(screen.getByRole('button', { name: 'Carres' }))
    fireEvent.click(card(/Project Year-End Package/))
    const pane = screen.getByRole('complementary', { name: 'Details' })
    expect(within(pane).getByText('Deletes the project and every task inside it. You can undo for 6 seconds.')).toBeTruthy()
    fireEvent.click(within(pane).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(pane).getByRole('button', { name: 'Click again to delete' }))
    expect(window.location.search).toBe('?sub=CAR')
    expect(screen.queryByText('Year-End Package')).toBeNull()
  })

  it('subsidiary folders are never deleted', () => {
    draw()
    const c = screen.getByRole('button', { name: /Carres/ })
    expect(within(c).queryByRole('button', { name: /Delete/ })).toBeNull()
    fireEvent.contextMenu(c)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('without Marketing · Manage: no ✕, no Delete… and no Delete in the pane', () => {
    draw({ sub: 'CAR', canDelete: false })
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    fireEvent.contextMenu(card(/Quick Task Meta Ads/))
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Open task/ })).toBeTruthy()
    fireEvent.click(card(/Quick Task Meta Ads/))
    expect(within(screen.getByRole('complementary', { name: 'Details' })).queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

function cleanupAnd(fn: () => void) {
  document.body.innerHTML = ''
  fn()
}
