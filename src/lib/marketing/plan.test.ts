import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from './task'
import {
  datesLabel, firstStart, planChanged, planCrew, planDates, planFromTask, planOpen, planPayload, planProblems, planSummary, reasonsNeeded,
  stageEditable, unassigned,
} from './plan'

// 2026-10-24 — a deliverable's Assignment Plan (②b-2a, `Assignment Plan.dc.html`; the user's answer 10): the plan read
// from the deliverable, its dates as the database counts them, the summary, who is on it, what stops Save, the reasons
// a change of hands needs once it has opened, and what mkt_deliverable_plan takes. The database's side:
// tests/member-sql/validate-marketing-deliverables.mjs.

const ALI = 's-ali', MEI = 's-mei', JOSIAH = 's-josiah'
const team = [
  { id: JOSIAH, full: 'SIA JOSIAH', first: 'SIA', title: 'MARKETING MANAGER' },
  { id: MEI, full: 'MEI LING', first: 'Mei', title: 'VIDEOGRAPHER' },
  { id: ALI, full: 'ALI HASSAN', first: 'Ali', title: 'GRAPHIC DESIGNER' },
]
const stage = (idx: number, over: Record<string, unknown>) => ({
  project: 'd1', idx, name: `Stage ${idx}`, dept: 'GRAPHIC DESIGNER', mode: 'assign', cands: [], sla: 1, appr: [], split: false,
  spec: { form: [] }, work: {}, status: 'planned', ...over,
})
function page(over: Record<string, unknown> = {}, stages = [
  stage(0, { name: 'Design', sla: 2, appr: [{ kind: 'pic' }] }),
  stage(1, { name: 'Caption', dept: 'VIDEOGRAPHER', mode: 'prev', cands: [ALI, MEI], appr: [{ kind: 'person', staff: JOSIAH }] }),
  stage(2, { name: 'Publish', dept: 'VIDEOGRAPHER', appr: [{ kind: 'assign' }], split: true }),
]): MktTaskPage {
  return taskFromRow({
    today: '2026-10-26', me: JOSIAH, team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'd1', trackId: 'MKT-CAR-2610-007-D01', kind: 'deliverable', sub: 'sub', title: 'Image post 1/2', status: 'planning', cur: 0,
      parent: { id: 'p1', trackId: 'MKT-CAR-2610-007', title: 'Carres · Social Pack', status: 'active' },
      deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 2 }, locked: false, free: [], ...over },
    stages, events: [],
    holidays: [{ day: '2026-11-03', name: 'Selangor day' }],
  }) as MktTaskPage
}

describe('a deliverable’s Assignment Plan', () => {
  it('reads the deliverable: its product, what it is of it, each stage as its template has it', () => {
    const pg = page()
    expect([pg.project.kind, pg.project.parentProject?.trackId, pg.project.deliv, pg.project.locked])
      .toEqual(['deliverable', 'MKT-CAR-2610-007', { group: 'Graphic design', item: 'Image post', n: 1, of: 2 }, false])
    const d = planFromTask(pg)
    expect(d.start).toBe('') // not planned: no start day yet
    expect(d.stages.map(s => [s.name, s.mode, s.owner, s.appr, s.split])).toEqual([
      ['Design', 'assign', null, [{ kind: 'pic' }], false],
      ['Caption', 'prev', null, [{ kind: 'person', staff: JOSIAH }], false],
      ['Publish', 'assign', null, [{ kind: 'assign' }], true],
    ])
    // A locked template leaves nothing to the stage before and no subtasks.
    expect(planFromTask(page({ locked: true })).stages.map(s => [s.mode, s.split])).toEqual([['assign', false], ['assign', false], ['assign', false]])
  })

  it('counts its dates as the database does: the start day, each stage’s days, weekends and holidays skipped', () => {
    const d = { ...planFromTask(page()), start: '2026-11-02' }
    const dates = planDates(d, new Set(['2026-11-03']))
    expect(dates.map(x => [x.startsOn, x.dueOn])).toEqual([['2026-11-02', '2026-11-05'], ['2026-11-06', '2026-11-06'], ['2026-11-09', '2026-11-09']])
    expect([datesLabel(dates[0]), datesLabel(dates[1])]).toEqual(['2 Nov → 5 Nov', 'Fri 6 Nov'])
    expect(planSummary(d, page().holidays)).toEqual({ days: 4, pic: 1, internal: 2, starts: 'Mon 2 Nov', finishes: 'Mon 9 Nov', skipped: 'Selangor day' })
    expect(planSummary({ ...d, start: '2026-11-16' }, page().holidays).skipped).toBe('none in this range')
  })

  it('says what stops Save: the start day, a stage with nobody on it, an approval still to pick', () => {
    const pg = page()
    const saved = planFromTask(pg)
    expect(planProblems(saved, saved, false, '2026-10-26', {})).toEqual([
      'Pick the day it starts', '2 stages unassigned', 'Stage 3 (Publish): pick who approves it',
    ])
    // Caption is the stage before's to pick: not unassigned.
    expect(saved.stages.map(unassigned)).toEqual([true, false, true])
    const d = { start: '2026-10-25', stages: saved.stages.map((s, i) => (i === 0 ? { ...s, owner: ALI } : i === 2 ? { ...s, owner: MEI, appr: [{ kind: 'person' as const, staff: JOSIAH }] } : s)) }
    expect(planProblems(saved, d, false, '2026-10-26', {})).toEqual(['Pick the day it starts — today or later'])
    expect(planProblems(saved, { ...d, start: '2026-11-02' }, false, '2026-10-26', {})).toEqual([])
  })

  it('once open: the start day stays, a change of hands says why, a stage done or waiting keeps its people', () => {
    const live = page({ status: 'active', startsOn: '2026-10-26', cur: 1 }, [
      stage(0, { name: 'Design', owner: ALI, status: 'done' }),
      stage(1, { name: 'Caption', owner: MEI, status: 'accepted' }),
      stage(2, { name: 'Publish', owner: MEI, status: 'planned' }),
    ])
    expect(planOpen(live)).toBe(true)
    expect(planOpen(page({ status: 'active', startsOn: '2026-11-02' }))).toBe(false)
    const saved = planFromTask(live)
    expect(saved.stages.map(s => stageEditable(s, true))).toEqual([
      { people: false, days: false, split: false }, { people: true, days: false, split: true }, { people: true, days: true, split: true },
    ])
    expect(stageEditable({ ...saved.stages[1], status: 'review' }, true).people).toBe(false)
    const moved = { ...saved, stages: saved.stages.map((s, i) => (i === 1 ? { ...s, owner: ALI } : s)) }
    expect(reasonsNeeded(saved, moved, true)).toEqual([1])
    expect(reasonsNeeded(saved, moved, false)).toEqual([])
    expect(planProblems(saved, moved, true, '2026-10-26', {})).toEqual(['Stage 2 (Caption): say why it changes hands'])
    expect(planProblems(saved, moved, true, '2026-10-26', { 1: 'MC' })).toEqual(['Stage 2 (Caption): say why it changes hands'])
    expect(planProblems(saved, moved, true, '2026-10-26', { 1: 'Mei is on MC' })).toEqual([])
    expect(planPayload(moved, { 1: ' Mei is on MC ', 2: 'not asked' }, [1])).toEqual({
      start: '2026-10-26',
      stages: [
        { owner: ALI, extra: null, appr: [], sla: 1, split: false },
        { owner: ALI, extra: null, appr: [], sla: 1, split: false },
        { owner: MEI, extra: null, appr: [], sla: 1, split: false },
      ],
      reasons: { 1: 'Mei is on MC' },
    })
    expect(planChanged(saved, saved, false)).toBe(false)
    expect(planChanged(saved, moved, false)).toBe(true)
    expect(planChanged(saved, saved, true)).toBe(true) // a plan never saved always has something to save
  })

  it('names who is on it — each person and approver once, then the PIC', () => {
    const d = planFromTask(page())
    const planned = { ...d, stages: d.stages.map((s, i) => (i === 0 ? { ...s, owner: ALI } : i === 2 ? { ...s, owner: ALI, appr: [{ kind: 'person' as const, staff: JOSIAH }] } : s)) }
    expect(planCrew(planned, page().team, 'Kelvin').map(c => c.name)).toEqual(['Ali', 'SIA', 'Kelvin (PIC)'])
  })

  it('offers tomorrow to start — or the next working day after it', () => {
    expect(firstStart('2026-10-26', new Set())).toBe('2026-10-27')
    expect(firstStart('2026-10-30', new Set(['2026-11-02']))).toBe('2026-11-03') // Fri → past the weekend and a holiday
  })
})
