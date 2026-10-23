import { describe, expect, it } from 'vitest'
import {
  canvasFromRow, canvasPayload, canvasProblems, canvasRemap, EMPTY_CANVAS, fieldExtras, fieldFlags, newCanvasSection, picView, stageMap,
  staffView, withType, type WfCanvas,
} from './canvas'
import type { FormField } from './tasks'
import { newWfStage, wfStageFromRow, type WfStage } from './workflows'

// 2026-10-23 — the Canvas Template Editor (`Canvas Template Editor.dc.html`, ③ of the handoff): the task page's layout
// kept with a workflow template — what the builder reads, sends, follows when the stages change, refuses on publishing
// (as mkt_canvas_check / mkt_workflow_check do: tests/member-sql/validate-marketing-canvas.mjs) and previews.

const stage = (over: Partial<WfStage> = {}): WfStage => ({ ...newWfStage(undefined), ...over })
const STAGES = [
  stage({ key: 'a', name: 'Script', form: [{ label: 'Topic', type: 'Text' }, { label: 'Read the brief', type: 'Note' }] }),
  stage({ key: 'b', name: 'Shoot', sec: { emoji: '🎬', locked: true, req: false, pic: false },
    form: [{ label: 'Shoot date', type: 'Date', cal: { kind: 'shoot', pic: false } }, { label: 'Shots', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }] }] }),
  stage({ key: 'c', name: 'Edit', form: [{ label: 'Final video', type: 'File', pic: false }] }),
]
const ROW = {
  req: { pic: false },
  sections: [
    { emoji: '💬', title: 'Caption', stage: 0, locked: true, req: true, pic: true, fields: [
      { label: 'Caption', type: 'Text', stage: 0, req: true, pic: true },
      { label: 'Posting date', type: 'Date', stage: 0, req: true, pic: true, cal: { kind: 'post', pic: true } },
      { label: 'Platform', type: 'Select', stage: 2, req: false, pic: false, opts: ['Instagram', 'TikTok'] },
      { label: 'Budget', type: 'Number', stage: 0 },
    ] },
    { title: 'Internal notes', stage: null, fields: [{ label: 'Notes', type: 'Text', stage: 2 }] },
  ],
}

describe('what the builder reads', () => {
  it('the canvas as the database keeps it; a kind of answer the canvas does not offer is left out', () => {
    const c = canvasFromRow(ROW)
    expect(c.req).toEqual({ pic: false })
    expect(c.sections.map(s => [s.emoji, s.title, s.stage, s.locked, s.req, s.pic])).toEqual([['💬', 'Caption', 0, true, true, true], ['📝', 'Internal notes', null, false, false, false]])
    expect(c.sections[0].fields.map(f => f.label)).toEqual(['Caption', 'Posting date', 'Platform'])
    expect(c.sections[0].fields[1].cal).toEqual({ kind: 'post', pic: true })
    expect(c.sections[0].fields[2].opts).toEqual(['Instagram', 'TikTok'])
  })

  it('nothing kept yet: the empty canvas, the Requirements shown to the PIC', () => {
    expect(canvasFromRow(null)).toEqual(EMPTY_CANVAS)
    expect(canvasFromRow({ sections: 'x' })).toEqual(EMPTY_CANVAS)
  })

  it('a stage’s section and its fields’ settings', () => {
    const s = wfStageFromRow({ name: 'Shoot', dept: 'content', sla: 1, sec: { emoji: '🎬', locked: true, req: false, pic: false },
      form: [{ label: 'Day', type: 'Date', req: false, pic: true, cal: { kind: 'ads_live', label: 'Ads go-live', pic: true } }, { label: 'Where', type: 'Select', opts: ['LRT'] }] })
    expect(s.sec).toEqual({ emoji: '🎬', locked: true, req: false, pic: false })
    expect(s.form[0]).toEqual({ label: 'Day', type: 'Date', req: false, pic: true, cal: { kind: 'ads_live', pic: true } })
    expect(s.form[1].opts).toEqual(['LRT'])
    expect(wfStageFromRow({ name: 'Old', dept: 'design', sla: 1 }).sec).toEqual({ emoji: '🎯', locked: false, req: true, pic: true })
  })
})

describe('what the builder sends', () => {
  it('a field’s settings, explicit: required and shown unless set, a note never required, a mark only on a date, options only on a choice', () => {
    expect(fieldExtras({ label: 'T', type: 'Text' })).toEqual({ req: true, pic: true })
    expect(fieldExtras({ label: 'N', type: 'Note', req: true })).toEqual({ req: false, pic: true })
    expect(fieldExtras({ label: 'D', type: 'Date', cal: { kind: 'report', pic: true } })).toEqual({ req: true, pic: true, cal: { kind: 'report', pic: true } })
    expect(fieldExtras({ label: 'S', type: 'Select' })).toEqual({ req: true, pic: true, opts: [] })
    expect(fieldExtras({ label: 'X', type: 'Text', cal: { kind: 'ads_end', pic: false }, opts: ['a'] })).toEqual({ req: true, pic: true })
  })

  it('the canvas without the page’s keys', () => {
    const p = canvasPayload(canvasFromRow(ROW)) as { req: unknown; sections: { fields: Record<string, unknown>[] }[] }
    expect(p.req).toEqual({ pic: false })
    expect(p.sections[0].fields[2]).toEqual({ label: 'Platform', type: 'Select', stage: 2, req: false, pic: false, opts: ['Instagram', 'TikTok'] })
    expect(JSON.stringify(p)).not.toContain('"key"')
  })

  it('a new kind of answer: options for a choice, a calendar mark only on a date', () => {
    const d: FormField = { label: 'Day', type: 'Date', cal: { kind: 'ads_live', pic: false } }
    expect(withType(d, 'Select')).toEqual({ label: 'Day', type: 'Select', opts: [] })
    expect(withType({ label: 'P', type: 'Select', opts: ['a'] }, 'Text')).toEqual({ label: 'P', type: 'Text' })
  })

  it('a new section (the handoff’s): New section, 📝, a Notes field filled in at the last stage', () => {
    const s = newCanvasSection(3)
    expect([s.title, s.emoji, s.stage, s.locked, s.req, s.pic]).toEqual(['New section', '📝', null, false, false, false])
    expect(s.fields.map(f => [f.label, f.type, f.stage, f.req, f.pic])).toEqual([['Notes', 'Text', 2, false, false]])
    expect(newCanvasSection(0).fields[0].stage).toBeNull()
  })

  it('a field’s marks on the canvas', () => {
    expect(fieldFlags({ label: 'D', type: 'Date', cal: { kind: 'meeting', pic: false } })).toBe('⭐ 👁 📅')
    expect(fieldFlags({ label: 'T', type: 'Text', req: false, pic: false })).toBe('🔒')
    expect(fieldFlags({ label: 'N', type: 'Note' }, false)).toBe('')
  })
})

describe('the stages change, the canvas follows', () => {
  const c = canvasFromRow(ROW)
  it('a stage moved: the sections and fields go with it', () => {
    const moved = [STAGES[2], STAGES[0], STAGES[1]]
    const next = canvasRemap(c, stageMap(STAGES, moved))
    expect(next.sections[0].stage).toBe(1)
    expect(next.sections[0].fields.map(f => f.stage)).toEqual([1, 1, 0])
    expect(next.sections[1].fields[0].stage).toBe(0)
  })

  it('a stage taken out: what was its belongs to none until picked again', () => {
    const next = canvasRemap(c, stageMap(STAGES, [STAGES[0], STAGES[1]]))
    expect(next.sections[0].fields.map(f => f.stage)).toEqual([0, 0, null])
    expect(next.sections[1].fields[0].stage).toBeNull()
  })
})

describe('what publishing refuses', () => {
  const ok = canvasFromRow(ROW)
  it('a canvas in order may be published', () => {
    expect(canvasProblems(STAGES, ok)).toEqual([])
    expect(canvasProblems(STAGES, EMPTY_CANVAS)).toEqual([])
  })

  it('every section named, a field once in its section and named, each with its stage', () => {
    const c = (patch: (x: WfCanvas) => void) => {
      const x = structuredClone(ok)
      patch(x)
      return canvasProblems(STAGES, x)
    }
    expect(c(x => { x.sections[0].title = ' ' })).toEqual(['A section has no name'])
    expect(c(x => { x.sections[0].fields[1].label = 'Caption' })).toEqual(['Each field in a section needs its own name'])
    expect(c(x => { x.sections[0].fields[0].label = '' })).toEqual(['Each field in a section needs its own name'])
    expect(c(x => { x.sections[1].fields[0].stage = null })).toEqual(['A field has no stage to fill it in'])
    expect(c(x => { x.sections[1].fields[0].stage = 7 })).toEqual(['A field has no stage to fill it in'])
  })

  it('every choice with options, each once — a stage’s own too', () => {
    const noOpts = structuredClone(ok)
    noOpts.sections[0].fields[2].opts = [' ']
    expect(canvasProblems(STAGES, noOpts)).toEqual(['A choice has no options'])
    const stages = [...STAGES.slice(0, 2), stage({ key: 'c', name: 'Edit', form: [{ label: 'Where', type: 'Multi-select', opts: ['LRT', 'lrt '] }] })]
    expect(canvasProblems(stages, ok)).toEqual(['An option is there twice'])
  })
})

describe('the preview', () => {
  const c = canvasFromRow(ROW)
  it('as the staff see it at a stage: every section, those not theirs faded', () => {
    const v = staffView(STAGES, c, 2)
    expect(v.map(s => [s.title, s.mine])).toEqual([
      ['Requirements', true], ['Script', false], ['Shoot', false], ['Edit', true], ['Caption', true], ['Internal notes', true],
    ])
    expect(v[2].badges).toEqual(['🔒', '🎯 Shoot'])
    expect(v[2].cols).toEqual(['Shot'])
    expect(v[4].badges).toEqual(['🔒', '⭐', '🎯 Script', '👁'])
  })

  it('as the PIC sees it on the link: only what is shown, the dates on their calendar, what is left out', () => {
    const v = picView(STAGES, c)
    expect(v.sections.map(s => [s.title, s.fields])).toEqual([
      ['Script', ['Topic', 'Read the brief']],
      ['Edit', []],
      ['Caption', ['Caption', 'Posting date']],
    ])
    expect(v.calendar).toEqual([{ label: 'Post day', kind: 'post', from: 'Posting date' }])
    expect(v.hidden).toBe('Hidden: Requirements, Shoot, Internal notes, 2 internal fields.')
  })
})
