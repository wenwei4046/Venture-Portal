import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { workflowBookFromRow, type WfBook, type WfPerson } from '@/lib/marketing/workflows'

// 2026-11-13 — the Workflow Builder 2a (`docs/design_handoff_workflow_builder/` › Workflow Builder v2 #2a): saved as
// typed (only what changed, on the draft it was made on); the template picker (categories, rename, clone, delete with
// Undo, a published template staying); the flow row's right-click (and long-press) menu; the stage settings
// accordion; the lock; the overdue and end panels; the publish review. The database's side:
// tests/member-sql/validate-marketing-wf-builder-v2.mjs.

const actions = vi.hoisted(() => ({
  saveMktWorkflow: vi.fn(),
  publishMktWorkflow: vi.fn(),
  cloneMktWorkflow: vi.fn(),
  deleteMktWorkflow: vi.fn(),
  renameMktWorkflow: vi.fn(),
  addMktWfCategory: vi.fn(),
  editMktWfCategory: vi.fn(),
  deleteMktWfCategory: vi.fn(),
  addMktGroup: vi.fn(),
  addMktOption: vi.fn(),
  removeMktOption: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) } }) }))
vi.mock('./PreviewTab', () => ({ default: () => <div>The preview</div> }))

import WorkflowBuilder from './WorkflowBuilder'

const RACHEL = 'r0000000-0000-4000-8000-000000000001'
const DANIEL = 'r0000000-0000-4000-8000-000000000002'
const SITI = 'r0000000-0000-4000-8000-000000000003'
const AINA = 'r0000000-0000-4000-8000-000000000004'
const people: WfPerson[] = [
  { id: RACHEL, first: 'Rachel', title: 'MARKETING MANAGER', load: 2 },
  { id: DANIEL, first: 'Daniel', title: 'ASSISTANT MARKETING MANAGER', load: 1 },
  { id: SITI, first: 'Siti', title: 'GRAPHIC DESIGNER', load: 4 },
  { id: AINA, first: 'Aina', title: 'GRAPHIC DESIGNER', load: 2 },
]
const team = people.map(p => p.id)
const S = (sid: string, name: string, p: object = {}) =>
  ({ sid, name, dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '', ...p })
const REELS = {
  id: 'w1', categoryId: 'c1', action: 'Reels video', tname: 'Full production', emoji: '🎞️', promise: 10, locked: false, rev: 5, version: 2, changed: false, live: 12,
  draft: [
    S('sscript0', 'Script', { sla: 2, appr: [{ ids: [RACHEL], rule: 'any' }] }),
    S('sedit000', 'Edit', { sla: 3, who: { mode: 'prev', cands: [SITI, AINA] }, split: true }),
    S('sfinal00', 'Final', { appr: [{ ids: [RACHEL, DANIEL], rule: 'all' }, { ids: ['pic'], rule: 'any' }], back: 1 }),
  ],
  pubStages: [S('sscript0', 'Script', { sla: 2, appr: [{ ids: [RACHEL], rule: 'any' }] }), S('sfinal00', 'Final')], pubPromise: 10,
  canvas: { req: { pic: true }, sections: [] },
}
const QUICK = { ...REELS, id: 'w2', tname: 'Quick edit', version: 0, changed: true, live: 0, rev: 1, pubStages: null, draft: [S('squick00', 'Edit', { sla: 2 })] }
const BRAND = { ...QUICK, id: 'w3', categoryId: 'c2', action: 'Brand book', tname: 'Standard', emoji: '📘' }
const book = (): WfBook => workflowBookFromRow({
  categories: [{ id: 'c1', name: 'Reels video', emoji: '🎞️', sort: 1 }, { id: 'c2', name: 'Brand book', emoji: '📘', sort: 2 }],
  groups: [{ key: 'content', name: 'Content', hue: 295 }, { key: 'design', name: 'Design', hue: 350 }],
  workflows: [REELS, QUICK, BRAND],
})

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
  let rev = 5
  actions.saveMktWorkflow.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 'w9', rev: id ? ++rev : 1, book: null }))
  actions.deleteMktWorkflow.mockResolvedValue({ ok: true, book: null })
})
afterEach(() => vi.useRealTimers())

const builder = (first: string | null = null) => render(<WorkflowBuilder initial={book()} first={first} people={people} team={team} />)
const card = (name: RegExp) => screen.getByRole('button', { name })

describe('the Workflow Builder 2a', () => {
  it('draws the template: Draft vN, the total, the promise, the flow row with who and approval', () => {
    builder()
    expect(screen.getByText('Draft v3')).toBeTruthy()
    expect(screen.getByText('Reels video')).toBeTruthy()
    expect(screen.getByText('6').closest('span')?.textContent).toContain('6 working days')
    const final = card(/Stage 3 · Final/)
    expect(within(final).getByText('Rachel & Daniel → PIC')).toBeTruthy()
    expect(within(card(/Stage 2 · Edit/)).getByText('Siti / Aina')).toBeTruthy()
    expect(within(card(/Stage 2 · Edit/)).getByText('🔓 picked by Script')).toBeTruthy()
    expect(within(card(/Stage 1 · Script/)).getByText('MM assigns')).toBeTruthy()
    expect(screen.getByText('12 active tasks stay on v2')).toBeTruthy()
  })

  it('saves a change as it is made — only what changed, on the draft it was made on', async () => {
    builder()
    fireEvent.click(card(/Stage 2 · Edit/))
    fireEvent.click(screen.getByRole('button', { name: 'Working days: one more' }))
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktWorkflow.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['w1', 5, ['stages']])
    expect(patch.stages[1]).toMatchObject({ sid: 'sedit000', sla: 4 })
    await waitFor(() => expect(screen.getByText(/^Saved \d\d:\d\d$/)).toBeTruthy())
  })

  it('says when somebody saved since, and sends nothing more until it is reloaded', async () => {
    actions.saveMktWorkflow.mockResolvedValue({ ok: false, reason: 'Mei changed this template since you opened it — reload to see it.' })
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'Promise: one more' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not saved · Mei changed'))
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('the stage settings: an accordion; approvers on another level greyed; the Approval chain', () => {
    builder()
    fireEvent.click(within(card(/Stage 3 · Final/)).getByText('Approved by'))
    expect(screen.getByText('Level 1 approves')).toBeTruthy()
    expect(screen.getByText('Level 2 approves')).toBeTruthy()
    expect(screen.getByText('Approved → task done')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Level 2 approvers' }))
    const menu = screen.getByRole('listbox', { name: 'Level 2 approvers' })
    const rachel = within(menu).getByRole('option', { name: /Rachel/ })
    expect(rachel.getAttribute('aria-disabled')).toBe('true')
    expect(within(rachel).getByText('Already approves at another level')).toBeTruthy()
    fireEvent.click(within(menu).getByRole('option', { name: /Picked at assignment/ }))
    expect(within(card(/Stage 3 · Final/)).getByText('Rachel & Daniel → PIC or Assigned')).toBeTruthy()
    expect(screen.getAllByRole('radio', { name: 'Everyone' })[1].getAttribute('aria-checked')).toBe('false')
  })

  it('who does it: the shortlist with each one’s load; the handoff off on stage 1', () => {
    builder()
    fireEvent.click(within(card(/Stage 2 · Edit/)).getByText('Done by'))
    expect(screen.getByText('· 2 picked')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Siti\s*4 active/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(card(/Stage 1 · Script/)).getByText('Done by'))
    const handoff = screen.getByRole('radio', { name: /Handoff from the previous stage/ })
    expect(handoff.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Not available on the first stage')).toBeTruthy()
  })

  it('right-click a card: add a stage after (selected, in Basics), duplicate, delete with Undo', async () => {
    builder()
    fireEvent.contextMenu(card(/Stage 1 · Script/), { clientX: 40, clientY: 40 })
    const menu = screen.getByRole('menu', { name: 'Stage 1 · Script' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Add stage after/ }))
    expect(card(/Stage 2 · New stage/).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByDisplayValue('New stage')).toBeTruthy()
    fireEvent.contextMenu(card(/Stage 2 · New stage/), { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(screen.queryByRole('button', { name: /New stage/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(card(/Stage 2 · New stage/)).toBeTruthy()
  })

  it('a long press opens the same menu on touch', () => {
    vi.useFakeTimers()
    builder()
    const c = card(/Stage 1 · Script/)
    fireEvent.touchStart(c, { touches: [{ clientX: 30, clientY: 30 }] })
    act(() => { vi.advanceTimersByTime(520) })
    expect(screen.getByRole('menu', { name: 'Stage 1 · Script' })).toBeTruthy()
  })

  it('the lock: MM assigns every stage, the grey note, handoffs off', () => {
    builder()
    fireEvent.click(screen.getByRole('radio', { name: '🔒 MM assigns every stage' }))
    expect(screen.getByText(/Handoffs and subtasks are off on 1 stage/)).toBeTruthy()
    expect(within(card(/Stage 2 · Edit/)).getByText('MM assigns')).toBeTruthy()
  })

  it('the overdue chip and the Done card open their panels', () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Late 1d → doer \+ MM/ }))
    expect(screen.getByText('When a stage is late')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Task done settings' }))
    expect(screen.getByText('Stage 3 · Final is approved by Rachel & Daniel → PIC')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Keep open 3 days/ }))
    expect(screen.getByRole('radio', { name: /Keep open 3 days/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('the publish review: what changed against the version running now, then Publish', async () => {
    actions.publishMktWorkflow.mockResolvedValue({ ok: true, version: 3, live: 12 })
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'Promise: one more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish v3' }))
    const dialog = screen.getByRole('dialog', { name: 'Publish v3 · Reels video / Full production' })
    expect(within(dialog).getByText('Added stage 2 · Edit')).toBeTruthy()
    expect(within(dialog).getByText('Promise 10 → 11 working days')).toBeTruthy()
    expect(within(dialog).getByText(/12 active tasks stay on v2 and finish as they are/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish v3' }))
    await waitFor(() => expect(actions.publishMktWorkflow).toHaveBeenCalledWith('w1', 6))
    await waitFor(() => expect(screen.getByText(/Published Reels video · Full production v3/)).toBeTruthy())
  })

  it('the picker: categories and templates; a published template’s ✕ greyed; a draft deleted after Undo’s 6 s', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    const menu = screen.getByRole('menu', { name: 'Templates' })
    expect(within(menu).getByText('Brand book')).toBeTruthy()
    expect((within(menu).getByRole('button', { name: 'Delete Full production' }) as HTMLButtonElement).disabled).toBe(true)
    const del = within(menu).getByRole('button', { name: 'Delete Quick edit' })
    fireEvent.click(del)
    fireEvent.click(within(menu).getByRole('button', { name: 'Click again to delete Quick edit' }))
    await waitFor(() => expect(screen.getByText(/Deleted template “Quick edit”/)).toBeTruthy())
    expect(within(screen.getByRole('menu', { name: 'Templates' })).queryByText('Quick edit')).toBeNull()
    expect(actions.deleteMktWorkflow).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    expect(within(screen.getByRole('menu', { name: 'Templates' })).getByText('Quick edit')).toBeTruthy()
  })

  it('a draft’s delete reaches the database when the 6 s are over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Quick edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Click again to delete Quick edit' }))
    await waitFor(() => expect(screen.getByText(/Deleted template “Quick edit”/)).toBeTruthy())
    await act(async () => { vi.advanceTimersByTime(6100) })
    await waitFor(() => expect(actions.deleteMktWorkflow).toHaveBeenCalledWith('w2', 1))
  })

  it('+ New category: a duplicate is refused; a new one is made with a Standard template and opened', async () => {
    actions.addMktWfCategory.mockResolvedValue({ ok: true, id: 'w2', rev: 1, category: 'c2', book: null })
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ New category' }))
    const input = screen.getByRole('textbox', { name: 'New category' })
    fireEvent.change(input, { target: { value: 'brand BOOK' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('“brand BOOK” already exists')).toBeTruthy())
    expect(actions.addMktWfCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '+ New category' }))
    const again = screen.getByRole('textbox', { name: 'New category' })
    fireEvent.change(again, { target: { value: 'Events' } })
    fireEvent.keyDown(again, { key: 'Enter' })
    await waitFor(() => expect(actions.addMktWfCategory).toHaveBeenCalledWith('Events', null))
    await waitFor(() => expect(screen.getByText('Category “Events” added with a Standard template')).toBeTruthy())
  })

  it('double-click renames a template that is not open (Enter saves) — the open one through its draft', async () => {
    actions.renameMktWorkflow.mockResolvedValue({ ok: true, rev: 2 })
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    fireEvent.doubleClick(screen.getAllByText('Quick edit')[0])
    const input = screen.getByRole('textbox', { name: 'Template name' })
    fireEvent.change(input, { target: { value: 'Fast cut' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(actions.renameMktWorkflow).toHaveBeenCalledTimes(1))
    expect(actions.renameMktWorkflow).toHaveBeenCalledWith('w2', 'Fast cut')
  })

  it('a category’s right-click menu: Rename, Change icon, Add template, Delete… asked once', () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: /Reels video \/ Full production/ }))
    const menu = screen.getByRole('menu', { name: 'Templates' })
    fireEvent.contextMenu(within(menu).getByText('Brand book'), { clientX: 50, clientY: 50 })
    const ctx = screen.getByRole('menu', { name: 'Brand book' })
    expect(within(ctx).getAllByRole('menuitem').map(m => m.textContent)).toEqual(['✎Rename', '📘Change icon', '+Add template', '✕Delete…'])
    fireEvent.click(within(ctx).getByRole('menuitem', { name: /Delete…/ }))
    expect(within(screen.getByRole('menu', { name: 'Brand book' })).getByRole('menuitem', { name: /Click to confirm/ })).toBeTruthy()
  })

  it('the Preview tab draws the task page from the draft', () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: '▶ Preview task page' }))
    expect(screen.getByText('The preview')).toBeTruthy()
  })
})
