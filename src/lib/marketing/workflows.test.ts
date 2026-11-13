import { describe, expect, it } from 'vitest'
import { EMPTY_CANVAS, type WfCanvas } from './canvas'
import { DEFAULT_OVERDUE, defaultFinish } from './flow'
import {
  publishFixups,
  activeNote, apprSummary, apprText, asRun, editOf, endWhen, firstWfStage, gifPath, insertWfStage, lockNote, mayApprove, moveWfStage, newWfStage,
  nextHue, nextIcon, nextTemplateName, onApprove, publishDiff, publishImpact, removeWfStage, roleOf, timeBar, totalDays, wfPatch, wfPeople,
  wfProblems, wfStageFromRow, wfStagesPayload, wfWarnings, whoSummary, workflowBookFromRow, type WfStage,
} from './workflows'

// The Workflow Builder 2a's pure side (2026-11-13): the shapes mkt_workflows() hands over, what the builder draws
// from a template (warnings with their Fix, what publishing refuses, the publish review's diff, the time bar, the end),
// and what a save sends. The database's side: tests/member-sql/validate-marketing-wf-builder-v2.mjs.

const RACHEL = 'r0000000-0000-4000-8000-000000000001'
const DANIEL = 'r0000000-0000-4000-8000-000000000002'
const SITI = 'r0000000-0000-4000-8000-000000000003'
const names: Record<string, string> = { [RACHEL]: 'Rachel', [DANIEL]: 'Daniel', [SITI]: 'Siti' }
const nameOf = (id: string) => names[id] ?? '?'
const st = (sid: string, p: Partial<WfStage> = {}): WfStage =>
  ({ sid, name: sid, dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '', ...p })

describe('reading the builder', () => {
  it('reads categories, groups and each template with its overdue rule, finish and last version', () => {
    const b = workflowBookFromRow({
      categories: [{ id: 'c1', name: 'Reels video', emoji: '🎞️', sort: 1 }],
      groups: [{ key: 'content', name: 'Content', hue: 295 }],
      workflows: [{
        id: 'w1', categoryId: 'c1', action: 'Reels video', tname: 'Full', promise: 10, rev: 3, version: 2, changed: true, live: 4,
        draft: [{ sid: 'sa00001', name: 'Script', dept: 'content', who: { mode: 'prev', cands: [SITI] }, sla: 2, appr: [{ ids: [RACHEL, DANIEL], rule: 'all' }] }],
        pubStages: [{ sid: 'sa00001', name: 'Script', sla: 1, appr: [{ kind: 'person', staff: RACHEL }] }], pubPromise: 9,
        overdue: { days: 3, notify: ['mm'], action: 'reassign', repeat: false }, finish: { celebration: 'cheers' },
      }],
    })
    expect(b.categories).toEqual([{ id: 'c1', name: 'Reels video', emoji: '🎞️', sort: 1 }])
    const t = b.templates[0]
    expect([t.category, t.categoryId, t.version, t.live]).toEqual(['Reels video', 'c1', 2, 4])
    expect(t.draft[0].appr).toEqual([{ ids: [RACHEL, DANIEL], rule: 'all' }])
    expect(t.published).toEqual({ stages: [expect.objectContaining({ sid: 'sa00001', appr: [{ ids: [RACHEL], rule: 'any' }] })], promise: 9 })
    expect(t.overdue).toEqual({ days: 3, notify: ['mm'], action: 'reassign', repeat: false })
    expect(t.finish).toEqual({ ...defaultFinish('Reels video'), celebration: 'cheers' })
  })
  it('falls back to Marketing’s five groups, and gives a stage without a key one', () => {
    expect(workflowBookFromRow({}).groups.map(g => g.key)).toEqual(['content', 'social', 'design', 'ads', 'brand'])
    expect(wfStageFromRow({ name: 'x' }).sid).toMatch(/^s[a-z0-9]{6,}$/)
  })
  it('reads the roster’s load off its hint; MM, AMM and a Director approve', () => {
    expect(wfPeople([{ id: 'a', first: 'Ali', hint: 'CONTENT CREATOR · 3 active', group: 'CONTENT CREATOR' }])).toEqual([{ id: 'a', first: 'Ali', title: 'CONTENT CREATOR', load: 3 }])
    expect(['MARKETING MANAGER', 'ASSISTANT MARKETING MANAGER', 'MARKETING DIRECTOR', 'GRAPHIC DESIGNER'].map(mayApprove)).toEqual([true, true, true, false])
    expect(['MARKETING MANAGER', 'ASSISTANT MARKETING MANAGER', 'SALES DIRECTOR'].map(roleOf)).toEqual(['MM', 'AMM', 'Director'])
  })
})

describe('what the cards and sections say', () => {
  const s = st('sb00001', { appr: [{ ids: [RACHEL, DANIEL], rule: 'all' }, { ids: ['pic'], rule: 'any' }] })
  it('approved by: & for everyone, or for any one, → between levels', () => {
    expect(apprText(s.appr, nameOf)).toBe('Rachel & Daniel → PIC')
    expect(apprText([{ ids: [RACHEL, 'assign'], rule: 'any' }], nameOf)).toBe('Rachel or Assigned')
    expect(apprText([], nameOf)).toBe('—')
    expect(apprSummary(s.appr, nameOf)).toBe('Rachel & Daniel → 🔗 PIC')
    expect(apprSummary([], nameOf)).toBe('No approval')
  })
  it('who does it, the lock turning a handoff into MM assigns', () => {
    const h = st('sc00001', { who: { mode: 'prev', cands: [SITI] } })
    expect(whoSummary(h, 2, false, nameOf)).toBe("🔓 Stage 2's person picks · Siti")
    expect(whoSummary({ ...h, who: { mode: 'prev', cands: [] } }, 2, false, nameOf)).toBe('🔓 Handoff · shortlist empty')
    expect(whoSummary(h, 2, true, nameOf)).toBe('👤 MM assigns when planning')
  })
  it('after approval: the next stage, or the task done; Done when reads the last stage', () => {
    const two = [s, st('sd00001', { name: 'Final' })]
    expect(onApprove(two, 0)).toBe('Approved → Stage 2 · Final')
    expect(onApprove(two, 1)).toBe('Submitted → task done')
    expect(endWhen(two, nameOf)).toBe('Stage 2 · Final is submitted (no approval)')
    expect(endWhen([s], nameOf)).toBe('Stage 1 · sb00001 is approved by Rachel & Daniel → PIC')
    expect(endWhen([], nameOf)).toBe('Add a stage first')
  })
})

describe('warnings and what publishing refuses', () => {
  const handoff = st('se00001', { who: { mode: 'prev', cands: [] } })
  it('the four warnings, each with what its Fix opens', () => {
    const w = wfWarnings([st('sf00001', { sla: 4 }), handoff], false, 3)
    expect(w.map(x => [x.text, x.fix])).toEqual([
      ['Stage 2 · 🔓 handoff has no shortlist', { section: 'who', at: 1 }],
      ['Longer than product promise (5 > 3 days)', null],
      ['No approval in this workflow', { section: 'appr', at: 1 }],
    ])
    const pic = (sid: string) => st(sid, { appr: [{ ids: ['pic'], rule: 'any' }] })
    expect(wfWarnings([pic('sg00001'), pic('sg00002'), pic('sg00003')], false, null).map(x => [x.text, x.fix])).toEqual([['PIC approves 3+ times', { section: 'appr', at: 2 }]])
  })
  it('locked: the handoffs run as MM assigns, so no shortlist warning', () => {
    expect(wfWarnings([st('sh00001', { appr: [{ ids: [RACHEL], rule: 'any' }] }), handoff], true, null)).toEqual([])
    expect(asRun([handoff, st('si00001', { split: true })], true).map(x => [x.who.mode, x.split])).toEqual([['assign', false], ['assign', false]])
    expect(lockNote([handoff, st('si00001', { split: true }), st('sj00001')])).toBe(
      'MM assigns every stage when planning. Handoffs and subtasks are off on 2 stages — their settings come back if you switch to “Handoffs allowed”.')
  })
  it('refuses only the basics (2026-11-13): a stage, every stage named', () => {
    expect(wfProblems([], false)).toEqual(['Add a stage'])
    expect(wfProblems([st('sm00001', { name: ' ' })], false)).toEqual(['A stage has no name'])
    expect(wfProblems([st('sm00002', { appr: [{ ids: [], rule: 'any' }], who: { mode: 'prev', cands: [] } })], false)).toEqual([])
  })
  it('says what publishing will tidy, as mkt_wf_publish_ready does', () => {
    const team = new Set([RACHEL, SITI])
    const approvers = new Set([RACHEL])
    const canvas: WfCanvas = { req: { pic: true }, sections: [{ id: 'c1', emoji: '🎯', title: 'S', stage: null, locked: false, req: false, pic: false,
      fields: [{ id: 'f1', label: 'Body', type: 'Text', stage: null, req: true, pic: true }] }] }
    const f = publishFixups([st('sk00001', { appr: [{ ids: [], rule: 'any' }, { ids: [SITI], rule: 'any' }] }), st('sk00002', { who: { mode: 'prev', cands: [DANIEL, SITI] } })], false, team, approvers, canvas)
    expect([...f].sort()).toEqual(['An approval level with nobody on it is left out', 'An approver who is not a Marketing manager or a Director is left out',
      'Somebody who left the team comes off a shortlist', 'Canvas: unfinished fields are tidied on publish'].sort())
    expect(publishFixups([st('sl00001', { who: { mode: 'prev', cands: [SITI] } })], false, team, approvers, EMPTY_CANVAS)).toEqual(['Stage 1 runs as MM assigns — no stage before it'])
    expect(publishFixups([st('sn00001'), st('sn00002', { who: { mode: 'prev', cands: [DANIEL] } })], false, team, approvers, EMPTY_CANVAS))
      .toEqual(['A 🔓 handoff whose shortlist has left the team runs as MM assigns'])
  })
})

describe('the publish review', () => {
  const base = { stages: [st('s1x0001', { name: 'Script', sla: 2 }), st('s2x0001', { name: 'Edit' }), st('s3x0001', { name: 'Final' })], promise: 6 }
  it('lists what changed against the version running now, by stage key', () => {
    const now = {
      stages: [
        st('s2x0001', { name: 'Editing', sla: 3, dept: 'design', who: { mode: 'prev', cands: [SITI] }, appr: [{ ids: [RACHEL], rule: 'any' }], picText: 'Editing now' }),
        st('s1x0001', { name: 'Script', sla: 2 }),
        st('s4x0001', { name: 'Thumbnail' }),
      ],
      promise: 8,
    }
    const groups = (k: string) => ({ content: 'Content', design: 'Design' })[k] ?? k
    expect(publishDiff(base, now, nameOf, groups).map(c => [c.icon, c.text, c.tone])).toEqual([
      ['✎', 'Renamed “Edit” → “Editing”', 'ink'],
      ['⏱', 'Editing: 1 → 3 working days', 'ink'],
      ['👤', 'Editing: MM assigns → handoff (Siti)', 'ink'],
      ['✓', 'Editing approval: no approval → Rachel', 'ink'],
      ['●', 'Editing: group Content → Design', 'ink'],
      ['🔗', 'Editing: PIC now sees “Editing now”', 'ink'],
      ['+', 'Added stage 3 · Thumbnail', 'add'],
      ['−', 'Removed Final', 'remove'],
      ['⇅', 'Stage order changed', 'ink'],
      ['📅', 'Promise 6 → 8 working days', 'ink'],
    ])
    expect(publishDiff(base, base, nameOf, groups)).toEqual([])
  })
  it('who is affected; the foot’s note', () => {
    expect(publishImpact(2, 12)).toBe('12 active tasks stay on v2 and finish as they are. Every task started after you publish uses v3.')
    expect(publishImpact(0, 0)).toBe('No tasks use this template yet. New tasks will use v1.')
    expect([activeNote(2, 1), activeNote(0, 0)]).toEqual(['1 active task stay on v2', 'Never published'])
  })
})

describe('the time bar', () => {
  it('each stage sla ÷ (max(total, promise) + 1), the promise line, over when longer, each stage’s first day', () => {
    const b = timeBar([st('sm00001', { sla: 2 }), st('sm00002', { sla: 3 })], 4)
    expect(b.segments.map(s => Math.round(s.w))).toEqual([33, 50])
    expect(Math.round(b.promiseLeft ?? 0)).toBe(67)
    expect([b.over, b.starts]).toEqual([true, [0, 2]])
    expect(timeBar([st('sm00003')], null).promiseLeft).toBeNull()
    expect(totalDays([st('sm00001', { sla: 2 }), st('sm00002', { sla: 3 })])).toBe(5)
  })
})

describe('stages added, moved, taken out', () => {
  const s = [st('sa', { name: 'A' }), st('sb', { name: 'B' }), st('sc', { name: 'C', back: 1 })]
  it('where changes go back to follows the stage it named', () => {
    expect(moveWfStage(s, 1, 0).map(x => [x.sid, x.back])).toEqual([['sb', null], ['sa', null], ['sc', 0]])
    expect(insertWfStage(s, 0, st('sn')).map(x => x.back)).toEqual([null, null, null, 2])
    expect(removeWfStage(s, 1).map(x => x.back)).toEqual([null, null])
    expect(moveWfStage(s, 2, 0)[0].back).toBeNull()
  })
  it('a new stage beside another takes its group; a new template’s stage: its category, the PIC approves', () => {
    expect(newWfStage(st('sx', { dept: 'ads' }))).toMatchObject({ name: 'New stage', dept: 'ads', sla: 1, appr: [] })
    expect(firstWfStage('Reels video')).toMatchObject({ name: 'Reels video', sla: 2, appr: [{ ids: ['pic'], rule: 'any' }] })
    expect(nextTemplateName(['Standard', 'Template 2'])).toBe('Template 3')
    expect(nextIcon('🖼️')).toBe('🎞️')
    expect(nextHue([{ key: 'a', name: 'a', hue: 0 }, { key: 'b', name: 'b', hue: 0 }, { key: 'c', name: 'c', hue: 0 }, { key: 'd', name: 'd', hue: 0 }, { key: 'e', name: 'e', hue: 0 }])).toBe(60)
    expect(gifPath('Party Time!.GIF', 'u-1')).toBe('workflow/u-1/Party-Time.gif')
  })
})

describe('what a save sends', () => {
  const t = workflowBookFromRow({ workflows: [{ id: 'w', categoryId: 'c', action: 'Reels', tname: 'Full', draft: [st('so00001')], canvas: EMPTY_CANVAS }] }).templates[0]
  it('the stage shape the database takes', () => {
    expect(wfStagesPayload([st('sp00001', { sla: 40, appr: [{ ids: ['pic'], rule: 'any' }] })])).toEqual([
      { sid: 'sp00001', name: 'sp00001', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 30, appr: [{ ids: ['pic'], rule: 'any' }], split: false, back: null, picText: '' },
    ])
  })
  it('only what changed — the overdue rule and the finish too; nothing when nothing did', () => {
    const e = editOf(t)
    expect(wfPatch(e, e)).toBeNull()
    expect(wfPatch(e, { ...e, promise: 5, overdue: { ...DEFAULT_OVERDUE, days: 2 } })).toEqual({ promise: 5, overdue: { ...DEFAULT_OVERDUE, days: 2 } })
    expect(Object.keys(wfPatch(e, { ...e, finish: { ...e.finish, after: 'feedback' } }) ?? {})).toEqual(['finish'])
  })
})
