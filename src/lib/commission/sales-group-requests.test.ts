import { describe, expect, it } from 'vitest'
import {
  arrangementOf,
  dayLabel,
  historyOf,
  openReplacements,
  replacementList,
  replacementTitle,
  shortDay,
  statusOf,
  waitingList,
  type SubDeptRequest,
} from './sales-group-requests'

const req = (over: Partial<SubDeptRequest>): SubDeptRequest => ({
  id: over.id ?? 'r',
  requestNo: null,
  kind: 'waiting',
  status: 'waiting',
  createdAt: '2026-09-01T00:00:00Z',
  submittedAt: null,
  submittedBy: null,
  newPerson: null,
  contact: null,
  start: null,
  signature: null,
  original: null,
  destination: null,
  replacementSource: null,
  effective: null,
  reason: null,
  target: null,
  acceptedAt: null,
  events: [],
  ...over,
})

describe('waitingList', () => {
  it('numbers the accepted applicants in the order HR accepted them, not the order they were sent', () => {
    const rows = [
      req({ id: 'daniel', newPerson: 'Daniel Lee', submittedAt: '2026-10-03T02:00:00Z', acceptedAt: '2026-10-04T02:00:00Z' }),
      req({ id: 'amelia', newPerson: 'Amelia Tan', submittedAt: '2026-10-05T02:00:00Z', acceptedAt: '2026-09-10T02:00:00Z' }),
    ]
    expect(waitingList(rows).map(r => [r.position, r.id])).toEqual([[1, 'amelia'], [2, 'daniel']])
  })

  it('leaves out what is not on the list: still in review, failed, placed or another kind', () => {
    const rows = [
      req({ id: 'pending', status: 'submitted' }),
      req({ id: 'failed', status: 'failed' }),
      req({ id: 'placed', status: 'allocated' }),
      req({ id: 'swap', kind: 'replacement', status: 'waiting' }),
      req({ id: 'on', status: 'waiting' }),
      req({ id: 'held', status: 'reserved' }),
    ]
    expect(waitingList(rows).map(r => r.id)).toEqual(['on', 'held'])
  })
})

describe('replacementList / openReplacements', () => {
  const rows = [
    req({ id: 'louis', kind: 'replacement', status: 'submitted', submittedAt: '2026-10-09T00:00:00Z' }),
    req({ id: 'marcus', kind: 'replacement', status: 'submitted', submittedAt: '2026-10-01T00:00:00Z' }),
    req({ id: 'done', kind: 'replacement', status: 'executed', submittedAt: '2026-09-01T00:00:00Z' }),
    req({ id: 'wait', kind: 'waiting', status: 'waiting' }),
  ]

  it('lists every replacement in the order sent, settled ones too', () => {
    expect(replacementList(rows).map(r => r.id)).toEqual(['done', 'marcus', 'louis'])
  })

  it('counts only those still in hand', () => {
    expect(openReplacements(rows)).toBe(2)
  })
})

describe('words', () => {
  it('names a replacement by who leaves and who comes', () => {
    expect(replacementTitle({ original: 'Marcus', newPerson: 'Ryan Tan', replacementSource: 'new' })).toBe('Marcus → Ryan Tan')
    expect(replacementTitle({ original: 'Louis', newPerson: null, replacementSource: 'vacancy' })).toBe('Louis → seat released')
  })

  it('says the arrangement, and where a transfer goes', () => {
    expect(arrangementOf({ destination: 'member_exit', target: null })).toBe('Leave this department only')
    expect(arrangementOf({ destination: 'resignation', target: null })).toBe('Leave the company')
    expect(arrangementOf({ destination: 'transfer', target: 'IR' })).toBe('Transfer to another department · IR')
  })

  it('gives every status Member services’ words and a tone, the new ones too', () => {
    expect(statusOf('submitted')).toEqual({ name: 'Pending review', tone: 'alert' })
    expect(statusOf('failed')).toEqual({ name: 'Failed · removed', tone: 'danger' })
    expect(statusOf('scheduled')).toEqual({ name: 'Scheduled', tone: 'alert' })
    expect(statusOf('odd')).toEqual({ name: 'odd', tone: 'plain' })
  })

  it('writes the month in three letters, in the office’s calendar', () => {
    expect(dayLabel('2026-09-11')).toBe('11 Sep 2026')
    expect(dayLabel('2026-10-04T17:00:00Z')).toBe('5 Oct 2026')
    expect(dayLabel(null)).toBe('—')
    expect(shortDay('2026-09-09T03:00:00Z')).toBe('9 Sep')
  })
})

describe('historyOf', () => {
  it('reads one step per move, with who moved it', () => {
    const steps = historyOf([
      { to: 'waiting', at: '2026-09-10T02:00:00Z', note: 'ok', by: 'HR' },
      { to: 'submitted', at: '2026-09-09T02:00:00Z', note: null, by: 'Chea Huan' },
    ])
    expect(steps.map(s => [s.what, s.by])).toEqual([
      ['Submitted', 'Chea Huan'],
      ['Accepted onto the waiting list', 'HR'],
    ])
  })

  it('folds the database’s own echo of the same move into one step', () => {
    const steps = historyOf([
      { to: 'waiting', at: '2026-09-10T02:00:00Z', note: null, by: null },
      { to: 'waiting', at: '2026-09-10T02:00:01Z', note: 'ok', by: 'HR' },
    ])
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ what: 'Accepted onto the waiting list', by: 'HR', note: 'ok' })
  })

  it('reads two moves made at one instant in the order they happen', () => {
    const at = '2026-10-10T08:00:00.123456+00:00'
    const steps = historyOf([
      { to: 'executed', at, note: null, by: null },
      { to: 'scheduled', at, note: null, by: 'HR' },
      { to: 'submitted', at: '2026-10-09T01:00:00Z', note: null, by: 'Stanley' },
    ])
    expect(steps.map(s => s.what)).toEqual(['Submitted', 'Scheduled', 'Completed'])
  })
})
