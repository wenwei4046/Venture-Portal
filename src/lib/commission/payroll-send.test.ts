import { describe, expect, it } from 'vitest'
import { changedPeople, nameWarnings, payrollState, unmatchedWarnings, type PayrollFacts } from './payroll-send'

const KRIS = 'e2a52899-dd15-4020-87e0-9bd8cf22b113'

const facts = (extra: Partial<PayrollFacts> = {}): PayrollFacts => ({
  status: null, sent: null, sentAt: null, settledBefore: null, payrollClosed: null, ...extra,
})
const live = (total: number, byStaff: Record<string, number> = {}, blockers: string[] = []) => ({
  total, byStaff: new Map(Object.entries(byStaff)), blockers,
})
const sent = (total: number, byStaff: Record<string, number>) => ({ total, byStaff: new Map(Object.entries(byStaff)) })

describe('nameWarnings', () => {
  it('names people the way HR knows them, and leaves an id nobody can name', () => {
    const names = new Map([[KRIS, 'KRIS']])
    expect(nameWarnings([
      `Staff ${KRIS} has sales this period but no rank / hierarchy row — commission computed at 0%.`,
      'Staff 00000000-0000-4000-8000-000000000000 points at upline nobody.',
      'Order HC-SO-2609-011 carries lines from more than one brand.',
    ], id => names.get(id))).toEqual([
      'Staff KRIS has sales this period but no rank / hierarchy row — commission computed at 0%.',
      'Staff 00000000-0000-4000-8000-000000000000 points at upline nobody.',
      'Order HC-SO-2609-011 carries lines from more than one brand.',
    ])
  })
})

describe('unmatchedWarnings', () => {
  it('says the same thing the send says, once, and nothing when every bill is matched', () => {
    expect(unmatchedWarnings([])).toEqual([])
    expect(unmatchedWarnings(['HC-SO-1', 'HC-SO-2'])).toEqual([
      '2 order(s) carry an agent who is not a salesperson in the portal and were excluded. Match them in the import wizard.',
    ])
  })
})

describe('changedPeople', () => {
  it('counts a person on either side, and ignores a difference under a sen', () => {
    expect(changedPeople(new Map([['a', 100], ['b', 50]]), new Map([['a', 100.004], ['c', 10]]))).toBe(2)
  })
})

describe('payrollState', () => {
  // September 2026 as the user found it: the page showing RM 91,971.90 live,
  // a run computed on 26 Sep that never reached payroll.
  it('says a month is not in payroll until it is sent, whatever was computed', () => {
    expect(payrollState(facts({ status: 'computed' }), live(91_971.9))).toEqual({ kind: 'not_sent', total: 91_971.9, blockers: [] })
    expect(payrollState(facts(), live(10, {}, ['x']))).toEqual({ kind: 'not_sent', total: 10, blockers: ['x'] })
    // Taken back: a draft run is not in payroll either.
    expect(payrollState(facts({ status: 'draft' }), live(10)).kind).toBe('not_sent')
  })

  it('is current only while every person matches what payroll holds', () => {
    const inPayroll = facts({ status: 'applied', sent: sent(300, { a: 200, b: 100 }), sentAt: '2026-10-15T08:00:00Z' })
    expect(payrollState(inPayroll, live(300, { a: 200, b: 100 }))).toMatchObject({ kind: 'sent', current: true, changedPeople: 0 })
    // The same total, moved between two people, is still out of date.
    expect(payrollState(inPayroll, live(300, { a: 150, b: 150 }))).toMatchObject({ kind: 'sent', current: false, changedPeople: 2 })
    expect(payrollState(inPayroll, live(320, { a: 220, b: 100 }, ['y']))).toEqual({
      kind: 'sent', sentTotal: 300, sentAt: '2026-10-15T08:00:00Z', total: 320, current: false, changedPeople: 1, blockers: ['y'],
    })
  })

  it('offers nothing once the payroll month has left draft', () => {
    expect(payrollState(facts({ status: 'applied', sent: sent(300, { a: 300 }), payrollClosed: 'submitted' }), live(320)))
      .toEqual({ kind: 'closed', closedAs: 'submitted', sentTotal: 300 })
    expect(payrollState(facts({ payrollClosed: 'approved' }), live(320))).toEqual({ kind: 'closed', closedAs: 'approved', sentTotal: null })
    expect(payrollState(facts({ status: 'locked', sent: sent(300, {}) }), live(320))).toMatchObject({ kind: 'closed', closedAs: 'locked' })
  })

  it('sends nothing for a month settled by hand', () => {
    expect(payrollState(facts({ settledBefore: 'September 2026' }), live(193_427.45)))
      .toEqual({ kind: 'settled', settledBefore: 'September 2026' })
  })
})
