import { describe, expect, it } from 'vitest'
import { ACCEPT_HOURS, boardFromRow, workingHours } from './board'
import { NO_FILTER, countPool, filterTasks, flowLanes, peopleCards, periodRange, trackCounts, trackTasks, workingDays } from './tracking'

const MEI = '00000000-0000-0000-0000-00000000000a'
const ALI = '00000000-0000-0000-0000-00000000000d'
const JASON = '00000000-0000-0000-0000-00000000000e'
const RACHEL = '00000000-0000-0000-0000-00000000000b'
const CAR = '10000000-0000-0000-0000-000000000001'
const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const NOW = new Date('2026-10-22T06:00:00Z') // Thursday 22 Oct, 2 p.m. in the office

const reels = ['Script', 'Shoot', 'Edit', 'Final']
function product(n: number, cur: number, stage: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    project: { id: id(n), trackId: `MKT-CAR-2610-${String(n).padStart(3, '0')}`, kind: 'product', sub: CAR, title: `Reel ${n}`, status: 'active', cur, workflow: 'Reels Video', ...over },
    stages: reels.map((name, idx) => ({
      project: id(n), idx, name, sla: 1, status: idx < cur ? 'done' : idx === cur ? 'accepted' : 'planned', ...(idx === cur ? stage : {}),
    })),
  }
}

const ps = [
  product(1, 0, { owner: MEI, dueOn: '2026-10-21', enteredAt: '2026-10-19T01:00:00Z' }),
  product(2, 2, { owner: ALI, status: 'review', appr: [{ kind: 'person', staff: RACHEL }], submittedAt: '2026-10-22T03:00:00Z', dueOn: '2026-10-28' }),
  product(3, 1, { owner: ALI, dueOn: '2026-10-22' }),
  product(4, 0, { owner: JASON, status: 'todo', enteredAt: '2026-10-20T02:00:00Z', dueOn: '2026-10-30' }),
  product(5, 0, { owner: JASON, dueOn: '2026-10-26', enteredAt: '2026-10-19T06:00:00Z' }, { dueOn: '2026-10-27' }),
  product(6, 1, { owner: MEI, dueOn: '2026-11-20' }),
]
const board = boardFromRow({
  today: '2026-10-22',
  team: [
    { id: MEI, full: 'Mei Ling', first: 'Mei', capacity: 2 },
    { id: ALI, full: 'Ali Hassan', first: 'Ali' },
    { id: JASON, full: 'Jason Lee', first: 'Jason' },
    { id: RACHEL, full: 'Rachel Tan', first: 'Rachel' },
  ],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
  projects: ps.map(p => p.project),
  stages: [
    ...ps.flatMap(p => p.stages),
    // Mei's finished stage elsewhere, a day late.
    { project: id(9), idx: 0, name: 'Script', owner: MEI, status: 'done', dueOn: '2026-10-10', enteredAt: '2026-10-08T00:00:00Z', doneAt: '2026-10-11T00:00:00Z' },
  ],
  holidays: [{ day: '2026-10-23', name: 'Holiday' }],
})

describe('the Tracking Dashboard', () => {
  const tasks = trackTasks(board, NOW)

  it('says what state each task is in, and why', () => {
    expect(tasks.map(t => `${t.title} · ${t.stageName} · ${t.ownerName} · ${t.tone} · ${t.why}`)).toEqual([
      'Reel 1 · Script · Mei · red · Script overdue 1 day',
      // Not accepted after 4 working hours is red (the user, 2026-10-24): Tue 10:00 → Thu 14:00 = 7 + 8 + 4 hours.
      'Reel 4 · Script · Jason · red · Not accepted · 19 working hours',
      'Reel 2 · Edit · Ali · waiting · Waiting for Rachel’s approval · 3 hours',
      'Reel 3 · Shoot · Ali · risk · Due today',
      // 26 Oct needs Script + Shoot + Edit + Final = 4 working days; Fri 23 is a holiday: only Mon 26, Tue 27 remain.
      'Reel 5 · Script · Jason · risk · 4 SLA days left, 2 working days to deadline',
      'Reel 6 · Shoot · Mei · ok · ',
    ])
    expect(tasks[0].days).toBe(3.2)
  })

  it('counts working days without weekends or holidays', () => {
    const h = new Set(['2026-10-23'])
    expect(workingDays('2026-10-22', '2026-10-27', h)).toBe(2)
    expect(workingDays('2026-10-22', '2026-10-22', h)).toBe(0)
  })

  it('counts working hours by the office’s clock: 9–1 and 2–6, Monday to Friday, less the holidays', () => {
    const h = new Set(['2026-10-23'])
    // Thu 22 Oct 08:00 → 14:30 in the office: 9–1 is four hours, the half hour after lunch makes 4.5.
    expect(workingHours('2026-10-22T00:00:00Z', new Date('2026-10-22T06:30:00Z'), h)).toBe(4.5)
    // Thu 17:00 → Mon 10:00: Thursday's last hour, Friday a holiday, the weekend, Monday's first hour.
    expect(workingHours('2026-10-22T09:00:00Z', new Date('2026-10-26T02:00:00Z'), h)).toBe(2)
    // Lunch, and a time that has not come, count nothing.
    expect(workingHours('2026-10-22T05:00:00Z', new Date('2026-10-22T05:59:00Z'), h)).toBe(0)
    expect(workingHours('2026-10-22T06:00:00Z', new Date('2026-10-22T05:00:00Z'), h)).toBe(0)
    expect(workingHours('not a time', NOW, h)).toBe(0)
    expect(ACCEPT_HOURS).toBe(4)
  })

  it('counts the five cards and filters by them', () => {
    const pool = countPool(tasks, NO_FILTER)
    expect(trackCounts(pool)).toEqual({ All: 6, attention: 3, red: 2, risk: 2, ok: 1 })
    expect(filterTasks(tasks, { ...NO_FILTER, status: 'attention' }).map(t => t.title)).toEqual(['Reel 1', 'Reel 4', 'Reel 2'])
    // The period never hides ongoing work: it scopes the figures of what was finished.
    expect(countPool(tasks, { ...NO_FILTER, period: { kind: 'week' } }).length).toBe(6)
    expect(periodRange({ kind: 'month' }, '2026-12-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodRange({ kind: 'week' }, '2026-10-22')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })

  it('draws each person’s load against their capacity, and how they finish', () => {
    const pool = countPool(tasks, NO_FILTER)
    const cards = peopleCards(board, pool, pool, NO_FILTER)
    expect(cards.map(c => `${c.name} ${c.loadLabel} red=${c.red} waiting=${c.waiting}`)).toEqual([
      'Jason 2 of 5 slots red=1 waiting=1',
      'Mei Full red=1 waiting=0',
      'Ali 2 of 5 slots red=0 waiting=2',
      'Rachel Free red=0 waiting=0',
    ])
    expect(cards[1]).toMatchObject({ name: 'Mei', onTime: 0, avgDays: 3 })
    expect(cards[2]).toMatchObject({ name: 'Ali', onTime: null, avgDays: null })
    // Mei finished that stage on 11 Oct: this week's figures have nothing to go on.
    expect(peopleCards(board, pool, pool, { ...NO_FILTER, period: { kind: 'week' } }).find(c => c.name === 'Mei')).toMatchObject({ onTime: null })
  })

  it('lays the tasks in their workflow’s stage columns and flags the slowest', () => {
    const [lane] = flowLanes(tasks)
    expect(lane).toMatchObject({ name: 'Reels Video', count: 6, red: 2 })
    expect(lane.columns.map(c => `${c.name}:${c.tasks.length}${c.slow ? ' 🐢' : ''}`)).toEqual(['Script:3 🐢', 'Shoot:2', 'Edit:1', 'Final:0'])
  })
})
