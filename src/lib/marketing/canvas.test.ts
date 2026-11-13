import { describe, expect, it } from 'vitest'
import {
  canvasForStages, canvasFromRow, canvasPayload, canvasProblems, duplicateStageSections, ensureStageSections, fieldFlags, newCanvasSection,
  picView, renameStageSection, stageFillCount, stageNameOf, staffView, withType, type CanvasField, type WfCanvas,
} from './canvas'

// A template's canvas (Workflow Builder 2a, 2026-11-13): the only place fields are defined — every field and table
// column names the stage that fills it in by the stage's key, so stages renamed or moved keep their fields. The
// database's side: tests/member-sql/validate-marketing-wf-builder-v2.mjs.

const STAGES = [{ sid: 'sscript', name: 'Script' }, { sid: 'sedit00', name: 'Edit' }, { sid: 'sfinal0', name: 'Final' }]
const field = (p: Partial<CanvasField> = {}): CanvasField => ({ id: 'f1', label: 'Body', type: 'Text', stage: 'sscript', req: true, pic: true, ...p })
const CANVAS: WfCanvas = {
  req: { pic: true },
  sections: [
    { id: 'xs', emoji: '🎯', title: 'Script', stage: 'sscript', locked: false, req: true, pic: true, fields: [
      field(),
      field({ id: 'ft', label: 'Shots', type: 'Table', req: false, cols: [
        { id: 'k1', name: 'Shot', type: 'Text', stage: 'sscript', req: true, pic: true },
        { id: 'k2', name: 'Edit notes (internal)', type: 'Text', stage: 'sedit00', req: false, pic: false },
      ], rows: [['Opening', '']] }),
    ] },
    { id: 'xn', emoji: '📝', title: 'Notes', stage: null, locked: false, req: false, pic: false, fields: [field({ id: 'fn', label: 'Notes', stage: 'sfinal0', pic: false })] },
  ],
}

describe('the canvas as the database keeps it', () => {
  it('reads and writes the same shape — ids, stages by key, a table’s columns with their own stage', () => {
    const back = canvasFromRow(canvasPayload(CANVAS))
    expect(back).toEqual(CANVAS)
    expect(canvasFromRow({ sections: [{ fields: [{ label: 'x', type: 'Video' }, { label: 'n', type: 'Note', req: true }] }] }).sections[0].fields)
      .toEqual([expect.objectContaining({ label: 'n', type: 'Note', req: false })])
  })
})

describe('the stages change, the canvas follows', () => {
  it('a stage with no section gets one after the stage before’s', () => {
    const c = ensureStageSections(CANVAS, [...STAGES.slice(0, 2), { sid: 'snew000', name: 'Thumbnail' }, STAGES[2]])
    expect(c.sections.map(s => [s.title, s.stage])).toEqual([['Script', 'sscript'], ['Edit', 'sedit00'], ['Thumbnail', 'snew000'], ['Final', 'sfinal0'], ['Notes', null]])
    expect(ensureStageSections(c, STAGES)).toBe(c)
  })
  it('a stage taken out leaves its fields and columns to nobody; renamed, its section follows', () => {
    const c = canvasForStages(CANVAS, [STAGES[0], STAGES[2]])
    expect(c.sections[0].fields[1].cols?.map(x => x.stage)).toEqual(['sscript', null])
    expect(canvasForStages(c, [STAGES[0], STAGES[2]])).toBe(c)
    // Its own section with nothing in it goes with it (2026-11-14); one holding fields stays, belonging to none.
    const withEmpty: WfCanvas = { ...CANVAS, sections: [...CANVAS.sections, { id: 'xe', emoji: '🎯', title: 'Edit', stage: 'sedit00', locked: false, req: true, pic: true, fields: [] }] }
    expect(canvasForStages(withEmpty, [STAGES[0], STAGES[2]]).sections.map(s => s.id)).toEqual(['xs', 'xn'])
    expect(canvasForStages(withEmpty, [STAGES[2]]).sections.map(s => [s.id, s.stage])).toEqual([['xs', null], ['xn', null]])
    expect(renameStageSection(CANVAS, 'sscript', 'Script', 'Scripting').sections[0].title).toBe('Scripting')
    expect(renameStageSection(CANVAS, 'sscript', 'Other', 'X')).toBe(CANVAS)
  })
  it('a stage copied: its section and fields copied for the copy', () => {
    const c = duplicateStageSections(CANVAS, 'sscript', 'scopy00', 'Script copy')
    expect(c.sections.map(s => [s.title, s.stage])).toEqual([['Script', 'sscript'], ['Script copy', 'scopy00'], ['Notes', null]])
    expect(c.sections[1].fields.map(f => f.stage)).toEqual(['scopy00', 'scopy00'])
    expect(c.sections[1].fields[1].cols?.map(x => x.stage)).toEqual(['scopy00', 'sedit00'])
    expect(c.sections[1].fields[0].id).not.toBe('f1')
  })
  it('counts what a stage fills in, and names a stage by its key', () => {
    expect([stageFillCount(CANVAS, 'sscript'), stageFillCount(CANVAS, 'sedit00'), stageFillCount(CANVAS, 'sfinal0')]).toEqual([2, 1, 1])
    expect([stageNameOf(STAGES, 'sedit00'), stageNameOf(STAGES, null), stageNameOf(STAGES, 'sgone00')]).toEqual(['Edit', '—', 'Removed stage'])
  })
})

describe('fields', () => {
  it('a new kind: a table gets a column, a choice its options, a note is never required', () => {
    expect(withType(field(), 'Table').cols).toHaveLength(1)
    expect(withType(field(), 'Select').opts).toEqual([])
    expect(withType(field(), 'Note').req).toBe(false)
    expect(withType(withType(field(), 'Table'), 'Text').cols).toBeUndefined()
  })
  it('the marks: ⭐ 👁 / 🔒 📅', () => {
    expect(fieldFlags(field())).toBe('⭐ 👁')
    expect(fieldFlags(field({ req: false, pic: false, type: 'Date', cal: { kind: 'post', pic: false } }))).toBe('🔒 📅')
  })
  it('a new section: a Notes field at the last stage', () => {
    expect(newCanvasSection('sfinal0').fields.map(f => [f.label, f.stage])).toEqual([['Notes', 'sfinal0']])
  })
})

describe('what publishing refuses', () => {
  it('a field or column of a stage gone, a nameless one, a choice without options', () => {
    expect(canvasProblems(STAGES, CANVAS)).toEqual([])
    const bad: WfCanvas = { req: { pic: true }, sections: [{ ...CANVAS.sections[0], title: '', fields: [
      field({ stage: 'sgone00' }), field({ id: 'f2', label: '', type: 'Select', opts: [] }),
      field({ id: 'f3', label: 'T', type: 'Table', cols: [{ id: 'k', name: '', type: 'Text', stage: null, req: false, pic: false }] }),
    ] }] }
    expect(canvasProblems(STAGES, bad)).toEqual([
      'A section has no name', 'Each field in a section needs its own name', 'A field has no stage to fill it in', 'A table column has no name',
      'A table column has no stage to fill it in', 'A choice has no options',
    ])
  })
})

describe('the preview', () => {
  it('staff: the sections a stage fills nothing in faded, its own columns marked', () => {
    const v = staffView(STAGES, CANVAS, 'sedit00')
    expect(v.map(s => [s.title, s.mine, s.kind])).toEqual([['Requirements', true, 'req'], ['Script', true, 'table'], ['Notes', false, 'fields']])
    expect(v[1].cols).toEqual([{ name: 'Shot', mine: false }, { name: 'Edit notes', mine: true }])
  })
  it('the PIC: only 👁 sections and columns, and what is hidden', () => {
    const p = picView(CANVAS)
    expect(p.sections.map(s => [s.title, s.cols])).toEqual([['Requirements', null], ['Script', ['Shot']]])
    expect(p.hidden).toBe('Hidden: Notes, 1 internal column.')
  })
})
