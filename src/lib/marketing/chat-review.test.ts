import { describe, expect, it } from 'vitest'
import {
  chatReviewFromRow, REASON_MAX, REASON_MIN, reviewLogFromRow, reviewOpenFromRow, reviewPageFromRow, reviewPair, reviewProblem, reviewWhen, tidyReason,
} from './chat-review'

// 2026-10-24 — ⑦-3b: a direct message opened on a complaint (the user's answer 35, amended), as the page draws it. The
// database's side — who may, the record, an hour to read on: tests/member-sql/validate-marketing-chat-review.mjs.

const MEI = '00000000-0000-4000-8000-000000000012', ALI = '00000000-0000-4000-8000-000000000013'
const record = (id: number, by = 'LOO WEN WEI', reason = 'Ali’s complaint about late messages') => ({
  id, at: '2026-10-24T01:12:00Z', by, reason, a: { staff: MEI, name: 'MEI LING TAN' }, b: { staff: ALI, name: 'ALI HASSAN' },
})

describe('read from the database', () => {
  it('the page: the people to pick, each with a name and title, and every record — whatever came in, by its keys', () => {
    const log = reviewLogFromRow({
      people: [{ staff: MEI, name: 'MEI LING TAN', first: 'Mei', title: 'VIDEOGRAPHER' }, { staff: ALI, name: 'ALI HASSAN' }, { first: 'Nobody' }, 'x'],
      reviews: [record(2), { id: 1, a: { staff: MEI } }, record(1, '')],
    })
    expect(log.people).toEqual([
      { staff: MEI, name: 'MEI LING TAN', first: 'Mei', title: 'VIDEOGRAPHER' },
      { staff: ALI, name: 'ALI HASSAN', first: 'ALI HASSAN', title: null },
    ])
    expect(log.reviews.map(r => [r.id, r.by])).toEqual([[2, 'LOO WEN WEI'], [1, 'Somebody']])
    expect(reviewLogFromRow(null)).toEqual({ people: [], reviews: [] })
  })

  it('a chat opened: its record and its messages, oldest first — none without a record', () => {
    const open = reviewOpenFromRow({
      review: record(7), more: true,
      messages: [{ id: 3, from: MEI, first: 'Mei', body: 'line', at: '' }, { id: 4, from: ALI, first: 'Ali', body: null, at: '' }],
    })
    expect(open?.review.id).toBe(7)
    expect(open?.messages.map(m => m.id)).toEqual([3])
    expect(open?.more).toBe(true)
    expect(reviewOpenFromRow({ messages: [] })).toBeNull()
    expect(reviewPageFromRow({ messages: [{ id: '9', from: ALI, body: 'older', at: '' }] })).toEqual({
      messages: [{ id: 9, from: ALI, first: '', body: 'older', project: null, at: '' }], more: false,
    })
    expect(chatReviewFromRow({ id: 'x', a: { staff: MEI }, b: { staff: ALI } })).toBeNull()
  })
})

describe('the reason first', () => {
  it('two people, never one twice; a reason of 10 to 500 characters, one line — the database’s words', () => {
    const why = 'Ali’s complaint about late messages'
    expect(reviewProblem(null, ALI, why)).toBe('Pick the two people whose chat it is.')
    expect(reviewProblem(MEI, MEI, why)).toBe('Pick the two people whose chat it is.')
    expect(reviewProblem(MEI, ALI, '  Complaint ')).toBe('Say why you are opening it — 10 characters at least.')
    expect(reviewProblem(MEI, ALI, 'x'.repeat(REASON_MAX + 1))).toBe('A reason is at most 500 characters.')
    expect(reviewProblem(MEI, ALI, why)).toBeNull()
    expect(tidyReason('  Ali’s complaint,\n 24 Oct  ')).toBe('Ali’s complaint, 24 Oct')
    expect([REASON_MIN, REASON_MAX]).toEqual([10, 500])
  })
})

describe('as the records read', () => {
  it('when by the office’s clock; the two by the names they had', () => {
    expect(reviewWhen('2026-10-24T01:12:00Z')).toBe('24 Oct 2026, 09:12')
    expect(reviewWhen('2026-10-23T17:30:00Z')).toBe('24 Oct 2026, 01:30')
    expect(reviewWhen('')).toBe('')
    expect(reviewPair(record(1))).toBe('MEI LING TAN ↔ ALI HASSAN')
  })
})
