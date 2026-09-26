import { describe, expect, it } from 'vitest'
import {
  billCountAction,
  describeExclusion,
  exclusionReason,
  NOT_COUNTED,
  outWithoutTheHand,
  type BillStanding,
} from './bill-exclusion'

const live: BillStanding = { cancelled: false, excludedReason: null, erpStatus: 'CONFIRMED', erpOnHold: false }
const month = { runLocked: false, monthLabel: 'September 2026' }

describe('exclusionReason', () => {
  it('says nothing about a bill that counts', () => {
    expect(exclusionReason(live)).toBeNull()
  })

  it('names a bill taken out by hand, whatever the ERP says about it', () => {
    expect(exclusionReason({ ...live, cancelled: true, excludedReason: 'manual' })).toBe(NOT_COUNTED)
    expect(exclusionReason({ ...live, cancelled: true, excludedReason: 'manual', erpStatus: 'CANCELLED' })).toBe(NOT_COUNTED)
  })

  it('puts a salesperson who is not ours first — it is about the whole person', () => {
    expect(exclusionReason({ ...live, cancelled: true, excludedReason: 'ignored_agent', erpStatus: 'CANCELLED' }))
      .toBe('Not our salesperson')
  })

  it("keeps the ERP's own words for the ERP's exclusions", () => {
    expect(exclusionReason({ ...live, cancelled: true, erpOnHold: true })).toBe('On hold in the ERP')
    expect(exclusionReason({ ...live, cancelled: true, erpStatus: 'DELETED' })).toBe('Deleted in the ERP')
    expect(exclusionReason({ ...live, cancelled: true, erpStatus: 'READY_TO_SHIP' })).toBe('ready to ship in the ERP')
    expect(exclusionReason({ ...live, cancelled: true, erpStatus: null })).toBe('Excluded')
  })
})

describe('outWithoutTheHand', () => {
  it('lets a live ERP document back in', () => {
    expect(outWithoutTheHand({ ...live, cancelled: true, excludedReason: 'manual', erpStatus: 'DELIVERED' })).toBeNull()
  })

  it('lets a file-imported bill back in — a file only ever writes live bills', () => {
    expect(outWithoutTheHand({ cancelled: true, excludedReason: 'manual', erpStatus: null, erpOnHold: false })).toBeNull()
  })

  it('says what keeps it out when the ERP cancelled it meanwhile', () => {
    expect(outWithoutTheHand({ ...live, cancelled: true, excludedReason: 'manual', erpStatus: 'CANCELLED' }))
      .toBe('cancelled in the ERP')
    expect(outWithoutTheHand({ ...live, cancelled: true, excludedReason: 'manual', erpOnHold: true }))
      .toBe('On hold in the ERP')
    expect(outWithoutTheHand({ ...live, cancelled: true, excludedReason: 'ignored_agent' })).toBe('Not our salesperson')
  })
})

describe('billCountAction', () => {
  it('offers to take a live bill out', () => {
    expect(billCountAction({ ...live, excludedByHand: false }, month)).toEqual({ kind: 'exclude' })
  })

  it('offers to count a bill again only when a hand took it out', () => {
    expect(billCountAction({ ...live, cancelled: true, excludedReason: 'manual', excludedByHand: true }, month))
      .toEqual({ kind: 'include', stillOut: null })
  })

  it('warns that counting again will not bring in a bill the ERP has cancelled since', () => {
    expect(billCountAction(
      { ...live, cancelled: true, excludedReason: 'manual', erpStatus: 'CANCELLED', excludedByHand: true }, month,
    )).toEqual({ kind: 'include', stillOut: 'cancelled in the ERP' })
  })

  it('refuses a bill already out for a reason this menu cannot undo', () => {
    expect(billCountAction({ ...live, cancelled: true, excludedReason: 'ignored_agent', excludedByHand: false }, month))
      .toEqual({ kind: 'unavailable', reason: 'Not our salesperson' })
    expect(billCountAction({ ...live, cancelled: true, erpStatus: 'CANCELLED', excludedByHand: false }, month))
      .toEqual({ kind: 'unavailable', reason: 'cancelled in the ERP' })
  })

  it('changes nothing either way once the month has paid', () => {
    const locked = { runLocked: true, monthLabel: 'September 2026' }
    expect(billCountAction({ ...live, excludedByHand: false }, locked)).toEqual({
      kind: 'locked',
      excludedByHand: false,
      reason: 'The run for September 2026 has paid — reopen it before changing which bills count',
    })
    expect(billCountAction({ ...live, cancelled: true, excludedReason: 'manual', excludedByHand: true }, locked))
      .toMatchObject({ kind: 'locked', excludedByHand: true })
  })
})

describe('describeExclusion', () => {
  it('says who, when (in Malaysia) and why', () => {
    // 17:30 UTC on the 26th is already the 27th in Kuala Lumpur.
    expect(describeExclusion({ note: 'duplicate of HC-SO-013251', byName: 'Principal', at: '2026-09-26T17:30:00Z' }))
      .toBe('Taken out by Principal on 27 Sep 2026 — duplicate of HC-SO-013251')
  })

  it('leaves out what it does not know', () => {
    expect(describeExclusion({ note: null, byName: null, at: '2026-09-27T02:00:00Z' })).toBe('Taken out on 27 Sep 2026')
  })
})
