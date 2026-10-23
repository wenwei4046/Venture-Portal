import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { canvasFromRow, type WfCanvas } from '@/lib/marketing/canvas'
import { newWfStage, type WfStage } from '@/lib/marketing/workflows'
import CanvasEditor from './CanvasEditor'

// 2026-10-23 — the Canvas Template Editor (`Canvas Template Editor.dc.html`, the Workflow Builder's Canvas template tab):
// the task page laid out — 📋 Requirements, a section per stage with its fields, the manager's own sections, the Free
// space; a section's and a field's settings; the Preview as the staff and as the PIC see it. The editor hands back the
// stages and the canvas changed; the Workflow Builder saves them (WorkflowBuilder.test.tsx).

const stage = (over: Partial<WfStage>): WfStage => ({ ...newWfStage(undefined), dept: 'content', ...over })
const STAGES = [
  stage({ key: 'a', name: 'Script', form: [{ label: 'Topic', type: 'Text' }] }),
  stage({ key: 'b', name: 'Shoot', form: [{ label: 'Shoot date', type: 'Date' }, { label: 'Shots', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Done', type: 'Checkbox' }], rows: [['Opening', '']] }] }),
  stage({ key: 'c', name: 'Edit', form: [] }),
]
const CANVAS = canvasFromRow({
  req: { pic: true },
  sections: [{ emoji: '💬', title: 'Caption', stage: 0, locked: false, req: true, pic: true, fields: [{ label: 'Platform', type: 'Select', stage: 0, req: true, pic: true, opts: ['Instagram'] }] }],
})

function editor(stages = STAGES, canvas: WfCanvas = CANVAS) {
  const onStages = vi.fn()
  const onCanvas = vi.fn()
  const onEditStage = vi.fn()
  render(
    <CanvasEditor title="Reels video · Full production" version={3} stages={stages} canvas={canvas} saveState={<span>Saved</span>}
      nameAt={() => 'Ali'} onStages={onStages} onCanvas={onCanvas} onEditStage={onEditStage} />,
  )
  return { onStages, onCanvas, onEditStage }
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

  it('a stage’s field: required, the PIC, a date on the calendar with its colour', () => {
    const { onStages } = editor()
    fireEvent.click(screen.getByRole('button', { name: /Shoot date/ }))
    const pop = screen.getByRole('dialog', { name: 'Field Shoot date' })
    fireEvent.click(within(pop).getByRole('switch', { name: '📅 Show on calendar' }))
    let next = onStages.mock.calls.at(-1)?.[0] as WfStage[]
    expect(next[1].form[0].cal).toEqual({ label: 'Shoot date', tone: 'social', pic: false })
    fireEvent.click(within(pop).getByRole('switch', { name: '👁 Visible to PIC' }))
    next = onStages.mock.calls.at(-1)?.[0] as WfStage[]
    expect(next[1].form[0].pic).toBe(false)
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
