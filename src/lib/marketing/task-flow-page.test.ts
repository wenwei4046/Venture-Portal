import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from './task'
import type { MktBoard } from './board'
import { boardLoads, flowFromPage, rowsFromValue, rowsToValue } from './task-flow-page'

// 2026-11-13 — a running task (mkt_project) as the task page's new top draws it: its levels, where it stands, its
// fields as sections, its tables' rows, what the engine adds when it gives it.

const page = (extra: Record<string, unknown> = {}, stage: Record<string, unknown> = {}) => taskFromRow({
  today: '2026-10-26', me: 's-siti',
  team: [{ id: 's-rachel', user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER' }, { id: 's-siti', user: 'u2', full: 'SITI', first: 'Siti', title: 'GRAPHIC' }],
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', qType: 'social', owner: 's-rachel', cur: 0,
    startsOn: '2026-10-23', dueOn: '2026-10-28', free: [] },
  stages: [{ project: 'p1', idx: 0, name: 'Design', dept: 'design', owner: 's-siti', sla: 2, appr: [{ kind: 'person', staff: 's-rachel' }, { kind: 'pic' }],
    spec: { form: [{ label: 'Art', type: 'File' }, { label: 'Size', type: 'Text', req: false }, { label: 'Specs', type: 'Table', cols: [{ name: 'W', type: 'Number' }, { name: 'H', type: 'Number' }], rows: [['1080', '']] }] },
    work: { vals: { Size: 'A4' } }, dueOn: '2026-10-27', status: 'review', apprIdx: 1, ver: 1, enteredAt: '2026-10-23T01:00:00Z', ...stage }],
  events: [{ id: 1, at: '2026-10-23T01:00:00Z', actor: 'Rachel', action: 'created' }], holidays: [], ...extra,
}) as MktTaskPage

describe('a running task as the new top draws it', () => {
  it('its approvers as levels of one, where it stands, its fields as the stage’s section', () => {
    const t = flowFromPage(page())
    expect(t.stages[0].levels).toEqual([{ ids: ['s-rachel'], rule: 'any' }, { ids: ['pic'], rule: 'any' }])
    expect(t.at).toEqual({ cur: 0, level: 1, ok: {}, done: false })
    expect(t.sections).toHaveLength(1)
    expect(t.sections[0].fields.map(f => [f.id, f.req])).toEqual([['0:Art', true], ['0:Size', false], ['0:Specs', true]])
    expect(t.values['0:Size']).toBe('A4')
    expect(t.rows['0:Specs']).toEqual([{ id: 'r0', added: false, cells: { c0: '1080', c1: '' } }])
    expect([t.deadline, t.pic, t.people.map(p => p.name)]).toEqual(['2026-10-28', 'Kelvin', ['Rachel', 'Siti']])
    expect(t.log).toHaveLength(1)
  })
  it('reads the engine’s levels {ids, rule}, who approved the level now and the task’s own columns when it gives them', () => {
    const p = page({}, { apprIdx: 0, levels: [{ ids: ['s-rachel', 's-siti'], rule: 'all' }], apprOk: { 's-rachel': '2026-10-24T00:00:00Z' } })
    p.project.extraCols = { Specs: [{ id: 'x1', name: 'Note', type: 'Text', by: 's-siti', stage: 0 }] }
    p.project.wf = { category: 'Poster', tname: 'Standard', version: 3 }
    const t = flowFromPage(p)
    expect(t.tplChip).toBe('Poster · Standard v3')
    expect(t.stages[0].levels).toEqual([{ ids: ['s-rachel', 's-siti'], rule: 'all' }])
    expect(t.at.ok).toEqual({ 's-rachel': '2026-10-24T00:00:00Z' })
    expect(t.sections[0].fields[2].cols.map(c => [c.id, c.added])).toEqual([['c0', false], ['c1', false], ['x1', true]])
  })
  it('done: done at the last stage’s finish', () => {
    const t = flowFromPage(page({ project: { id: 'p1', trackId: 'T', kind: 'quick', sub: 'sub', title: 'x', status: 'done', cur: 0, free: [] } }, { status: 'done', doneAt: '2026-10-27T03:00:00Z' }))
    expect([t.at.done, t.doneAt]).toEqual([true, '2026-10-27T03:00:00Z'])
  })
})

describe('a table’s rows kept in the stage’s work', () => {
  it('written as a list of cells by column, and read back — the template’s rows until then', () => {
    const f = { cols: [{ name: 'A', type: 'Text' as const }, { name: 'B', type: 'Checkbox' as const }], rows: [['x', '']] }
    expect(rowsFromValue(f, undefined)).toEqual([{ id: 'r0', added: false, cells: { c0: 'x', c1: false } }])
    const value = rowsToValue({ cols: [{ id: 'c0', name: 'A', type: 'Text', stage: 0, req: false, pic: true, added: false }, { id: 'c1', name: 'B', type: 'Checkbox', stage: 0, req: false, pic: true, added: false }] },
      [{ id: 'r0', added: false, cells: { c0: 'x', c1: true } }, { id: 'n', added: true, cells: { c0: 'y' } }])
    expect(value).toBe('[["x","true"],["y",""]]')
    expect(rowsFromValue(f, value)).toEqual([{ id: 'r0', added: false, cells: { c0: 'x', c1: true } }, { id: 'r1', added: true, cells: { c0: 'y', c1: false } }])
    expect(rowsFromValue(f, '[not json')).toEqual([])
  })
})

// 2026-11-13 — the engine's parts: a field names its canvas section by id (sectionTitle its words); none named, its stage's
// own; the stage's PIC words; each person's open load for the reassign modal.
describe('canvas sections, the PIC’s words, the loads', () => {
  it('joins each field to the canvas section it names — else its stage’s own', () => {
    const p = taskFromRow({
      today: '2026-10-26', me: 's-siti', team: [],
      project: { id: 'p1', trackId: 'T', kind: 'deliverable', sub: 'sub', title: 'x', status: 'active', cur: 0, free: [],
        sections: [{ id: 'sec-a', emoji: '🎬', title: 'Shot list', stage: null }, { id: 'sec-d', emoji: '🎯', title: 'Design', stage: 'dsg' }] },
      stages: [{ project: 'p1', idx: 0, name: 'Design', sid: 'dsg', owner: 's-siti', sla: 1, appr: [], status: 'accepted', picText: 'Design team is on it',
        spec: { form: [{ id: 'f1', label: 'Shots', type: 'Text', section: 'sec-a', sectionTitle: 'Shot list' }, { id: 'f2', label: 'Art', type: 'File' },
          { id: 'f3', label: 'Old', type: 'Text', section: 'Legacy box' }] }, work: {} }],
      events: [], holidays: [],
    }) as MktTaskPage
    const t = flowFromPage(p)
    expect(t.sections.map(s => [s.title, s.fields.map(f => f.label)])).toEqual([['Shot list', ['Shots']], ['Design', ['Art']], ['Legacy box', ['Old']]])
    expect(t.stages[0].picText).toBe('Design team is on it')
  })
  it('a load a person: the doer of the stage now, the people its level still waits for', () => {
    const projects = [{ id: 'a', status: 'active', kind: 'quick', series: null, cur: 0 }, { id: 'b', status: 'active', kind: 'quick', series: null, cur: 1 }, { id: 'c', status: 'done', kind: 'quick', series: null, cur: 0 }]
    const st = (project: string, idx: number, extra: Record<string, unknown>) => ({ project, idx, owner: 'x', status: 'accepted', levels: [], apprIdx: 0, apprOk: {}, ...extra })
    const loads = boardLoads({
      projects: projects as unknown as MktBoard['projects'],
      stages: [st('a', 0, { owner: 'ali' }), st('b', 0, { owner: 'ali', status: 'done' }),
        st('b', 1, { status: 'review', levels: [{ ids: ['rachel', 'daniel', 'pic'], rule: 'all' }], apprOk: { rachel: 't' } }), st('c', 0, { owner: 'ali' })] as unknown as MktBoard['stages'],
    })
    expect(loads).toEqual({ ali: 1, daniel: 1 })
  })
})
