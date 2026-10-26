import { describe, expect, it } from 'vitest'
import { EMPTY_CANVAS } from './canvas'
import { moveStage, removeStage } from './tasks'
import {
  asRun, firstWfStage, newWfStage, nextTemplateName, picTimes, totalDays, wfActions, wfApprText, wfPatch, wfProblems, wfStagesPayload,
  wfWarnings, wfWhoText, workflowsFromRow, type WfStage,
} from './workflows'

// 2026-10-23 — the Workflow Builder (`Workflow Builder.dc.html`, ③ of the handoff): what the builder reads, warns of and
// refuses, held to what mkt_workflow_check refuses on publishing (tests/member-sql/validate-marketing-workflows.mjs).

const RACHEL = 's-rachel'
const SITI = 's-siti'
const AINA = 's-aina'
const team = new Set([RACHEL, SITI, AINA])
const nameOf = (id: string) => ({ [RACHEL]: 'Rachel', [SITI]: 'Siti', [AINA]: 'Aina' } as Record<string, string>)[id] ?? 'Someone who left'

const stage = (over: Partial<WfStage> = {}): WfStage => ({ ...newWfStage(undefined), name: 'Design', dept: 'design', ...over })

const row = {
  workflows: [
    { id: 'w1', action: 'Reels video', tname: 'Full production', emoji: '🎞️', note: 'Used by Ads and Social Media', promise: 10, locked: false,
      draft: [
        { name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ kind: 'person', staff: RACHEL }], split: false, back: null, picText: 'Content team is writing the script', form: [] },
        { name: 'Edit', dept: 'content', who: { mode: 'prev', cands: [SITI, AINA] }, sla: 3, appr: [], split: true, back: null, picText: '', form: [
          { label: 'Shot list', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Done', type: 'Checkbox' }], rows: [['Opening', ''], ['x']] },
        ] },
        { name: 'Final', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [{ kind: 'person', staff: RACHEL }, { kind: 'pic' }, { kind: 'boss' }], split: false, back: 1, picText: 'Ready for your approval', form: [] },
      ],
      rev: 5, version: 2, changed: false, publishedAt: '2026-10-23T01:00:00Z', publishedBy: 'Sia Josiah', updatedAt: '2026-10-23T01:00:00Z', updatedBy: 'Sia Josiah', live: 12 },
    { id: 'w2', action: 'Design photo', tname: 'Simple', emoji: '✨', note: null, promise: null, locked: true, draft: [], rev: 1, version: 0, changed: true, live: 0 },
    { id: 'w3', action: 'reels VIDEO', tname: 'Quick edit', emoji: '🎬', note: null, promise: 5, locked: false, draft: [], rev: 1, version: 1, changed: false, live: 4 },
  ],
}

describe('what the builder reads', () => {
  const wfs = workflowsFromRow(row)

  it('each template with its draft, count, version and the projects on it', () => {
    expect(wfs.map(w => [w.id, w.version, w.rev, w.changed, w.live])).toEqual([['w1', 2, 5, false, 12], ['w2', 0, 1, true, 0], ['w3', 1, 1, false, 4]])
    expect(wfs[0].draft[1].who).toEqual({ mode: 'prev', cands: [SITI, AINA] })
    expect(wfs[0].draft[2].appr).toEqual([{ kind: 'person', staff: RACHEL }, { kind: 'pic' }]) // an approval it cannot read is left out
    expect(wfs[0].draft[2].back).toBe(1)
    expect(wfs[1].note).toBe('')
    expect(wfs[1].promise).toBeNull()
  })

  it('a table keeps its preset rows, a cell per column', () => {
    expect(wfs[0].draft[1].form[0].rows).toEqual([['Opening', ''], ['x', '']])
  })

  it('groups the templates by action, whatever the case, the action’s emoji its first template’s', () => {
    expect(wfActions(wfs).map(a => [a.action, a.emoji, a.templates.map(t => t.id)])).toEqual([
      ['Reels video', '🎞️', ['w1', 'w3']],
      ['Design photo', '✨', ['w2']],
    ])
  })

  it('reads nothing as no templates', () => {
    expect(workflowsFromRow(null)).toEqual([])
    expect(workflowsFromRow({ workflows: 'x' })).toEqual([])
  })
})

describe('the lock, the foot and publishing', () => {
  const stages = workflowsFromRow(row)[0].draft

  it('locked, every stage is the manager’s to assign — no 🔓 hand-offs, no subtasks; the draft keeps them', () => {
    const run = asRun(stages, true)
    expect(run[1].who).toEqual({ mode: 'assign', cands: [] })
    expect(run[1].split).toBe(false)
    expect(stages[1].who.mode).toBe('prev')
    expect(asRun(stages, false)[1]).toEqual(stages[1])
  })

  it('the total and how often the PIC approves', () => {
    expect(totalDays(stages)).toBe(6)
    expect(picTimes(stages)).toBe(1)
  })

  it('warns as the handoff does: the PIC 3+ times, no approval at all, longer than the promise', () => {
    expect(wfWarnings(stages, false, 10)).toEqual([])
    expect(wfWarnings(stages, false, 5)).toEqual(['Longer than product promise (6 > 5 days)'])
    expect(wfWarnings([stage(), stage()], false, null)).toEqual(['No approval in this workflow'])
    const pics = [stage({ appr: [{ kind: 'pic' }] }), stage({ appr: [{ kind: 'pic' }] }), stage({ appr: [{ kind: 'pic' }] })]
    expect(wfWarnings(pics, false, null)).toEqual(['PIC approves 3+ times'])
  })

  it('refuses to publish what the database would', () => {
    expect(wfProblems(stages, false, team)).toEqual([])
    expect(wfProblems([], false, team)).toEqual(['Add a stage'])
    expect(wfProblems([stage({ name: ' ' })], false, team)).toEqual(['A stage has no name'])
    expect(wfProblems([stage({ who: { mode: 'prev', cands: [SITI] } })], false, team)).toEqual(['Stage 1 has no stage before it to pick'])
    expect(wfProblems([stage(), stage({ who: { mode: 'prev', cands: [] } })], false, team)).toEqual(['A 🔓 stage has no candidates'])
    expect(wfProblems([stage(), stage({ who: { mode: 'prev', cands: ['s-gone'] } })], false, team)).toEqual(['Somebody named has left the team'])
    expect(wfProblems([stage({ appr: [{ kind: 'person', staff: 's-gone' }] })], false, team)).toEqual(['Somebody named has left the team'])
    expect(wfProblems([stage({ form: [{ label: 'A', type: 'Text' }, { label: 'A', type: 'Date' }] })], false, team)).toEqual(['Each field needs its own name'])
    expect(wfProblems([stage({ form: [{ label: 'T', type: 'Table', cols: [{ name: '', type: 'Text' }] }] })], false, team)).toEqual(['A table column has no name'])
  })

  it('locked, a 🔓 stage asks nothing of its candidates', () => {
    expect(wfProblems([stage({ who: { mode: 'prev', cands: [] } }), stage({ who: { mode: 'prev', cands: ['s-gone'] } })], true, team)).toEqual([])
  })
})

describe('the words on a stage’s card', () => {
  it('who does it', () => {
    expect(wfWhoText(stage(), nameOf)).toBe('Pick at assignment')
    expect(wfWhoText(stage({ who: { mode: 'prev', cands: [SITI, AINA] } }), nameOf)).toBe('🔓 Previous stage picks from Siti / Aina')
    expect(wfWhoText(stage({ who: { mode: 'prev', cands: [] } }), nameOf)).toBe('🔓 Previous stage picks from …')
  })

  it('who approves it, in order', () => {
    expect(wfApprText([], nameOf)).toBe('— No approval')
    expect(wfApprText([{ kind: 'person', staff: RACHEL }, { kind: 'pic' }, { kind: 'assign' }], nameOf)).toBe('👤 Rachel → 🔗 PIC → 👤 Pick at assignment')
  })
})

describe('making and moving', () => {
  it('a new template starts with one stage named for its action — its group picked in the builder, two days, the PIC approves', () => {
    expect(firstWfStage('Design photo')).toMatchObject({ name: 'Design photo', dept: '', sla: 2, appr: [{ kind: 'pic' }], who: { mode: 'assign', cands: [] } })
  })

  it('a stage added takes the last one’s group — a People title', () => {
    expect(newWfStage(stage({ dept: 'SENIOR MARKETING EXECUTIVE' }))).toMatchObject({ name: 'New stage', dept: 'SENIOR MARKETING EXECUTIVE', sla: 1, appr: [], split: false, back: null })
  })

  it('a new template under an action is “Template n”, one not taken', () => {
    expect(nextTemplateName(['Standard'])).toBe('Template 2')
    expect(nextTemplateName(['Standard', 'template 3', 'Quick'])).toBe('Template 4')
  })

  it('where changes go back to follows the stages it names', () => {
    const a = stage({ name: 'A' })
    const b = stage({ name: 'B' })
    const c = stage({ name: 'C', back: 0 })
    expect(moveStage([a, b, c], 0, 1).map(s => [s.name, s.back])).toEqual([['B', null], ['A', null], ['C', 1]])
    expect(removeStage([a, b, c], 0).map(s => [s.name, s.back])).toEqual([['B', null], ['C', null]])
  })
})

describe('only what changed is saved', () => {
  const base = { tname: 'Standard', locked: false, promise: 10, stages: [stage({ key: 'k1' })], canvas: EMPTY_CANVAS }

  it('nothing changed: nothing to send', () => {
    expect(wfPatch(base, { ...base, stages: [{ ...base.stages[0], key: 'another key' }] })).toBeNull()
  })

  it('each part on its own', () => {
    expect(wfPatch(base, { ...base, tname: 'Full' })).toEqual({ tname: 'Full' })
    expect(wfPatch(base, { ...base, locked: true, promise: null })).toEqual({ locked: true, promise: null })
    const stages = [{ ...base.stages[0], sla: 3 }]
    expect(wfPatch(base, { ...base, stages })).toEqual({ stages: wfStagesPayload(stages) })
  })

  it('the stages as the database takes them: no keys, a table’s preset rows', () => {
    const s = stage({ form: [{ label: 'T', type: 'Table', cols: [{ name: 'A', type: 'Text' }] }, { label: 'L', type: 'Text' }] })
    expect(wfStagesPayload([s])).toEqual([{ name: 'Design', dept: 'design', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null,
      picText: '', form: [{ label: 'T', type: 'Table', cols: [{ name: 'A', type: 'Text' }], rows: [], req: true, pic: true }, { label: 'L', type: 'Text', req: true, pic: true }],
      sec: { emoji: '🎯', locked: false, req: true, pic: true } }])
  })
})
