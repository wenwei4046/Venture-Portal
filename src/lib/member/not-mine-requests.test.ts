import { describe, expect, it } from 'vitest'
import {
  NOT_MINE_REASON_MAX, notMineContextFromRow, notMineReasonRefusal, notMineRequestFromRow, notMineRequestsFromRow, notMineStatus,
  openNotMineOn,
} from './not-mine-requests'

// Not my order (2026-11-14 — the user: a salesperson writes a request "not my order" on their own bill, HR approves, and it
// counts for nothing). What the database answers, read and said in words for the Revenue app and Comm Cal alike.

const ROW = {
  id: 'r1', status: 'hr', orderId: 'o1', orderNo: 'HC-SO-2611-044', periodMonth: '2026-11', subDepartmentId: 'fair',
  staff: { id: 'shawn', name: 'SHAWN' }, reason: 'Keyed for ANTHONY', createdAt: '2026-11-14T02:00:00Z', updatedAt: '2026-11-14T02:00:00Z',
  decidedAt: null, decidedByName: null, decisionNote: null,
  bill: { date: '2026-11-03', customer: 'Tan May Yi', venue: 'MID VALLEY', total: '2700.00', ownerId: 'shawn', counts: true, periodMonth: '2026-11' },
}

describe('notMineRequestFromRow', () => {
  it('reads a request as the database writes it', () => {
    expect(notMineRequestFromRow(ROW)).toEqual({
      id: 'r1', status: 'hr', orderId: 'o1', orderNo: 'HC-SO-2611-044', periodMonth: '2026-11', subDepartmentId: 'fair',
      staff: { id: 'shawn', name: 'SHAWN' }, reason: 'Keyed for ANTHONY', createdAt: '2026-11-14T02:00:00Z', updatedAt: '2026-11-14T02:00:00Z',
      decidedAt: null, decidedByName: null, decisionNote: null,
      bill: { date: '2026-11-03', customer: 'Tan May Yi', venue: 'MID VALLEY', total: 2700, ownerId: 'shawn', counts: true, periodMonth: '2026-11' },
    })
  })

  it('refuses what is not one', () => {
    expect(notMineRequestFromRow(null)).toBeNull()
    expect(notMineRequestFromRow({ ...ROW, status: 'partner' })).toBeNull()
    expect(notMineRequestFromRow({ ...ROW, staff: null })).toBeNull()
    expect(notMineRequestFromRow({ ...ROW, orderId: 7 })).toBeNull()
    expect(notMineRequestsFromRow([ROW, { id: 'x' }, ROW]).length).toBe(2)
    expect(notMineRequestsFromRow({})).toEqual([])
  })

  it('a bill gone is no bill; a bill that stopped counting says so', () => {
    expect(notMineRequestFromRow({ ...ROW, bill: null })?.bill).toBeNull()
    expect(notMineRequestFromRow({ ...ROW, bill: { ...ROW.bill, counts: false } })?.bill?.counts).toBe(false)
  })
})

describe('notMineContextFromRow', () => {
  it('reads the sheet: the bill, why not now, the open request', () => {
    expect(notMineContextFromRow({ orderId: 'o1', orderNo: 'HC-SO-2611-044', total: 2700, customer: 'Tan May Yi', blocked: null, request: ROW }))
      .toEqual({ orderId: 'o1', orderNo: 'HC-SO-2611-044', total: 2700, customer: 'Tan May Yi', blocked: null, request: notMineRequestFromRow(ROW) })
    expect(notMineContextFromRow({ orderId: 'o1', orderNo: 'HC-SO-2611-047', total: 6000, blocked: 'HC-SO-2611-047 is shared — HR changes who holds it on Comm Cal.' }))
      .toMatchObject({ customer: '', blocked: 'HC-SO-2611-047 is shared — HR changes who holds it on Comm Cal.', request: null })
    expect(notMineContextFromRow({ orderNo: 'x' })).toBeNull()
  })
})

describe('notMineStatus', () => {
  it('says where a request stands, for the salesperson', () => {
    expect(notMineStatus({ status: 'hr' })).toEqual({ text: 'Waiting for HR', tone: 'warn' })
    expect(notMineStatus({ status: 'approved' })).toEqual({ text: 'Not counted', tone: 'good' })
    expect(notMineStatus({ status: 'rejected' })).toEqual({ text: 'Rejected by HR', tone: 'bad' })
    expect(notMineStatus({ status: 'cancelled' })).toEqual({ text: 'Withdrawn', tone: 'none' })
  })
})

describe('openNotMineOn', () => {
  it('finds the request still with HR on a bill, never a decided one', () => {
    const open = notMineRequestFromRow(ROW)!
    const decided = notMineRequestFromRow({ ...ROW, id: 'r0', status: 'rejected' })!
    expect(openNotMineOn([decided, open], 'o1')).toBe(open)
    expect(openNotMineOn([decided], 'o1')).toBeNull()
    expect(openNotMineOn([open], 'o2')).toBeNull()
  })
})

describe('notMineReasonRefusal', () => {
  it('a reason is required, and no longer than the database keeps', () => {
    expect(notMineReasonRefusal('   ')).toBe('Say whose order it is, or why it is not yours — HR reads it.')
    expect(notMineReasonRefusal('x'.repeat(NOT_MINE_REASON_MAX + 1))).toBe('Keep the reason to 500 characters.')
    expect(notMineReasonRefusal(`  ${'x'.repeat(NOT_MINE_REASON_MAX)}  `)).toBeNull()
    expect(notMineReasonRefusal('Keyed for ANTHONY')).toBeNull()
  })
})
