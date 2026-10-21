import { describe, expect, it } from 'vitest'
import {
  draftPayload, draftProblem, evenPercents, holdersLine, listNames, openRequestOn, ownerKeepsPercent, pctLabel, proposedHolders,
  shareContextFromRow, shareRequestFromRow, shareRequestsFromRow, shareStatus, stepLabel, waitingOn, type ShareRequest,
} from './share-requests'

const LUCAS = '29161184-da38-4c9a-b869-b2c7fba86aeb'
const ANTHONY = '79516ca3-333e-420d-988a-bef4228a178a'
const BEN = '5b0a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'

// `share_requests_json` as the dry run on production answered it (2026-10-21): LUCAS shared HC-SO-2610-298 with ANTHONY.
const ROW = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001', status: 'hr', orderId: '9561b2c9-5b7f-4228-9378-286ff4ff2b44', orderNo: 'HC-SO-2610-298',
  periodMonth: '2026-10', subDepartmentId: '71709f7e-9f7c-4e28-80cf-ce21be336995',
  owner: { id: LUCAS, name: 'LUCAS' }, note: 'Closed this one together', createdAt: '2026-10-21T02:00:00+00:00', updatedAt: '2026-10-21T02:30:00+00:00',
  decidedAt: null, decidedByName: null, decisionNote: null, mine: 'owner',
  bill: { date: '2026-10-04', customer: 'Mdm Tan', venue: 'MITEC', total: 5800, ownerId: LUCAS, counts: true, periodMonth: '2026-10' },
  parts: [{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, answer: 'accepted', answeredAt: '2026-10-21T02:30:00+00:00', note: null }],
  holders: [{ id: LUCAS, name: 'LUCAS', pct: 1, owner: true }],
  events: [
    { step: 'sent', name: 'LUCAS', at: '2026-10-21T02:00:00+00:00', note: 'Closed this one together' },
    { step: 'accepted', name: 'ANTHONY', at: '2026-10-21T02:30:00+00:00', note: null },
  ],
}

describe('shareRequestFromRow', () => {
  it('reads the function’s answer field by field', () => {
    const r = shareRequestFromRow(ROW)!
    expect(r).toMatchObject({ id: ROW.id, status: 'hr', orderNo: 'HC-SO-2610-298', owner: { id: LUCAS, name: 'LUCAS' }, mine: 'owner' })
    expect(r.bill).toEqual({ date: '2026-10-04', customer: 'Mdm Tan', venue: 'MITEC', total: 5800, ownerId: LUCAS, counts: true, periodMonth: '2026-10' })
    expect(r.parts).toEqual([{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, answer: 'accepted', answeredAt: '2026-10-21T02:30:00+00:00', note: null }])
    expect(r.events.map(e => e.step)).toEqual(['sent', 'accepted'])
  })

  it('reads a part given as the numeric text PostgREST can hand back', () => {
    const r = shareRequestFromRow({ ...ROW, parts: [{ ...ROW.parts[0], pct: '0.5000' }], bill: { ...ROW.bill, total: '5800.00' } })!
    expect(r.parts[0].pct).toBe(0.5)
    expect(r.bill?.total).toBe(5800)
  })

  it('refuses what is not a request, and drops a part or step it does not know', () => {
    expect(shareRequestFromRow(null)).toBeNull()
    expect(shareRequestFromRow({ ...ROW, status: 'pending' })).toBeNull()
    expect(shareRequestFromRow({ ...ROW, owner: null })).toBeNull()
    const r = shareRequestFromRow({ ...ROW, parts: [...ROW.parts, { id: BEN, name: 'BEN', pct: 0.1, answer: 'maybe' }], events: [...ROW.events, { step: 'edited', at: 'x' }] })!
    expect(r.parts.map(p => p.name)).toEqual(['ANTHONY'])
    expect(r.events).toHaveLength(2)
  })

  it('reads a list, skipping rows it cannot read', () => {
    expect(shareRequestsFromRow([ROW, { id: 'x' }, ROW]).length).toBe(2)
    expect(shareRequestsFromRow({})).toEqual([])
  })
})

describe('shareContextFromRow', () => {
  it('reads the share sheet: the bill, why not, its open request, its holders and the team', () => {
    const ctx = shareContextFromRow({
      orderId: ROW.orderId, orderNo: ROW.orderNo, total: 5800, blocked: null, request: null,
      holders: [{ id: LUCAS, name: 'LUCAS', pct: 1, owner: true }],
      team: [{ id: ANTHONY, name: 'ANTHONY', title: 'Sales Executive', unavailable: null }, { id: BEN, name: 'BEN', title: null, unavailable: 'No Revenue app login yet' }],
    })!
    expect(ctx.team).toEqual([
      { id: ANTHONY, name: 'ANTHONY', title: 'Sales Executive', unavailable: null },
      { id: BEN, name: 'BEN', title: null, unavailable: 'No Revenue app login yet' },
    ])
    expect(ctx.request).toBeNull()
    expect(shareContextFromRow({ orderNo: 'x' })).toBeNull()
  })

  it('carries the bill’s open request', () => {
    expect(shareContextFromRow({ orderId: ROW.orderId, orderNo: ROW.orderNo, total: 5800, blocked: null, request: ROW, holders: [], team: [] })?.request?.id).toBe(ROW.id)
  })
})

describe('the split in words', () => {
  it('writes a part as a whole or a two-place percent', () => {
    expect(pctLabel(0.5)).toBe('50%')
    expect(pctLabel(0.3333)).toBe('33.33%')
    expect(pctLabel(0.125)).toBe('12.5%')
  })

  it('names the owner first', () => {
    expect(holdersLine([{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, owner: false }, { id: LUCAS, name: 'LUCAS', pct: 0.5, owner: true }]))
      .toBe('LUCAS 50% · ANTHONY 50%')
  })

  it('lists names as a sentence does', () => {
    expect(listNames(['ANTHONY'])).toBe('ANTHONY')
    expect(listNames(['ANTHONY', 'BEN'])).toBe('ANTHONY and BEN')
    expect(listNames(['ANTHONY', 'BEN', 'CAROL'])).toBe('ANTHONY, BEN and CAROL')
  })

  it('says each step of the trail', () => {
    expect(stepLabel('sent')).toBe('Share request sent')
    expect(stepLabel('cancelled')).toBe('Withdrawn')
    expect(stepLabel('approved')).toBe('Approved by HR')
  })
})

describe('the form', () => {
  it('starts on an even split — the owner keeps what is left over', () => {
    expect(evenPercents(1)).toEqual([50])
    expect(evenPercents(2)).toEqual([33, 33])
    expect(ownerKeepsPercent([{ id: ANTHONY, name: 'ANTHONY', percent: 33 }, { id: BEN, name: 'BEN', percent: 33 }])).toBe(34)
  })

  it('splits only what the owner holds when somebody already holds a part', () => {
    expect(evenPercents(1, 20)).toEqual([40])
    expect(ownerKeepsPercent([{ id: ANTHONY, name: 'ANTHONY', percent: 40 }], 20)).toBe(40)
  })

  it('says why it cannot be sent', () => {
    expect(draftProblem([])).toBe('Pick who sold it with you.')
    expect(draftProblem([{ id: ANTHONY, name: 'ANTHONY', percent: 0 }])).toBe('Give each colleague between 1% and 99%.')
    expect(draftProblem([{ id: ANTHONY, name: 'ANTHONY', percent: 60 }, { id: BEN, name: 'BEN', percent: 40 }]))
      .toBe('That leaves you nothing — you always keep a part of your own bill.')
    expect(draftProblem(Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, percent: 5 })))).toBe('Share a bill with up to 5 people at a time.')
    expect(draftProblem([{ id: ANTHONY, name: 'ANTHONY', percent: 50 }])).toBeNull()
  })

  it('sends each part as a fraction of the bill', () => {
    expect(draftPayload([{ id: ANTHONY, name: 'ANTHONY', percent: 50 }, { id: BEN, name: 'BEN', percent: 12.5 }]))
      .toEqual([{ staffId: ANTHONY, pct: 0.5 }, { staffId: BEN, pct: 0.125 }])
  })
})

describe('a request’s state', () => {
  const r = shareRequestFromRow(ROW)!
  const as = (over: Partial<ShareRequest>): ShareRequest => ({ ...r, ...over })

  it('says who it waits for, then HR, then how it ended', () => {
    expect(shareStatus(as({ status: 'partner', parts: [{ ...r.parts[0], answer: 'pending' }] }))).toEqual({ text: 'Waiting for ANTHONY', tone: 'warn' })
    expect(shareStatus(r)).toEqual({ text: 'With HR', tone: 'warn' })
    expect(shareStatus(as({ status: 'approved' }))).toEqual({ text: 'Shared', tone: 'good' })
    expect(shareStatus(as({ status: 'rejected' }))).toEqual({ text: 'Rejected by HR', tone: 'bad' })
    expect(shareStatus(as({ status: 'declined', parts: [{ ...r.parts[0], answer: 'declined' }] }))).toEqual({ text: 'Declined by ANTHONY', tone: 'bad' })
    expect(shareStatus(as({ status: 'cancelled' }))).toEqual({ text: 'Withdrawn', tone: 'none' })
  })

  it('finds the request open on a bill, and the ones a colleague still has to answer', () => {
    const waiting = as({ status: 'partner', parts: [{ ...r.parts[0], answer: 'pending' }] })
    expect(openRequestOn([as({ status: 'rejected' }), waiting], r.orderId)?.status).toBe('partner')
    expect(openRequestOn([as({ status: 'approved' })], r.orderId)).toBeNull()
    expect(waitingOn(waiting, ANTHONY)).toBe(true)
    expect(waitingOn(waiting, LUCAS)).toBe(false)
    expect(waitingOn(r, ANTHONY)).toBe(false)
  })

  it('says the split HR would write: the parts named, anybody else at theirs, the owner the rest', () => {
    expect(holdersLine(proposedHolders(r))).toBe('LUCAS 50% · ANTHONY 50%')
    const held = as({ holders: [{ id: LUCAS, name: 'LUCAS', pct: 0.8, owner: true }, { id: BEN, name: 'BEN', pct: 0.2, owner: false }] })
    expect(holdersLine(proposedHolders(held))).toBe('LUCAS 30% · ANTHONY 50% · BEN 20%')
  })
})
