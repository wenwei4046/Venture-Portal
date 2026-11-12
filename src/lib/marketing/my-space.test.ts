import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { cardMeta, plateColumns, plateLine, plateOf, weekRows } from './my-space'

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

// Thu 22 Oct 2026, 12:00 in the office.
const NOW = new Date('2026-10-22T04:00:00Z')
const cols_ = (b: ReturnType<typeof board>, me?: string | null) => plateColumns(b, me === undefined ? b.me : me, NOW)
const titles = (cols: ReturnType<typeof plateColumns>, key: string) => cols.find(c => c.key === key)!.cards.map(c => `${c.title} | ${c.label} | ${c.action}`)

describe('My Space columns', () => {
  it('puts a stage just opened on its doer\'s turn — no Accept (Workflow Builder 2a)', () => {
    const b = board('2026-10-22', MEI, project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-24', enteredAt: '2026-10-22T01:00:00Z' }]))
    const cols = cols_(b)
    expect(titles(cols, 'turn')).toEqual(['Project 1 | Your turn | open'])
    expect([cols[0].cards[0].isNew, cols[0].cards[0].kind]).toEqual([true, 'doer'])
    // An old `todo` reads the same.
    expect(titles(cols_(board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo', dueOn: '2026-10-24' }]))), 'turn')[0]).toMatch(/\| Your turn \| open$/)
  })

  it('turns a stage red once its due date has passed, and puts red first', () => {
    const b = board('2026-10-22', MEI,
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-25' }]),
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-21' }]))
    const turn = cols_(b)[0]
    expect(turn.cards.map(c => `${c.title} ${c.tone} ${c.label}`)).toEqual([
      'Project 4 red 1d overdue',
      'Project 3 waiting Your turn',
    ])
    expect(turn.cards[0].late).toBe(1)
    expect(turn.anyRed).toBe(true)
  })

  it('asks the approver whose turn it is, and shows the owner what they wait for', () => {
    const p = project([{ owner: MEI, status: 'review', appr: [{ kind: 'person', staff: RACHEL }, { kind: 'pic' }], apprIdx: 0, dueOn: '2026-10-30' }])
    expect(titles(cols_(board('2026-10-22', RACHEL, p)), 'turn')).toEqual(['Project 5 | Needs your approval | review'])
    expect(titles(cols_(board('2026-10-22', MEI, p)), 'waiting')).toEqual(['Project 5 | Stage 0 · with Rachel | open'])
  })

  it('a level of several: any — everybody on it until one approves; all — those still to', () => {
    const lv = (rule: 'any' | 'all', ok: Record<string, string>) =>
      project([{ owner: MEI, status: 'review', appr: [{ ids: [RACHEL, AINA], rule }], apprIdx: 0, apprOk: ok, dueOn: '2026-10-30' }])
    const any = lv('any', {})
    expect([titles(cols_(board('2026-10-22', RACHEL, any)), 'turn').length, titles(cols_(board('2026-10-22', AINA, any)), 'turn').length]).toEqual([1, 1])
    const all = lv('all', { [RACHEL]: '2026-10-22T01:00:00Z' })
    expect(titles(cols_(board('2026-10-22', RACHEL, all)), 'turn')).toEqual([])
    expect(titles(cols_(board('2026-10-22', RACHEL, all)), 'waiting')).toEqual([`${'Project 7'} | Stage 0 · with Aina | open`])
    expect(titles(cols_(board('2026-10-22', AINA, all)), 'turn')).toEqual(['Project 7 | Needs your approval | review'])
  })

  it('counts the days a stage waits for the PIC', () => {
    const p = project([{ owner: MEI, status: 'review', appr: [{ kind: 'pic' }], submittedAt: '2026-10-21T03:00:00Z', dueOn: '2026-10-30' }], { pic: 'Carmen' })
    const waiting = cols_(board('2026-10-22', MEI, p))[2]
    expect(waiting.cards[0].label).toBe('Waiting for PIC · 1 day')
    expect(waiting.cards[0].nowWith).toBe('Carmen (PIC)')
  })

  it('sends changes asked for back to the owner, red', () => {
    const p = project([{ owner: MEI, status: 'changes', changes: { by: 'Rachel', reason: 'Logo too small' } }])
    expect(titles(plateColumns(board('2026-10-22', MEI, p)), 'turn')).toEqual(['Project 9 | Changes requested · Rachel | open'])
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

  it('leaves out a paused project and a series pattern; a stage of theirs still ahead waits', () => {
    const b = board('2026-10-22', MEI,
      project([{ owner: MEI, status: 'todo' }], { status: 'paused' }),
      project([{ owner: MEI, status: 'todo' }], { kind: 'recurring', trackId: 'RCR-CAR-2610-001' }),
      project([{ owner: RACHEL, status: 'accepted' }, { owner: MEI, status: 'planned' }]))
    expect(cols_(b).flatMap(c => c.cards).map(c => `${c.title} | ${c.label} | ${c.kind}`)).toEqual(['Project 13 | Stage 0 · with Rachel | waiting'])
  })

  it('has nothing for a viewer with no People record (the Principal)', () => {
    const b = board('2026-10-22', MEI, project([{ owner: MEI, status: 'todo' }]))
    expect(plateColumns(b, null).flatMap(c => c.cards)).toEqual([])
  })

  it('writes the card line and the week', () => {
    const p = project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-21' }, { owner: MEI }], {}, [])
    const b = board('2026-10-22', MEI, p, project([{ owner: MEI, status: 'todo', dueOn: '2026-11-05' }]))
    const cols = cols_(b)
    expect(cardMeta(cols[0].cards[0])).toBe('Carres · Stage 1/2 · Stage 0 · Due 21 Oct')
    // Sunday 25 Oct ends the week: the 5 Nov one is not this week's.
    expect(weekRows(cols, '2026-10-22')).toEqual([{ key: cols[0].cards[0].key, when: '21 Oct', title: cols[0].cards[0].title, red: true, trackId: cols[0].cards[0].trackId }])
    expect(plateLine(2)).toBe('you have 2 things on your plate')
    expect(plateLine(1)).toBe('you have 1 thing on your plate')
    expect(plateLine(0)).toBe('your plate is clear')
  })

  it('no red for a stage not accepted any more: red is past due only (18:00 office time)', () => {
    const b = board('2026-10-22', MEI, project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-22', enteredAt: '2026-10-20T02:00:00Z' }]))
    expect(plateColumns(b, MEI, new Date('2026-10-22T09:59:00Z'))[0].cards[0].tone).toBe('waiting')
    expect(plateColumns(b, MEI, new Date('2026-10-22T10:01:00Z'))[0].cards[0]).toMatchObject({ tone: 'red', label: '1d overdue' })
  })
})

// 2026-10-24 — ⑦-4: anybody's plate, for their pet's mood in the lobby and on a visit.
describe('a plate, for the pet', () => {
  it('My turn counted, what is late there and in Waiting, a stage just put on it — anybody’s, by their id', () => {
    const b = board('2026-10-22', RACHEL,
      project([{ owner: MEI, status: 'todo', dueOn: '2026-10-24' }]),
      project([{ owner: MEI, status: 'accepted', dueOn: '2026-10-21' }]),
      project([{ owner: AINA, status: 'accepted', dueOn: '2026-10-25' }]))
    expect(plateOf(cols_(b, MEI))).toEqual({ count: 2, red: 1, fresh: false })
    expect(plateOf(cols_(b, AINA))).toEqual({ count: 1, red: 0, fresh: false })
    expect(plateOf(cols_(b))).toEqual({ count: 0, red: 0, fresh: false })
  })
})
