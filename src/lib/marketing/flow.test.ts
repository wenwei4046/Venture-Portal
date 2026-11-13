import { describe, expect, it } from 'vitest'
import {
  actorsNow, backTarget, bannerOf, defaultFocus, dueAt, finishFromRow, flowDates, lateDays, levelFromRow, levelPassed,
  levelIds, levelText, levelWaits, overdueFires, overdueFromRow, overdueSummary, step, tileOf, turnOf, type FlowAt, type FlowStage,
} from './flow'

const S = (doer: string | null, levels: FlowStage['levels'] = [], extra: Partial<FlowStage & { back: number | null }> = {}) =>
  ({ doer, levels, dueOn: null, done: false, ...extra })
const at = (cur: number, level = -1, ok: Record<string, string> = {}, done = false): FlowAt => ({ cur, level, ok, done })

describe('approval levels', () => {
  it('reads every form a level was kept in', () => {
    expect(levelFromRow({ ids: ['a', 'b', 'a'], rule: 'all' })).toEqual({ ids: ['a', 'b'], rule: 'all' })
    expect(levelFromRow({ kind: 'person', staff: 'a' })).toEqual({ ids: ['a'], rule: 'any' })
    expect(levelFromRow({ kind: 'pic', all: true })).toEqual({ ids: ['pic'], rule: 'any' })
    expect(levelFromRow({ kind: 'assign' })).toEqual({ ids: ['assign'], rule: 'any' })
    expect(levelFromRow('x')).toBeNull()
  })
  it('any passes on the first approval; all waits for everyone', () => {
    const any = { ids: ['r', 'd'], rule: 'any' as const }
    const all = { ids: ['r', 'd'], rule: 'all' as const }
    expect(levelWaits(any, {})).toEqual(['r', 'd'])
    expect(levelPassed(any, { d: 't' })).toBe(true)
    expect(levelWaits(all, { r: 't' })).toEqual(['d'])
    expect(levelPassed(all, { r: 't', d: 't' })).toBe(true)
  })
  it('says a level as the cards do', () => {
    const name = (id: string) => ({ r: 'Rachel', d: 'Daniel', pic: 'PIC' })[id] ?? id
    expect(levelText({ ids: ['r'], rule: 'any' }, name)).toBe('Rachel')
    expect(levelText({ ids: ['r', 'd'], rule: 'all' }, name)).toBe('Rachel & Daniel')
    expect(levelText({ ids: ['r', 'pic'], rule: 'any' }, name)).toBe('Rachel or PIC')
  })
  it('changes go back to an earlier stage, else stay', () => {
    expect(backTarget(3, 1)).toBe(1)
    expect(backTarget(3, null)).toBe(3)
    expect(backTarget(3, 5)).toBe(3)
  })
})

describe('the next stage’s person approves (2026-11-14)', () => {
  it('keeps who it stands for, waits for them once known, and for nobody before', () => {
    const lv = levelFromRow({ ids: ['next', 'r'], rule: 'all', nextWho: 'm' })!
    expect(lv).toEqual({ ids: ['next', 'r'], rule: 'all', nextWho: 'm' })
    expect(levelIds(lv)).toEqual(['m', 'r'])
    expect(levelWaits(lv, { r: 'x' })).toEqual(['m'])
    expect(levelText(lv, id => ({ m: 'Mei', r: 'Rachel', next: 'Next stage’s person' })[id] ?? id)).toBe('Mei & Rachel')
    const before = levelFromRow({ ids: ['next'], rule: 'any' })!
    expect(levelIds(before)).toEqual([])
    expect(levelPassed(before, {})).toBe(true)
    expect(levelText(before, id => (id === 'next' ? 'Next stage’s person' : id))).toBe('Next stage’s person')
    // Named on the level too: once.
    expect(levelIds({ ids: ['m', 'next'], rule: 'any', nextWho: 'm' })).toEqual(['m'])
    expect(levelFromRow({ ids: ['r'], rule: 'any', nextWho: 'm' })).toEqual({ ids: ['r'], rule: 'any' })
  })
})

describe('days', () => {
  it('counts Monday to Friday only — no holidays', () => {
    // Fri 13 Nov 2026 + 1 → Mon 16; a 3-day stage after it is due Thu 19.
    expect(flowDates('2026-11-13', [1, 3])).toEqual([
      { idx: 0, startsOn: '2026-11-13', dueOn: '2026-11-16' },
      { idx: 1, startsOn: '2026-11-17', dueOn: '2026-11-19' },
    ])
  })
  it('is due at 18:00 in the office and late by whole days rounded up', () => {
    expect(dueAt('2026-11-11').toISOString()).toBe('2026-11-11T10:00:00.000Z')
    expect(lateDays('2026-11-11', new Date('2026-11-11T09:59:00Z'))).toBe(0)
    expect(lateDays('2026-11-11', new Date('2026-11-11T10:01:00Z'))).toBe(1)
    expect(lateDays('2026-11-11', new Date('2026-11-13T10:01:00Z'))).toBe(3)
    expect(lateDays(null, new Date())).toBe(0)
  })
})

describe('settings', () => {
  it('reads the overdue rule with its bounds and says it', () => {
    const o = overdueFromRow({ days: 40, notify: ['mm', 'x'], action: 'reassign', repeat: false })
    expect(o).toEqual({ days: 10, notify: ['mm'], action: 'reassign', repeat: false })
    expect(overdueSummary(overdueFromRow(null))).toBe('⏰ Late 1d → doer + MM')
    expect(overdueFires(1, overdueFromRow(null))).toBe(true)
    expect(overdueFires(1, { ...o, days: 2 })).toBe(false)
  })
  it('a custom celebration with no GIF falls back', () => {
    expect(finishFromRow({ celebration: 'custom' }, 'Reels video').celebration).toBe('fireworks')
    expect(finishFromRow(null, 'Reels video').picText).toBe('Your reels video is ready')
  })
})

describe('a running task', () => {
  const flow = [
    S('mei'),
    S('ali', [{ ids: ['rachel', 'daniel'], rule: 'all' }, { ids: ['pic'], rule: 'any' }]),
    S('siti', [{ ids: ['rachel'], rule: 'any' }], { back: 0 } as Partial<FlowStage>),
  ]
  it('is the doer\'s turn, then each approver still waited for', () => {
    expect(actorsNow(flow, at(1))).toEqual(['ali'])
    expect(turnOf(flow, at(1), 'ali')).toBe('doer')
    expect(turnOf(flow, at(1, 0), 'daniel')).toBe('approve')
    expect(turnOf(flow, at(1, 0, { daniel: 't' }), 'daniel')).toBeNull()
    expect(tileOf(flow, at(1, 0, { daniel: 't' }), 'daniel')).toBe('waiting')
    expect(tileOf(flow, at(1), 'carmen')).toBeNull()
  })
  it('steps through submit, all, any, and changes back', () => {
    let a = step(flow, at(1), 'ali', 'submit')
    expect(a).toEqual(at(1, 0))
    a = step(flow, a, 'rachel', 'approve')
    expect(a.level).toBe(0)
    a = step(flow, a, 'daniel', 'approve')
    expect(a).toEqual(at(1, 1))
    a = step(flow, a, 'pic', 'approve')
    expect(a).toEqual(at(2))
    a = step(flow, step(flow, a, 'siti', 'submit'), 'rachel', 'changes')
    expect(a).toEqual(at(0))
    const end = step(flow, step(flow, at(2), 'siti', 'submit'), 'rachel', 'approve')
    expect(end.done).toBe(true)
  })
  it('focuses the viewer\'s own stage', () => {
    expect(defaultFocus(flow, at(1), 'ali')).toBe(1)
    expect(defaultFocus(flow, at(1), 'siti')).toBe(2)
    expect(defaultFocus(flow, at(1), 'mei')).toBe(0)
    expect(defaultFocus(flow, at(1), 'josiah')).toBe(1)
    expect(defaultFocus(flow, at(2, -1, {}, true), 'ali')).toBe(1)
  })
  it('picks the banner for each viewer', () => {
    expect(bannerOf(flow, at(1), 'ali', false)).toBe('doer')
    expect(bannerOf(flow, at(1, 0), 'rachel', true)).toBe('approver')
    expect(bannerOf(flow, at(1), 'josiah', true)).toBe('mm')
    expect(bannerOf(flow, at(1), 'siti', false)).toBe('upcoming')
    expect(bannerOf(flow, at(1), 'mei', false)).toBe('finished')
    // Handed in, waiting for its approver: "Submitted", never "Up next" (2026-11-14).
    expect(bannerOf(flow, at(1, 0), 'ali', false)).toBe('submitted')
    expect(bannerOf(flow, at(2, -1, {}, true), 'mei', false)).toBe('done')
  })
})
