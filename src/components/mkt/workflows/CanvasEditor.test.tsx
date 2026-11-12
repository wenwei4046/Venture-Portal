import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { canvasFromRow, type WfCanvas } from '@/lib/marketing/canvas'
import type { WfPerson, WfStage } from '@/lib/marketing/workflows'

// 2026-11-13 — the Canvas Template Editor (`Canvas Template Editor.dc.html`), now the only place fields are defined:
// "🎯 Which stage fills this in?" lists the template's real stages; every field and table column has its stage,
// ⭐ Required before submit and 👁 Visible to PIC; the Preview as the staff or the PIC see it.

const actions = vi.hoisted(() => ({ addMktOption: vi.fn(), removeMktOption: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import CanvasEditor from './CanvasEditor'

const S = (sid: string, name: string, dept = 'content'): WfStage =>
  ({ sid, name, dept, who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '' })
const STAGES = [S('sscript0', 'Script'), S('sedit000', 'Edit', 'design'), S('sfinal00', 'Final')]
const people: WfPerson[] = [{ id: 'a', first: 'Ali', title: 'GRAPHIC DESIGNER', load: 1 }]
const CANVAS = canvasFromRow({
  req: { pic: true },
  sections: [
    { id: 'xs', emoji: '🎯', title: 'Script', stage: 'sscript0', req: true, pic: true, fields: [
      { id: 'fbody', label: 'Body', type: 'Text', stage: 'sscript0', req: true, pic: true },
      { id: 'fshots', label: 'Shots', type: 'Table', stage: 'sscript0', cols: [
        { id: 'kshot', name: 'Shot', type: 'Text', stage: 'sscript0', req: true, pic: true },
        { id: 'knote', name: 'Edit notes', type: 'Text', stage: 'sedit000', req: false, pic: false },
      ], rows: [['Opening', '']] },
    ] },
    { id: 'xn', emoji: '📝', title: 'Notes', stage: null, fields: [{ id: 'fn', label: 'Notes', type: 'Text', stage: 'sfinal00' }] },
  ],
})

let onCanvas = vi.fn()
beforeEach(() => { onCanvas = vi.fn() })
const editor = (canvas: WfCanvas = CANVAS) =>
  render(<CanvasEditor title="Reels video · Full production" version={3} stages={STAGES} canvas={canvas} people={people} onCanvas={onCanvas} />)
const last = (): WfCanvas => onCanvas.mock.calls[onCanvas.mock.calls.length - 1][0]

describe('the Canvas Template Editor', () => {
  it('draws each field with the stage that fills it in and its marks', () => {
    editor()
    expect(screen.getByText('Canvas template · draft v3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Body.*🎯 Script\s+⭐ 👁/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Notes.*🎯 Final\s+👁|Notes.*🎯 Final\s+🔒/ })).toBeTruthy()
  })

  it('a field’s stage is picked from the template’s real stages, by key', () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: /Body/ }))
    const pop = screen.getByRole('dialog', { name: 'Field Body' })
    const chips = within(pop).getByRole('radiogroup', { name: 'Which stage fills this in?' })
    expect(within(chips).getAllByRole('radio').map(r => r.textContent)).toEqual(['Script', 'Edit', 'Final'])
    fireEvent.click(within(chips).getByRole('radio', { name: 'Edit' }))
    expect(last().sections[0].fields[0].stage).toBe('sedit000')
    fireEvent.click(within(pop).getByRole('switch', { name: '⭐ Required before submit' }))
    expect(onCanvas).toHaveBeenCalled()
  })

  it('every table column has its stage, ⭐ and 👁 — a click opens the column; + adds one', () => {
    editor()
    const col = screen.getByRole('button', { name: /Edit notes.*🎯 Edit/ })
    fireEvent.click(col)
    const pop = screen.getByRole('dialog', { name: 'Column Edit notes' })
    fireEvent.click(within(pop).getByRole('radio', { name: 'Final' }))
    expect(last().sections[0].fields[1].cols?.[1]).toMatchObject({ id: 'knote', stage: 'sfinal00' })
    fireEvent.click(within(pop).getByRole('switch', { name: '👁 Visible to PIC' }))
    expect(last().sections[0].fields[1].cols?.[1].pic).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
    expect(last().sections[0].fields[1].cols).toHaveLength(3)
    expect(last().sections[0].fields[1].rows).toEqual([['Opening', '', '']])
  })

  it('the preset row reads locked, a blank cell takes a test entry never kept', () => {
    editor()
    expect(screen.getByTitle("Preset — the team can't change this").textContent).toContain('Opening')
    const cell = screen.getByRole('textbox', { name: 'Row 1, Edit notes' })
    fireEvent.change(cell, { target: { value: 'try' } })
    expect(onCanvas).not.toHaveBeenCalled()
  })

  it('+ Add section: a Notes field at the last stage; a section belongs to a stage or any', () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
    expect(last().sections[2].fields.map(f => [f.label, f.stage])).toEqual([['Notes', 'sfinal00']])
  })

  it('a section’s settings: 🔒 ⭐ 👁 and its stage, Any / read-only included', () => {
    editor()
    fireEvent.click(screen.getAllByRole('button', { name: '⚙ Section settings' })[2])
    const pop = screen.getByRole('dialog', { name: 'Section Notes' })
    fireEvent.click(within(pop).getByRole('radio', { name: 'Edit' }))
    expect(last().sections[1].stage).toBe('sedit000')
    expect(within(pop).getByRole('radio', { name: 'Any / read-only' })).toBeTruthy()
  })

  it('a field of a stage gone is flagged', () => {
    editor({ ...CANVAS, sections: [{ ...CANVAS.sections[1], fields: [{ ...CANVAS.sections[1].fields[0], stage: 'sgone000' }] }] })
    expect(screen.getByRole('button', { name: /Notes.*🎯 Removed stage/ })).toBeTruthy()
  })

  it('the preview: the staff at a stage (its columns marked), and the PIC link with only 👁', () => {
    editor()
    expect(screen.getByText(/As .* sees it at the/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'PIC link view' }))
    expect(screen.getByText(/Hidden: Notes, 1 internal column\./)).toBeTruthy()
  })
})
