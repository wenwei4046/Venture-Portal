import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { cardMeta, plateColumns, plateLine, weekRows } from './my-space'

// My Space's three columns, from the board as mkt_board() answers it. Mei owns stages, Rachel approves, Aina and
// Hafiz take subtasks — the handoff's own people (`My Space.dc.html`).
const MEI = '00000000-0000-0000-0000-00000000000a'
const RACHEL = '00000000-0000-0000-0000-00000000000b'
const AINA = '00000000-0000-0000-0000-00000000000c'
const CAR = '10000000-0000-0000-0000-000000000001'

const team = [
  { id: MEI, full: 'Mei Ling', first: 'Mei', team: 'content' },
  { id: RACHEL, full: 'Rachel Tan', first: 'Rachel', team: 'manager' },
  { id: AINA, full: 'Aina Yusof', first: 'Aina', team: 'design' },
]
const subs = [{ id: CAR, code: 'CAR', name: 'Carres', dot: 'oklch(0.70 0.12 235)', emoji: '🛋️' }]

let n = 0
function project(stages: Record<string, unknown>[], over: Record<string, unknown> = {}, subtasks: Record<string, unknown>[] = []) {
  n += 1
  const id = `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  return {
    project: { id, trackId: `MKT-CAR-2610-${String(n).padStart(3, '0')}`, kind: 'product', sub: CAR, title: `Project ${n}`, status: 'active', cur: 0, ...over },
    stages: stages.map((s, idx) => ({ project: id, idx, name: `Stage ${idx}`, dept: 'content', status: 'planned', appr: [], apprIdx: 0, ...s })),
    subtasks: subtasks.map((t, i) => ({ id: `${id.slice(0, -2)}9${i}`, project: id, stage: 0, title: `Sub ${i}`, status: 'working', returns: 0, ...t })),
  }
}

function board(today: string, me: string, ...ps: ReturnType<typeof project>[]) {
  return boardFromRow({
    today, me, team, subs,
    projects: ps.map(p => p.project),
    stages: ps.flatMap(p => p.stages),
    subtasks: ps.flatMap(p => p.subtasks),
  })
}

const titles = (cols: ReturnType<typeof plateColumns>, key: string) => cols.find(c => c.key === key)!.cards.map(c => `${c.title} | ${c.label} | ${c.action}`)

describe('My Space columns', () => {
  it('puts a stage just opened for its owner on their turn, to Accept', () => {
    const b = board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo', dueOn: '2026-10-24' }]))
    const cols = plateColumns(b)
    expect(titles(cols, 'turn')).toEqual(['Project 1 | New · just assigned | accept'])
    expect(cols[0].cards[0].isNew).toBe(true)
  })

  it('turns a stage red once its due date has passed, and puts red first', () => {
    const b = board('2026-10-22', MEI,
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-25' }]),
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-21' }]))
    const turn = plateColumns(b)[0]
    expect(turn.cards.map(c => `${c.title} ${c.tone} ${c.label}`)).toEqual([
      'Project 3 red Overdue 1 day',
      'Project 2 waiting In progress',
    ])
    expect(turn.anyRed).toBe(true)
  })

  it('asks the approver whose turn it is, and shows the owner what they wait for', () => {
    const p = project([{ owner: MEI, status: 'review', appr: [{ kind: 'person', staff: RACHEL }, { kind: 'pic' }], apprIdx: 0, dueOn: '2026-10-30' }])
    expect(titles(plateColumns(board('2026-10-22', RACHEL, p)), 'turn')).toEqual(['Project 4 | Waiting for your approval | open'])
    expect(titles(plateColumns(board('2026-10-22', MEI, p)), 'waiting')).toEqual(['Project 4 | Waiting for Rachel | open'])
  })

  it('counts the days a stage waits for the PIC', () => {
    const p = project([{ owner: MEI, status: 'review', appr: [{ kind: 'pic' }], submittedAt: '2026-10-21T03:00:00Z', dueOn: '2026-10-30' }], { pic: 'Carmen' })
    const waiting = plateColumns(board('2026-10-22', MEI, p))[2]
    expect(waiting.cards[0].label).toBe('Waiting for PIC · 1 day')
    expect(waiting.cards[0].nowWith).toBe('Carmen (PIC)')
  })

  it('sends changes asked for back to the owner, red', () => {
    const p = project([{ owner: MEI, status: 'changes', changes: { by: 'Rachel', reason: 'Logo too small' } }])
    expect(titles(plateColumns(board('2026-10-22', MEI, p)), 'turn')).toEqual(['Project 6 | Changes requested · Rachel | open'])
  })

  it('lists the subtasks out with others as delegated, a delivery to Review', () => {
    const p = project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-28' }], {}, [
      { assignee: AINA, title: 'Storyboard sketch', dueOn: '2026-10-25', status: 'working' },
      { assignee: AINA, title: 'Shot reference board', status: 'ready' },
      { assignee: AINA, title: 'Approved one', status: 'approved' },
    ])
    const cols = plateColumns(board('2026-10-22', MEI, p))
    expect(titles(cols, 'delegated')).toEqual([
      'Storyboard sketch | In progress · due 25 Oct | none',
      'Shot reference board | Ready | review',
    ])
    expect(cols[1].cards[0].assignee).toBe('Aina')
    // …and on Aina's side: hers to do, and the one she delivered, waiting for Mei.
    const hers = plateColumns(board('2026-10-22', AINA, p))
    expect(titles(hers, 'turn')).toEqual(['Storyboard sketch | In progress | open'])
    expect(titles(hers, 'waiting')).toEqual(['Shot reference board | Waiting for Mei to review | open'])
  })

  it('leaves out a paused project, a series pattern and a stage not yet open', () => {
    const b = board('2026-10-22', MEI,
      project([{ owner: MEI, status: 'todo' }], { status: 'paused' }),
      project([{ owner: MEI, status: 'todo' }], { kind: 'recurring', trackId: 'RCR-CAR-2610-001' }),
      project([{ owner: RACHEL, status: 'accepted' }, { owner: MEI, status: 'planned' }]))
    expect(plateColumns(b).flatMap(c => c.cards)).toEqual([])
  })

  it('has nothing for a viewer with no People record (the Principal)', () => {
    const b = board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo' }]))
    expect(plateColumns(b, null).flatMap(c => c.cards)).toEqual([])
  })

  it('writes the card line and the week', () => {
    const p = project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-21' }, { owner: MEI }], {}, [])
    const b = board('2026-10-22', MEI, p, project([{ owner: MEI, status: 'todo', dueOn: '2026-11-05' }]))
    const cols = plateColumns(b)
    expect(cardMeta(cols[0].cards[0])).toBe('Carres · Stage 1/2 · Stage 0 · Due 21 Oct')
    // Sunday 25 Oct ends the week: the 5 Nov one is not this week's.
    expect(weekRows(cols, '2026-10-22')).toEqual([{ key: cols[0].cards[0].key, when: '21 Oct', title: cols[0].cards[0].title, red: true, trackId: cols[0].cards[0].trackId }])
    expect(plateLine(2)).toBe('you have 2 things on your plate')
    expect(plateLine(1)).toBe('you have 1 thing on your plate')
    expect(plateLine(0)).toBe('your plate is clear')
  })

  it('turns a stage not accepted after 4 working hours red (2026-10-24 — the user’s answer 2)', () => {
    const holiday = (b: ReturnType<typeof board>) => ({ ...b, holidays: [{ day: '2026-10-23', name: 'Holiday' }] })
    const at = (b: ReturnType<typeof board>, iso: string) => plateColumns(b, MEI, new Date(iso))[0].cards[0]
    // Opened Thu 22 Oct at 10:00 in the office: three hours by lunch, the fourth at 15:00.
    const b = holiday(board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo', dueOn: '2026-10-30', enteredAt: '2026-10-22T02:00:00Z' }])))
    expect(at(b, '2026-10-22T05:59:00Z')).toMatchObject({ tone: 'waiting', label: 'New · just assigned', isNew: true })
    expect(at(b, '2026-10-22T07:00:00Z')).toMatchObject({ tone: 'red', label: 'Not accepted · 4+ working hours', isNew: false })
    // Opened Thu at 17:00: Thursday's last hour, then Friday's holiday and the weekend count nothing — red at Monday noon.
    const late = holiday(board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo', dueOn: '2026-10-30', enteredAt: '2026-10-22T09:00:00Z' }])))
    expect(at(late, '2026-10-26T03:59:00Z').tone).toBe('waiting')
    expect(at(late, '2026-10-26T04:00:00Z').tone).toBe('red')
  })
})
