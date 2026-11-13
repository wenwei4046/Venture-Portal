import { describe, expect, it } from 'vitest'
import { sampleStep, sampleTask, type PreviewDraft } from './task-flow-sample'
import { missingOf } from './task-flow-view'

// 2026-11-13 — the Builder's ▶ Preview: a sample task from the draft (nothing saved), its decisions played with `step`.

const NOW = new Date('2026-11-12T15:20:00+08:00')
const people = [
  { id: 'r', name: 'Rachel', role: 'MARKETING MANAGER', load: 6 },
  { id: 'd', name: 'Daniel', role: 'ASSISTANT MARKETING MANAGER', load: 4 },
  { id: 'a', name: 'Ali', role: 'EDITOR', load: 3 },
  { id: 's', name: 'Siti', role: 'GRAPHIC', load: 4 },
]
const draft: PreviewDraft = {
  category: 'Reels video', tname: 'Full production', version: 2, promise: 10,
  stages: [
    { sid: 'script', name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ ids: ['r'], rule: 'any' }], back: null, picText: 'Writing' },
    { sid: 'edit', name: 'Edit', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 3, appr: [], back: null, picText: 'Editing' },
    { sid: 'thumb', name: 'Thumbnail', dept: 'design', who: { mode: 'prev', cands: ['s'] }, sla: 1, appr: [], back: null, picText: '' },
    { sid: 'final', name: 'Final', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [{ ids: ['r', 'assign'], rule: 'all' }, { ids: ['pic'], rule: 'any' }], back: 1, picText: 'Ready' },
  ],
  canvas: { req: { pic: true }, sections: [
    { id: 'sec1', emoji: '🎯', title: 'Script', stage: 'script', fields: [{ id: 'f1', label: 'Topic', type: 'Text', stage: 'script', req: true, pic: true }] },
    { id: 'sec2', emoji: '🎬', title: 'Shots', stage: null, fields: [{ id: 'f2', label: 'Shots', type: 'Table', stage: null, req: false, pic: true,
      cols: [{ id: 'c1', name: 'Scene', type: 'Text', stage: 'script', req: true, pic: true }, { id: 'c2', name: 'Clip', type: 'Text', stage: 'thumb', req: true, pic: false }] }] },
    { id: 'sec3', emoji: '🎯', title: 'Thumbnail', stage: 'thumb', fields: [{ id: 'f3', label: 'Cover', type: 'File', stage: 'thumb', req: true, pic: true }] },
  ] },
}

describe('the sample task', () => {
  it('is half done: the stages before filled in, the one now open, a 🔓 stage given its first candidate', () => {
    const t = sampleTask(draft, people, NOW)
    expect(t.at).toEqual({ cur: 2, level: -1, ok: {}, done: false })
    expect(t.stages.map(s => s.doer)).toEqual(['a', 's', 's', 's'])
    expect(t.stages.map(s => !!s.doneAt)).toEqual([true, true, false, false])
    expect(t.sections.map(s => s.stage)).toEqual([0, null, 2])
    expect(t.stages[3].levels[0].ids).toEqual(['r', 'd'])
    expect(t.tplChip).toBe('Reels video · Full production v2')
    expect(missingOf(t).map(m => m.label)).toEqual(['Shots · Clip', 'Cover'])
  })
  it('makes nothing up (2026-11-13): the template’s own name, a placeholder Track ID, every field and table empty', () => {
    const t = sampleTask(draft, people, NOW)
    expect(t.title).toBe('Reels video · Full production')
    expect(t.trackId).toBe('TSK-····')
    expect(t.values).toEqual({})
    expect(t.rows).toEqual({ f2: [] })
    expect(JSON.stringify(t)).not.toMatch(/Red Truck|Mid Valley|drive\.google|Carmen|Filled ·/)
    expect(sampleTask({ ...draft, tname: '' }, people, NOW).title).toBe('Reels video')
  })
  it('a draft with no canvas: a section per stage', () => {
    const t = sampleTask({ ...draft, canvas: null }, people, NOW)
    expect(t.sections.map(s => s.title)).toEqual(['Script', 'Edit', 'Thumbnail', 'Final'])
  })
})

describe('a decision on the sample', () => {
  it('submit opens the next stage; its approvals in turn; all on a level; the PIC; done', () => {
    let t = sampleTask(draft, people, NOW)
    t = sampleStep(t, 'submit', 's', NOW)
    expect(t.at).toMatchObject({ cur: 3, level: -1 })
    expect(t.stages[3].dueOn).toBe('2026-11-13')
    t = sampleStep(t, 'submit', 'a', NOW)
    expect(t.at.level).toBe(0)
    t = sampleStep(t, 'approve', 'r', NOW)
    expect(t.at).toMatchObject({ level: 0, ok: { r: 'now' } })
    t = sampleStep(t, 'approve', 'r', NOW)
    expect(t.at.level).toBe(0)
    t = sampleStep(t, 'changes', 'd', NOW)
    expect(t.at).toMatchObject({ cur: 1, level: -1 })
    expect(t.log[0].text).toBe('Siti notified: “Changes requested — back to Edit”')
  })
  it('the last approval done: the task is done, its finish kept', () => {
    let t = sampleTask(draft, people, NOW)
    t = { ...t, at: { cur: 3, level: 1, ok: {}, done: false } }
    t = sampleStep(t, 'approve', 'pic', NOW)
    expect(t.at.done).toBe(true)
    expect(t.doneAt).toBe(NOW.toISOString())
  })
  it('a 🔓 next stage takes the pick made at submit', () => {
    let t = sampleTask(draft, people, NOW)
    t = { ...t, at: { cur: 1, level: -1, ok: {}, done: false }, stages: t.stages.map((s, i) => (i === 2 ? { ...s, doer: null } : s)) }
    t = sampleStep(t, 'submit', 'a', NOW, 's')
    expect([t.at.cur, t.stages[2].doer]).toEqual([2, 's'])
  })
})
