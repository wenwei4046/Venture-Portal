import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { canvasFromRow, type WfCanvas } from '@/lib/marketing/canvas'
import type { OptionLists } from '@/lib/marketing/options'
import { newWfStage, type WfStage } from '@/lib/marketing/workflows'

const actions = vi.hoisted(() => ({ addMktOption: vi.fn(), removeMktOption: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import CanvasEditor from './CanvasEditor'

// 2026-10-23 — the Canvas Template Editor (`Canvas Template Editor.dc.html`, the Workflow Builder's Canvas template tab):
// the task page laid out — 📋 Requirements, a section per stage with its fields, the manager's own sections, the Free
// space; a section's and a field's settings; the Preview as the staff and as the PIC see it. The editor hands back the
// stages and the canvas changed; the Workflow Builder saves them (WorkflowBuilder.test.tsx).

const stage = (over: Partial<WfStage>): WfStage => ({ ...newWfStage(undefined), dept: 'VIDEOGRAPHER', ...over })
const STAGES = [
  stage({ key: 'a', name: 'Script', form: [{ label: 'Topic', type: 'Text' }] }),
  stage({ key: 'b', name: 'Shoot', form: [{ label: 'Shoot date', type: 'Date' }, { label: 'Shots', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Done', type: 'Checkbox' }], rows: [['Opening', '']] }] }),
  stage({ key: 'c', name: 'Edit', form: [] }),
]
const CANVAS = canvasFromRow({
  req: { pic: true },
  sections: [{ emoji: '💬', title: 'Caption', stage: 0, locked: false, req: true, pic: true, fields: [{ label: 'Platform', type: 'Select', stage: 0, req: true, pic: true, opts: ['Instagram'] }] }],
})

function editor(stages = STAGES, canvas: WfCanvas = CANVAS, lists?: OptionLists) {
  const onStages = vi.fn()
  const onCanvas = vi.fn()
  const onEditStage = vi.fn()
  const onList = vi.fn()
  const say = vi.fn()
  render(
    <CanvasEditor title="Reels video · Full production" version={3} stages={stages} canvas={canvas} saveState={<span>Saved</span>}
      nameAt={() => 'Ali'} onStages={onStages} onCanvas={onCanvas} onEditStage={onEditStage} lists={lists} onList={onList} say={say} />,
  )
  return { onStages, onCanvas, onEditStage, onList, say }
}

describe('the Canvas Template Editor', () => {
  it('lays out the task page: Requirements, a section per stage, the manager’s own, the Free space', () => {
    editor()
    expect(screen.getByText('Canvas template · draft v3')).toBeTruthy()
    const titles = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))
    expect(titles).toEqual(['Requirements', 'Script', 'Shoot', 'Edit', 'Caption'])
    expect(screen.getByText('From the intake minutes')).toBeTruthy()
    const shoot = screen.getByRole('region', { name: 'Shoot' })
    expect(within(shoot).getByText('Shoot date')).toBeTruthy()
    expect(within(shoot).getByText('Opening')).toBeTruthy() // a preset row, the team’s to read
    expect(within(screen.getByRole('region', { name: 'Edit' })).getByText('No fields')).toBeTruthy()
    expect(screen.getByText('🔒 Free space')).toBeTruthy()
  })

  it('a stage’s section: locked, required, shown to the PIC — handed back on the stage', () => {
    const { onStages, onEditStage } = editor()
    const script = screen.getByRole('region', { name: 'Script' })
    fireEvent.click(within(script).getByRole('button', { name: '⚙ Section settings' }))
    const pop = screen.getByRole('dialog', { name: 'Section Script' })
    fireEvent.click(within(pop).getByRole('switch', { name: /Locked/ }))
    expect(onStages.mock.calls[0][0][0].sec).toEqual({ emoji: '🎯', locked: true, req: true, pic: true })
    // Its stage is its own; its fields are set on the stage.
    expect(within(pop).getByRole('radio', { name: 'Script' })).toHaveProperty('disabled', true)
    fireEvent.click(within(pop).getByRole('button', { name: 'Edit in Workflow stages' }))
    expect(onEditStage).toHaveBeenCalledWith(0)
  })

  it('a stage’s field: required, the PIC, a date on the calendar of the kind it is', () => {
    const { onStages } = editor()
    fireEvent.click(screen.getByRole('button', { name: /Shoot date/ }))
    const pop = screen.getByRole('dialog', { name: 'Field Shoot date' })
    fireEvent.click(within(pop).getByRole('switch', { name: '📅 Show on calendar' }))
    let next = onStages.mock.calls.at(-1)?.[0] as WfStage[]
    // A date on the calendar is one of the fixed kinds (the user, 2026-10-24) — a Post day until another is picked.
    expect(next[1].form[0].cal).toEqual({ kind: 'post', pic: false })
    fireEvent.click(within(pop).getByRole('switch', { name: '👁 Visible to PIC' }))
    next = onStages.mock.calls.at(-1)?.[0] as WfStage[]
    expect(next[1].form[0].pic).toBe(false)
  })

  it('a date already on the calendar says which kind it is, and takes another', () => {
    const dated = STAGES.map((s, i) => i === 1 ? { ...s, form: [{ ...s.form[0], cal: { kind: 'post' as const, pic: false } }, s.form[1]] } : s)
    const { onStages } = editor(dated)
    fireEvent.click(screen.getByRole('button', { name: /Shoot date/ }))
    const kinds = within(screen.getByRole('dialog', { name: 'Field Shoot date' })).getByRole('radiogroup', { name: 'Which date is it?' })
    expect(within(kinds).getAllByRole('radio').map(r => `${r.textContent}${r.getAttribute('aria-checked') === 'true' ? '*' : ''}`)).toEqual([
      '📣 Post day*', '🎬 Shoot day', '🗓️ Meeting', '📈 Ads go-live', '🛑 Ads end', '📊 Report day',
    ])
    fireEvent.click(within(kinds).getByRole('radio', { name: '🎬 Shoot day' }))
    expect((onStages.mock.calls.at(-1)?.[0] as WfStage[])[1].form[0].cal).toEqual({ kind: 'shoot', pic: false })
  })

  it('the manager’s own sections: + Add section, a field added, its options, its stage, removed', () => {
    const { onCanvas } = editor()
    fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
    const added = onCanvas.mock.calls.at(-1)?.[0] as WfCanvas
    expect(added.sections.map(s => s.title)).toEqual(['Caption', 'New section'])
    expect(added.sections[1].fields.map(f => [f.label, f.stage])).toEqual([['Notes', 2]])

    const caption = screen.getByRole('region', { name: 'Caption' })
    fireEvent.click(within(caption).getByRole('button', { name: /Platform/ }))
    const pop = screen.getByRole('dialog', { name: 'Field Platform' })
    fireEvent.change(within(pop).getByRole('textbox', { name: 'New option' }), { target: { value: 'TikTok' } })
    fireEvent.click(within(pop).getByRole('button', { name: 'Add' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields[0].opts).toEqual(['Instagram', 'TikTok'])
    fireEvent.click(within(pop).getByRole('radio', { name: 'Edit' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields[0].stage).toBe(2)
    fireEvent.click(within(pop).getByRole('button', { name: 'Remove field' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields).toEqual([])

    fireEvent.click(within(caption).getByRole('button', { name: '+ Add field' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields.map(f => [f.label, f.type, f.stage])).toEqual([['Platform', 'Select', 0], ['New field', 'Text', 0]])

    fireEvent.click(within(caption).getByRole('button', { name: '⚙ Section settings' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Section Caption' })).getByRole('button', { name: 'Remove section' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections).toEqual([])
  })

  // ③d-2 — the user's answer 9: a choice's options from a shared list (Locations), the group's — written at once.
  it('a choice’s options from a shared list: picked; the list’s options added and taken off at once; back to its own', async () => {
    const lists = { Locations: ['Showroom', 'LRT'] }
    const first = editor(STAGES, CANVAS, lists)
    fireEvent.click(within(screen.getByRole('region', { name: 'Caption' })).getByRole('button', { name: /Platform/ }))
    let pop = screen.getByRole('dialog', { name: 'Field Platform' })
    const from = within(pop).getByRole('radiogroup', { name: 'Where do the options come from?' })
    expect(within(from).getAllByRole('radio').map(r => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Shared option list · Locations2 options · used across the group', 'false'], ['Own options for this field1 option · this template only', 'true']])
    fireEvent.click(within(from).getByRole('radio', { name: /Shared option list · Locations/ }))
    const picked = (first.onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields[0]
    expect([picked.list, picked.opts]).toEqual(['Locations', ['Instagram']])
    cleanup()

    // Naming Locations: its options are the group's — added and taken off at once, told; back to its own.
    const shared = canvasFromRow({ req: { pic: true }, sections: [{ emoji: '💬', title: 'Caption', stage: 0, fields: [
      { label: 'Platform', type: 'Multi-select', stage: 0, opts: ['Instagram'], list: 'Locations' }] }] })
    const second = editor(STAGES, shared, lists)
    fireEvent.click(within(screen.getByRole('region', { name: 'Caption' })).getByRole('button', { name: /Platform/ }))
    pop = screen.getByRole('dialog', { name: 'Field Platform' })
    expect(within(pop).getAllByRole('button', { name: /^Remove / }).map(b => b.getAttribute('aria-label')).filter(Boolean)).toEqual(['Remove Showroom', 'Remove LRT'])
    actions.addMktOption.mockResolvedValue({ ok: true, list: 'Locations', opts: ['Showroom', 'LRT', 'Studio A'], option: 'Studio A' })
    fireEvent.change(within(pop).getByRole('textbox', { name: 'New option' }), { target: { value: 'Studio A' } })
    await act(async () => {
      fireEvent.click(within(pop).getByRole('button', { name: 'Add' }))
    })
    expect(actions.addMktOption).toHaveBeenCalledWith('Locations', 'Studio A')
    expect(second.onList).toHaveBeenLastCalledWith('Locations', ['Showroom', 'LRT', 'Studio A'])
    expect(second.say).toHaveBeenLastCalledWith('Studio A · on Locations')
    actions.removeMktOption.mockResolvedValue({ ok: true, list: 'Locations', opts: ['Showroom', 'Studio A'] })
    await act(async () => {
      fireEvent.click(within(pop).getByRole('button', { name: 'Remove LRT' }))
    })
    expect(actions.removeMktOption).toHaveBeenCalledWith('Locations', 'LRT')
    expect(second.onList).toHaveBeenLastCalledWith('Locations', ['Showroom', 'Studio A'])
    expect(second.say).toHaveBeenLastCalledWith('LRT taken off Locations · answers that picked it keep it')
    expect(second.onCanvas).not.toHaveBeenCalled() // the group's list, never the draft
    fireEvent.click(within(pop).getByRole('radio', { name: /Own options for this field/ }))
    const own = (second.onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).sections[0].fields[0]
    expect([own.list, own.opts]).toEqual([undefined, ['Instagram']])
  })

  it('no shared list: a choice has its own options only', () => {
    editor(STAGES, CANVAS, {})
    fireEvent.click(within(screen.getByRole('region', { name: 'Caption' })).getByRole('button', { name: /Platform/ }))
    expect(within(screen.getByRole('dialog', { name: 'Field Platform' })).queryByRole('radiogroup', { name: 'Where do the options come from?' })).toBeNull()
  })

  it('Requirements: only whether the PIC sees it', () => {
    const { onCanvas } = editor()
    fireEvent.click(within(screen.getByRole('region', { name: 'Requirements' })).getByRole('button', { name: '⚙ Section settings' }))
    const pop = screen.getByRole('dialog', { name: 'Section Requirements' })
    expect(within(pop).queryByRole('switch', { name: /Required/ })).toBeNull()
    fireEvent.click(within(pop).getByRole('switch', { name: '👁 Visible to PIC' }))
    expect((onCanvas.mock.calls.at(-1)?.[0] as WfCanvas).req).toEqual({ pic: false })
  })

  it('the Preview: as Ali sees it at a stage, then as the PIC sees the link', () => {
    editor()
    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByText(/As Ali sees it at the/)).toBeTruthy()
    fireEvent.click(within(preview).getByRole('tab', { name: 'PIC link view' }))
    expect(within(preview).getByText('Tracking link')).toBeTruthy()
    expect(within(preview).getByText('Reels video')).toBeTruthy()
    expect(within(preview).getByText('Approve')).toBeTruthy()
    expect(within(preview).queryByText('Hidden:', { exact: false })).toBeNull() // everything is shown to the PIC
  })
})
