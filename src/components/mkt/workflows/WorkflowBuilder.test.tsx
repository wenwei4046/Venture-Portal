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
  deleteMktWorkflow: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import WorkflowBuilder from './WorkflowBuilder'

const RACHEL = 's-rachel'
const SITI = 's-siti'
const AINA = 's-aina'
const people = [
  { id: RACHEL, first: 'Rachel', hint: 'MARKETING MANAGER · 2 active', group: 'MARKETING MANAGER' },
  { id: SITI, first: 'Siti', hint: 'GRAPHIC DESIGNER · 4 active', group: 'GRAPHIC DESIGNER' },
  { id: AINA, first: 'Aina', hint: 'GRAPHIC DESIGNER · 2 active', group: 'GRAPHIC DESIGNER' },
]
const approvers = people.filter(p => p.group === 'MARKETING MANAGER')
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

  it('the Canvas template tab: a section added is saved as the canvas alone; a choice with no options stops Publish', async () => {
    builder()
    fireEvent.click(screen.getByRole('tab', { name: 'Canvas template' }))
    expect(screen.getByText('Canvas template · draft v3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktWorkflow.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['w1', 5, ['canvas']])
    expect(patch.canvas.sections[0]).toMatchObject({ title: 'New section', stage: null, fields: [{ label: 'Notes', type: 'Text', stage: 2 }] })

    fireEvent.click(screen.getByRole('button', { name: /Notes/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Field Notes' })).getByRole('button', { name: /Select/ }))
    expect(screen.getByText('⚠️ A choice has no options')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish v3' })).toHaveProperty('disabled', true)
  })

  it('a stage taken out: the canvas’s fields of it belong to none, saved with the stages', async () => {
    const canvas = { req: { pic: true }, sections: [{ title: 'Caption', stage: 2, fields: [{ label: 'Caption', type: 'Text', stage: 2 }, { label: 'Brief', type: 'Text', stage: 1 }] }] }
    builder([{ ...REELS, canvas }, BROKEN])
    fireEvent.click(screen.getByText('Script'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove stage' }))
    await waitFor(() => expect(actions.saveMktWorkflow).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const patch = actions.saveMktWorkflow.mock.calls[0][2]
    expect(Object.keys(patch)).toEqual(['stages', 'canvas'])
    expect(patch.stages.map((s: { name: string }) => s.name)).toEqual(['Edit', 'Final'])
    expect(patch.canvas.sections[0].stage).toBe(1)
    expect(patch.canvas.sections[0].fields.map((f: { stage: number | null }) => f.stage)).toEqual([1, 0])
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
      draft: [{ name: 'Design photo', dept: '', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ kind: 'pic' }], split: false, back: null, picText: '', form: [] }],
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

  it('deletes a template never published, asked first — the next one opens; a published one offers no delete (answer 8)', async () => {
    actions.deleteMktWorkflow.mockResolvedValue({ ok: true, workflows: list(REELS) })
    builder([REELS, BROKEN], 'w2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    const ask = screen.getByRole('group', { name: 'Delete this template?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }))
    })
    expect(actions.deleteMktWorkflow).toHaveBeenCalledWith('w2', 1)
    expect(await screen.findByText('Deleted “Brand book · Standard”')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveProperty('value', 'Full production')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
    expect(router.replace).toHaveBeenLastCalledWith('/marketing/workflows?w=w1', { scroll: false })
  })

  it('a delete the database refuses says why and keeps the template; Keep takes the question back', async () => {
    actions.deleteMktWorkflow.mockResolvedValue({ ok: false, reason: 'The product "Social Media Package A" links this template — unlink it there first.' })
    builder([REELS, BROKEN], 'w2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Delete this template?' })).getByRole('button', { name: 'Keep' }))
    expect(actions.deleteMktWorkflow).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Delete this template?' })).getByRole('button', { name: 'Delete' }))
    })
    expect(await screen.findByText('The product "Social Media Package A" links this template — unlink it there first.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveProperty('value', 'Standard')
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
    expect(patch.stages[1].form[0]).toEqual({ label: 'Shot list', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due date', type: 'Date' }], rows: [['Opening', '']],
      req: true, pic: true })
  })
})
