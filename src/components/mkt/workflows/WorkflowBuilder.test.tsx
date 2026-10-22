import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { workflowsFromRow, type WfTemplate } from '@/lib/marketing/workflows'

// 2026-10-23 — the Workflow Builder (`Workflow Builder.dc.html`, ③ of the handoff) for the manager who builds the
// templates: a change is saved as it is made — only what changed, on the draft it was made on, never over somebody
// else's save; the lock; what stops publishing; Publish; a new action; Clone; a table's preset rows. The database's
// side is tests/member-sql/validate-marketing-workflows.mjs.

const actions = vi.hoisted(() => ({
  saveMktWorkflow: vi.fn(),
  publishMktWorkflow: vi.fn(),
  cloneMktWorkflow: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import WorkflowBuilder from './WorkflowBuilder'

const RACHEL = 's-rachel'
const SITI = 's-siti'
const AINA = 's-aina'
const people = [
  { id: RACHEL, first: 'Rachel', hint: 'Manager · 2 active', team: 'manager' },
  { id: SITI, first: 'Siti', hint: 'Design · 4 active', team: 'design' },
  { id: AINA, first: 'Aina', hint: 'Design · 2 active', team: 'design' },
]
const approvers = people.filter(p => p.team === 'manager')
const team = people.map(p => p.id)

const REELS = {
  id: 'w1', action: 'Reels video', tname: 'Full production', emoji: '🎞️', note: 'Used by Ads and Social Media', promise: 10, locked: false,
  draft: [
    { name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ kind: 'person', staff: RACHEL }], split: false, back: null, picText: '', form: [] },
    { name: 'Edit', dept: 'content', who: { mode: 'prev', cands: [SITI, AINA] }, sla: 3, appr: [], split: true, back: null, picText: '', form: [
      { label: 'Shot list', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }], rows: [] },
    ] },
    { name: 'Final', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [{ kind: 'person', staff: RACHEL }, { kind: 'pic' }], split: false, back: 1, picText: '', form: [] },
  ],
  rev: 5, version: 2, changed: false, live: 12,
}
const BROKEN = {
  id: 'w2', action: 'Brand book', tname: 'Standard', emoji: '📘', note: null, promise: null, locked: false,
  draft: [{ name: 'Discovery', dept: 'brand', who: { mode: 'prev', cands: [SITI] }, sla: 3, appr: [{ kind: 'pic' }], split: false, back: null, picText: '', form: [] }],
  rev: 1, version: 0, changed: true, live: 0,
}
const list = (...rows: object[]): WfTemplate[] => workflowsFromRow({ workflows: rows })

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
  let rev = 5
  actions.saveMktWorkflow.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 'w9', rev: id ? ++rev : 1, workflows: null }))
})

const builder = (rows: object[] = [REELS, BROKEN], first: string | null = null) =>
  render(<WorkflowBuilder initial={list(...rows)} first={first} people={people} approvers={approvers} team={team} />)

describe('the Workflow Builder', () => {
  it('saves a change as it is made — only what changed, on the draft it was made on', async () => {
    builder()
    expect(screen.getByText('Draft v3')).toBeTruthy()
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Stage 2 settings')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One day more' }))
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktWorkflow.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['w1', 5, ['stages']])
    expect(patch.stages[1].sla).toBe(4)
    expect(await screen.findByText('Saved')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Template name' }), { target: { value: 'Full shoot' } })
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.saveMktWorkflow.mock.calls[1]).toEqual(['w1', 6, { tname: 'Full shoot' }])
  })

  it('a change undone before its save goes sends nothing and says Saved', async () => {
    // 2026-10-23: the save found nothing to send and left *Saving…* up for good, Publish lit (the ③c walk).
    builder()
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByRole('button', { name: 'One day more' }))
    expect(screen.getByText('Saving…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One day less' }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 3000 })
    expect(actions.saveMktWorkflow).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Publish v3' })).toHaveProperty('disabled', true)
  })

  it('never writes over somebody else’s save: it says so and offers a reload', async () => {
    actions.saveMktWorkflow.mockResolvedValue({ ok: false, reason: 'Sia Josiah changed this template since you opened it — reload to see it.' })
    builder()
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByRole('button', { name: 'One day more' }))
    expect(await screen.findByText(/Not saved · Sia Josiah changed this template/, undefined, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish v3' })).toHaveProperty('disabled', true)
  })

  it('publishes the draft as saved; those running stay on the version they started on', async () => {
    builder()
    expect(screen.getByRole('button', { name: 'Publish v3' })).toHaveProperty('disabled', true) // nothing new since v2
    expect(screen.getByText('12 active tasks stay on v2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One day more' }))
    actions.publishMktWorkflow.mockResolvedValue({ ok: true, version: 3, live: 12 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v3' }))
    })
    await waitFor(() => expect(actions.publishMktWorkflow).toHaveBeenCalledWith('w1', 6))
    expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(1) // saved first, then published
    expect(await screen.findByText('Published Reels video · Full production v3 · new tasks use v3, 12 active tasks stay on v2')).toBeTruthy()
    expect(screen.getByText('Draft v4')).toBeTruthy()
  })

  it('the lock: every stage the manager’s to assign, no subtasks — the stage keeps its 🔓 for unlocking', async () => {
    builder()
    const card = () => screen.getByText('Edit').closest('[role=button]') as HTMLElement
    expect(within(card()).getByText('🔓 Previous stage picks from Siti / Aina')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: /Lock whole workflow/ }))
    expect(screen.getByText(/Whole workflow locked/)).toBeTruthy()
    expect(within(card()).getByText('Pick at assignment')).toBeTruthy()
    expect(within(card()).getByText('✗')).toBeTruthy()
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledWith('w1', 5, { locked: true }), { timeout: 3000 })
    fireEvent.click(screen.getByRole('switch', { name: /Lock whole workflow/ }))
    expect(within(card()).getByText('🔓 Previous stage picks from Siti / Aina')).toBeTruthy()
  })

  it('what the database would refuse stops Publish, and is said at the foot', () => {
    builder([REELS, BROKEN], 'w2')
    expect(screen.getByText('⚠️ Stage 1 has no stage before it to pick')).toBeTruthy()
    const publish = screen.getByRole('button', { name: 'Publish v1' })
    expect(publish).toHaveProperty('disabled', true)
    expect(publish.getAttribute('title')).toBe('Stage 1 has no stage before it to pick')
  })

  it('a new action starts with a Standard template, open', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'New action' }))
    const name = screen.getByRole('textbox', { name: 'New action' })
    fireEvent.change(name, { target: { value: 'Design photo' } })
    const made = { id: 'w9', action: 'Design photo', tname: 'Standard', emoji: '✨', note: null, promise: null, locked: false,
      draft: [{ name: 'Design photo', dept: 'design', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ kind: 'pic' }], split: false, back: null, picText: '', form: [] }],
      rev: 1, version: 0, changed: true, live: 0 }
    actions.saveMktWorkflow.mockResolvedValue({ ok: true, id: 'w9', rev: 1, workflows: list(BROKEN, made, REELS) })
    await act(async () => {
      fireEvent.keyDown(name, { key: 'Enter' })
    })
    const [id, rev, patch] = actions.saveMktWorkflow.mock.calls[0]
    expect([id, rev, patch.action, patch.tname, patch.stages.length]).toEqual([null, null, 'Design photo', 'Standard', 1])
    expect(await screen.findByText('Action “Design photo” created with a Standard template')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveProperty('value', 'Standard')
    expect(router.replace).toHaveBeenCalledWith('/marketing/workflows?w=w9', { scroll: false })
  })

  it('Clone: a new template of the action, open to be renamed', async () => {
    builder()
    const copy = { ...REELS, id: 'w5', tname: 'Full production copy', rev: 1, version: 0, changed: true, live: 0 }
    actions.cloneMktWorkflow.mockResolvedValue({ ok: true, id: 'w5', tname: 'Full production copy', workflows: list(BROKEN, REELS, copy) })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Clone' })[0])
    })
    expect(actions.cloneMktWorkflow).toHaveBeenCalledWith('w1')
    expect(await screen.findByText('Cloned “Full production” · rename it, then publish')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveProperty('value', 'Full production copy')
  })

  it('a table keeps preset rows: a cell filled in is the team’s to read, a blank one theirs to fill in', async () => {
    builder()
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit table' }))
    const dialog = screen.getByRole('dialog', { name: 'Table Shot list' })
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Add row' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Row 1, Shot' }), { target: { value: 'Opening' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add column' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Row 1, Column 2' }), { target: { value: '' } })
    fireEvent.change(within(dialog).getAllByRole('textbox', { name: 'Column name' })[1], { target: { value: 'Due date' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalled(), { timeout: 3000 })
    const patch = actions.saveMktWorkflow.mock.calls.at(-1)?.[2]
    expect(patch.stages[1].form[0]).toEqual({ label: 'Shot list', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due date', type: 'Date' }], rows: [['Opening', '']] })
  })
})
