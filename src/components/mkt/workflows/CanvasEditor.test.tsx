import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { canvasFromRow, type WfCanvas } from '@/lib/marketing/canvas'
import type { WfStage } from '@/lib/marketing/workflows'

// 2026-11-13 — the Canvas Template Editor (`Canvas Template Editor.dc.html`), now the only place fields are defined:
// "🎯 Which stage fills this in?" lists the template's real stages; every field and table column has its stage,
// ⭐ Required before submit and 👁 Visible to PIC; the Preview as the staff or the PIC see it.

const actions = vi.hoisted(() => ({ addMktOption: vi.fn(), removeMktOption: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import CanvasEditor from './CanvasEditor'

const S = (sid: string, name: string, dept = 'content'): WfStage =>
  ({ sid, name, dept, who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '' })
const STAGES = [S('sscript0', 'Script'), S('sedit000', 'Edit', 'design'), S('sfinal00', 'Final')]
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
  render(<CanvasEditor title="Reels video · Full production" version={3} stages={STAGES} canvas={canvas} onCanvas={onCanvas} />)
const last = (): WfCanvas => onCanvas.mock.calls[onCanvas.mock.calls.length - 1][0]

describe('the Canvas Template Editor', () => {
  it('draws each field with the stage that fills it in and its marks', () => {
    editor()
    expect(screen.getByText('Canvas template · draft v3')).toBeTruthy()
    // A flat row; 🎯 only where the field's stage is not its section's (the 2026-11-17 handoff §1.6): Body is the
    // Script section's own, Notes sits in an any-stage section.
    const body = screen.getByRole('button', { name: /Body.*⭐.*👁/ })
    expect(body.textContent).not.toContain('🎯')
    expect(screen.getByRole('button', { name: /Notes.*🎯 Final/ })).toBeTruthy()
    // An icon that is off is kept in its column but hidden.
    expect(within(screen.getByRole('button', { name: /Notes.*🎯 Final/ })).getByText('⭐').getAttribute('aria-hidden')).toBe('true')
  })

  it('a section’s owning stage is a dark “🎯 Stage n” pill — its name added only when it differs from the title; ⚙ alone', () => {
    editor({ ...CANVAS, sections: [...CANVAS.sections, { ...CANVAS.sections[1], id: 'xo', title: 'Hand-off', stage: 'sedit000', fields: [] }] })
    const script = screen.getByRole('region', { name: 'Script' })
    expect(within(script).getByTitle('This stage fills it in').textContent).toBe('🎯 Stage 1')
    expect(within(screen.getByRole('region', { name: 'Hand-off' })).getByTitle('This stage fills it in').textContent).toBe('🎯 Stage 2 · Edit')
    expect(within(screen.getByRole('region', { name: 'Notes' })).queryByTitle('This stage fills it in')).toBeNull()
    // The other marks are icons, their words in the tooltip.
    expect(within(script).getByLabelText('Required before submit').textContent).toBe('⭐')
    expect(within(script).getByRole('button', { name: 'Section settings' }).textContent).toBe('⚙')
    expect(screen.getByText('🔒 Free space for colleagues')).toBeTruthy()
  })

  it('Who fills what: a pill per stage with its count (0 red); a click flashes its section and sets the preview', () => {
    vi.useFakeTimers()
    try {
      editor()
      const strip = screen.getByRole('toolbar', { name: 'Who fills what' })
      const pills = within(strip).getAllByRole('button')
      expect(pills.map(p => p.textContent)).toEqual(['1. Script2', '2. Edit1', '3. Final1'])
      fireEvent.click(pills[1])
      // Edit has no section of its own: the section holding its column (Script) is the one brought into view.
      expect(screen.getByRole('region', { name: 'Script' }).className).toMatch(/cardHit/)
      expect((screen.getByRole('combobox', { name: 'Doer at' }) as HTMLSelectElement).value).toBe('sedit000')
      act(() => { vi.advanceTimersByTime(1200) })
      expect(screen.getByRole('region', { name: 'Script' }).className).not.toMatch(/cardHit/)
    } finally {
      vi.useRealTimers()
    }
    const none = render(<CanvasEditor title="x" version={1} stages={STAGES} canvas={{ req: { pic: true }, sections: [] }} onCanvas={onCanvas} />)
    expect(within(none.getAllByRole('toolbar', { name: 'Who fills what' })[1]).getAllByRole('button')[0].lastElementChild?.className).toMatch(/stripZero/)
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Section settings' })[2])
    const pop = screen.getByRole('dialog', { name: 'Section Notes' })
    fireEvent.click(within(pop).getByRole('radio', { name: 'Edit' }))
    expect(last().sections[1].stage).toBe('sedit000')
    expect(within(pop).getByRole('radio', { name: 'Any / read-only' })).toBeTruthy()
  })

  it('a section that may go has Remove on its card; a stage’s only section has none (2026-11-14)', () => {
    editor()
    expect(within(screen.getByRole('region', { name: 'Script' })).queryByRole('button', { name: /^Remove section/ })).toBeNull()
    fireEvent.click(within(screen.getByRole('region', { name: 'Notes' })).getByRole('button', { name: 'Remove section Notes' }))
    expect(last().sections.map(s => s.id)).toEqual(['xs'])
  })
  it('a field of a stage gone is flagged', () => {
    editor({ ...CANVAS, sections: [{ ...CANVAS.sections[1], fields: [{ ...CANVAS.sections[1].fields[0], stage: 'sgone000' }] }] })
    expect(screen.getByRole('button', { name: /Notes.*🎯 Removed stage/ })).toBeTruthy()
  })

  it('the preview: the staff at a stage (its columns marked), and the PIC link with only 👁', () => {
    editor()
    expect((screen.getByRole('combobox', { name: 'Doer at' }) as HTMLSelectElement).value).toBe('sfinal00')
    fireEvent.click(screen.getByRole('tab', { name: 'PIC link view' }))
    expect(screen.getByText(/Hidden: Notes, 1 internal column\./)).toBeTruthy()
  })
})
