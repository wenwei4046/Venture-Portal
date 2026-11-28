import { describe, expect, it } from 'vitest'
import { boardFromRow } from '@/lib/marketing/board'
import { calendarEvents, type CalEvent } from '@/lib/marketing/calendar'
import { chatListFromRow } from '@/lib/marketing/chat'
import { plateColumns } from '@/lib/marketing/my-space'
import { projectRows } from '@/lib/marketing/projects'
import type { TodayCard } from '@/lib/me/today'
import {
  agendaOf, cardsOf, chatPeek, kindGlyph, layerCounts, monthTitle, nextMonday, noticeIcon, punchChip, punchRow, quickNote, quickStage, segsOf,
  subCards, todayCount, turnCount, twoWorkingDays, unreadChats, weeklyRule, weekStrip,
} from './model'

// The Marketing app's own words and numbers (2026-11-28 — `Marketing App iOS + Android.dc.html`), worked out from the
// portal's readers: the plate's three columns as the segmented control, the punch as Me says it, the calendar's week
// strip and agenda, what a quick task is made with.

const MEI = '00000000-0000-0000-0000-00000000000a'
const RACHEL = '00000000-0000-0000-0000-00000000000b'
const CAR = '10000000-0000-0000-0000-000000000001'
const team = [
  { id: MEI, full: 'Mei Ling', first: 'Mei', team: 'content' },
  { id: RACHEL, full: 'Rachel Tan', first: 'Rachel', team: 'manager' },
]
const subs = [{ id: CAR, code: 'CAR', name: 'Carres', dot: 'oklch(0.70 0.12 235)', emoji: '🛋️' }]

let n = 0
function project(stages: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  n += 1
  const id = `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  return {
    project: { id, trackId: `TSK-CAR-2611-${String(n).padStart(3, '0')}`, kind: 'quick', sub: CAR, title: `Task ${n}`, status: 'active', cur: 0, ...over },
    stages: stages.map((s, idx) => ({ project: id, idx, name: `Stage ${idx}`, dept: 'content', status: 'planned', appr: [], apprIdx: 0, ...s })),
  }
}
const board = (me: string, ...ps: ReturnType<typeof project>[]) => boardFromRow({
  today: '2026-11-26', me, team, subs, projects: ps.map(p => p.project), stages: ps.flatMap(p => p.stages), subtasks: [],
})
// Thu 26 Nov 2026, 12:00 in the office.
const NOW = new Date('2026-11-26T04:00:00Z')

describe('Tasks: My turn · Waiting · Delegated', () => {
  const b = board(MEI,
    project([{ owner: MEI, status: 'accepted', dueOn: '2026-11-27' }]),
    project([{ owner: MEI, status: 'accepted', dueOn: '2026-11-24' }]),
    project([{ owner: MEI, status: 'review', appr: [{ kind: 'person', staff: RACHEL }], dueOn: '2026-11-30' }]))
  const cols = plateColumns(b, MEI, NOW)

  it('counts each column; My turn is hot while it holds something', () => {
    expect(segsOf(cols).map(g => [g.key, g.count, g.hot])).toEqual([['turn', 2, true], ['waiting', 1, false], ['delegated', 0, false]])
    expect(turnCount(cols)).toBe(2)
    expect(segsOf([]).map(g => g.count)).toEqual([0, 0, 0])
  })

  it('draws a late card red and first, another’s turn grey, each with Open', () => {
    const turn = cardsOf(cols, 'turn')
    expect(turn.map(c => [c.title, c.tone, c.red, c.act])).toEqual([['Task 2', 'red', true, 'Open'], ['Task 1', 'wait', false, 'Open']])
    expect(cardsOf(cols, 'waiting').map(c => [c.title, c.tone, c.label])).toEqual([['Task 3', 'draft', 'Stage 0 · with Rachel']])
  })

  it('asks the approver to Review', () => {
    const forRachel = plateColumns(b, RACHEL, NOW)
    expect(cardsOf(forRachel, 'turn').map(c => [c.title, c.act])).toEqual([['Task 3', 'Review']])
  })
})

describe('the punch, as Me says it', () => {
  const card = (over: Partial<TodayCard>): TodayCard => ({ chip: 'Work day', line: 'Not in yet · starts 09:00', punch: 'in', in: null, out: null, ...over })

  it('the Tasks chip: Punch in, then the time in, then out', () => {
    expect(punchChip(null)).toBeNull()
    expect(punchChip(card({}))).toBe('🕘 Punch in')
    expect(punchChip(card({ punch: 'out', in: '09:41' }))).toBe('🟢 In · 09:41')
    expect(punchChip(card({ punch: null, in: '09:41', out: '18:02' }))).toBe('Out · 18:02')
    // A day with nothing to punch says what the day is.
    expect(punchChip(card({ punch: null, chip: 'Rest day' }))).toBe('🕘 Rest day')
  })

  it('More’s row: the button the punch is, none when there is nothing to punch', () => {
    expect(punchRow(card({}))).toEqual({ line: 'Not in yet · starts 09:00', button: 'Punch in', primary: true })
    expect(punchRow(card({ punch: 'out', in: '09:41', line: 'IN 09:41' }))).toEqual({ line: 'IN 09:41', button: 'Punch out', primary: false })
    expect(punchRow(card({ punch: null, in: '09:41', out: '18:02', line: 'IN 09:41 · OUT 18:02' }))?.button).toBe('Done')
    expect(punchRow(card({ punch: null, chip: 'Rest day', line: 'Rest day' }))?.button).toBeNull()
    expect(punchRow(null)).toBeNull()
  })
})

describe('Projects and More', () => {
  it('a row’s glyph is its kind', () => {
    expect([kindGlyph({ kind: 'quick' }), kindGlyph({ kind: 'recurring' }), kindGlyph({ kind: 'deliverable' }), kindGlyph({ kind: 'product' })]).toEqual(['⚡', '🔁', '📦', '📦'])
  })

  it('each subsidiary’s open tasks, and how many are late', () => {
    const b = board(MEI,
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-11-24' }]),
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-11-30' }]),
      project([{ owner: MEI, status: 'done' }], { status: 'done' }))
    expect(subCards(b.subs, projectRows(b)).map(x => [x.sub.code, x.open, x.late])).toEqual([['CAR', 2, 1]])
  })
})

describe('the Calendar', () => {
  const ev = (over: Partial<CalEvent>): CalEvent => ({
    id: String(Math.random()), kind: 'due', day: '2026-11-26', title: 'x', sub: null, trackId: null, line2: '', people: [MEI], who: 'Mei', tone: 'waiting',
    label: '', icon: '', kindLabel: '', time: null, quick: false, recur: false, ...over,
  })
  const all = { post: true, due: true, meet: true, ads: true }
  const events = [
    ev({ day: '2026-11-20', tone: 'red', title: 'late' }),
    ev({ day: '2026-11-20', tone: 'done', title: 'done long ago' }),
    ev({ day: '2026-11-26', kind: 'post', title: 'today post' }),
    ev({ day: '2026-11-29', kind: 'meet', title: 'shoot', people: [RACHEL] }),
    ev({ day: '2026-12-10', title: 'far' }),
  ]

  it('the week strip: Monday to Sunday of this week, today marked, a dot a date', () => {
    const w = weekStrip('2026-11-26', events, { layers: all, mine: false }, MEI)
    expect(w.map(d => `${d.wd} ${d.n}${d.today ? '*' : ''} ${d.dots.length}`)).toEqual(['Mon 23 0', 'Tue 24 0', 'Wed 25 0', 'Thu 26* 1', 'Fri 27 0', 'Sat 28 0', 'Sun 29 1'])
  })

  it('the agenda: what is still late from before, then today to a week on — or the day picked', () => {
    const f = { layers: all, mine: false, day: null }
    expect(agendaOf('2026-11-26', events, f, MEI).map(d => [d.label, d.overdue, d.events.map(e => e.title)])).toEqual([
      ['20 Nov', true, ['late']],
      ['Today · 26 Nov', false, ['today post']],
      ['29 Nov', false, ['shoot']],
    ])
    expect(agendaOf('2026-11-26', events, { ...f, day: '2026-12-10' }, MEI).map(d => d.events.map(e => e.title))).toEqual([['far']])
    // Only mine, and a layer off.
    expect(agendaOf('2026-11-26', events, { ...f, mine: true }, MEI).flatMap(d => d.events.map(e => e.title))).toEqual(['late', 'today post'])
    expect(agendaOf('2026-11-26', events, { ...f, layers: { ...all, post: false } }, MEI).flatMap(d => d.events.map(e => e.title))).toEqual(['late', 'shoot'])
  })

  it('counts each layer as the chips say it, the Only mine switch too', () => {
    expect(layerCounts(events, { mine: false }, MEI)).toEqual({ post: 1, due: 3, meet: 1, ads: 0 })
    expect(layerCounts(events, { mine: true }, MEI)).toEqual({ post: 1, due: 3, meet: 0, ads: 0 })
    expect(todayCount('2026-11-26', events)).toBe(1)
    expect(monthTitle('2026-11-26')).toBe('November 2026')
  })

  it('reads the board’s own dates', () => {
    const b = board(MEI, project([{ owner: MEI, status: 'accepted', dueOn: '2026-11-27' }]))
    expect(calendarEvents(b).some(e => e.day === '2026-11-27')).toBe(true)
  })
})

describe('a Quick or Recurring task', () => {
  it('is due in two working days — a weekend skipped', () => {
    expect(twoWorkingDays('2026-11-26')).toBe('2026-11-30') // Thu → Mon
    expect(twoWorkingDays('2026-11-23')).toBe('2026-11-25') // Mon → Wed
    expect(twoWorkingDays('2026-11-28')).toBe('2026-12-01') // Sat → Tue
  })

  it('a recurring one runs every Monday from the next one, with no end', () => {
    expect(nextMonday('2026-11-26')).toBe('2026-11-30')
    expect(nextMonday('2026-11-30')).toBe('2026-12-07')
    expect(weeklyRule('2026-11-26')).toEqual({ freq: 'weekly', start: '2026-11-30', days: [1], every: 1, endMode: 'never' })
  })

  it('says what will be made', () => {
    expect(quickNote('quick', '2026-11-26')).toBe('One stage, yours, due in 2 working days (30 Nov). Stages and approvers can be added on the task.')
    expect(quickNote('recurring', '2026-11-26')).toBe('Every week on Monday, from 30 Nov, no end date. One stage, yours, due in 2 working days.')
    expect(quickStage(MEI, 'Social Media')).toEqual({ name: 'Social Media', who: MEI, sla: 2, appr: [], form: [{ label: 'What was done', type: 'Text' }], back: null })
  })
})

describe('notices and the chat', () => {
  it('a notice’s icon is what it opens or says', () => {
    expect(noticeIcon({ refKind: 'payment_request', type: null })).toBe('🧾')
    expect(noticeIcon({ refKind: 'mkt_project', type: 'approve' })).toBe('📤')
    expect(noticeIcon({ refKind: 'mkt_project', type: 'changes' })).toBe('↩️')
    expect(noticeIcon({ refKind: 'mkt_project', type: 'nudge' })).toBe('🔔')
    expect(noticeIcon({ refKind: 'mkt_project', type: null })).toBe('🎬')
  })

  it('Space’s chat row: the first unread line, else all caught up', () => {
    const msg = (from: string, body: string) => ({ id: 1, from, first: from === RACHEL ? 'Rachel' : 'Mei', body, at: '2026-11-26T01:00:00Z', project: null })
    const list = chatListFromRow({ me: MEI, lobby: { last: null, unread: false }, dms: [] })
    expect([chatPeek(list), unreadChats(list)]).toEqual(['All caught up', 0])
    const unread = { ...list, dms: [{ staff: RACHEL, first: 'Rachel', full: 'Rachel Tan', title: null, avatarPath: null, last: msg(RACHEL, 'Ready?'), unread: true }] }
    expect(chatPeek(unread as typeof list)).toBe('Rachel: Ready?')
    expect(unreadChats({ ...(unread as typeof list), lobby: { last: msg(MEI, 'hi'), unread: true } })).toBe(2)
  })
})
