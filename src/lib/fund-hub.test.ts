import { describe, expect, it } from 'vitest'
import {
  IN_CARDS,
  OUT_CARDS,
  cardAmountOf,
  cardLabel,
  fundCard,
  fundHaystack,
  fundLine,
  fundNote,
  fundStatus,
  fundTrail,
  movedInMonth,
  onFundCard,
  withCode,
  type FundRecord,
} from './fund-hub'

// Fund OUT's and Fund IN's hubs (2026-10-15, the Finance revamp v2 — D12): the
// user's cards (Fund OUT by the loans' status, Fund IN by the source's type,
// and Pending approval), each counting and summing exactly what its list
// holds; the hero, what moved in the office month; a row's description,
// status, the drawer's sentence and trail.

const deal = (over: Partial<FundRecord>): FundRecord => ({
  id: 'x',
  side: 'out',
  party: 'Carres (CAR)',
  type: 'loan',
  typeLabel: 'Loan out',
  amount: 1000,
  outstanding: null,
  rate: 0.02,
  status: 'active',
  overdue: null,
  date: '2026-10-05',
  createdAt: '2026-10-04T02:00:00Z',
  createdBy: 'Aina',
  approvedAt: '2026-10-05T03:00:00Z',
  approvedBy: 'Principal',
  maturity: '2027-10-05',
  months: 12,
  compound: false,
  minPayInterest: false,
  fundingSource: null,
  notes: null,
  bank: null,
  account: null,
  approval: null,
  decidable: false,
  cancelPending: false,
  repaid: 0,
  repaidAt: null,
  repaidBy: null,
  ...over,
})

const LOANS: FundRecord[] = [
  deal({ id: 'a', amount: 100000, outstanding: 80000 }),
  deal({ id: 'b', amount: 50000, outstanding: 40000, overdue: { amount: 12333.34, since: '2026-08-20', days: 50 }, date: '2026-09-20' }),
  deal({ id: 'c', amount: 30000, status: 'pending_approval', approvedAt: null, approvedBy: null, date: '2026-10-12' }),
  deal({ id: 'd', amount: 20000, status: 'repaid', date: '2026-01-05' }),
  deal({ id: 'e', amount: 15000, status: 'cancelled', approvedAt: null, approvedBy: null, date: '2026-10-01' }),
]

describe('the cards', () => {
  it('are the user’s, in the user’s order', () => {
    expect(OUT_CARDS).toEqual(['all', 'active', 'overdue', 'pending_approval', 'repaid', 'cancelled'])
    expect(IN_CARDS).toEqual(['all', 'subsidiary', 'director_saving', 'director_loan', 'department_pool', 'outsource', 'pending_approval'])
    expect(cardLabel('out', 'all')).toBe('All fund out')
    expect(cardLabel('in', 'all')).toBe('All fund in')
    expect(cardLabel('in', 'department_pool')).toBe('Dept pool')
    expect(cardLabel('out', 'pending_approval')).toBe('Pending approval')
  })

  it('count every deal on All and sum what went through (a cancelled one moved no money)', () => {
    expect(fundCard(LOANS, 'all')).toEqual({ count: 5, amount: 200000, pending: 1 })
    expect(fundCard(LOANS, 'active')).toEqual({ count: 2, amount: 150000, pending: 0 })
    expect(fundCard(LOANS, 'overdue')).toEqual({ count: 1, amount: 50000, pending: 0 })
    expect(fundCard(LOANS, 'pending_approval')).toEqual({ count: 1, amount: 30000, pending: 1 })
    expect(fundCard(LOANS, 'repaid')).toEqual({ count: 1, amount: 20000, pending: 0 })
  })

  it('sum what was cancelled on Cancelled — the list it opens sums the same', () => {
    expect(fundCard(LOANS, 'cancelled')).toEqual({ count: 1, amount: 15000, pending: 0 })
    expect(cardAmountOf('cancelled')(LOANS[4])).toBe(15000)
    expect(cardAmountOf('all')(LOANS[4])).toBe(0)
  })

  it('hold a source type’s deals but not its cancelled ones (the design’s live)', () => {
    const sources = [
      deal({ id: 's1', side: 'in', type: 'subsidiary', typeLabel: 'Subsidiary', amount: 300000 }),
      deal({ id: 's2', side: 'in', type: 'subsidiary', typeLabel: 'Subsidiary', amount: 5000, status: 'cancelled' }),
      deal({ id: 's3', side: 'in', type: 'director_loan', typeLabel: 'Director loan', amount: 70000, status: 'matured' }),
    ]
    expect(onFundCard(sources[1], 'subsidiary')).toBe(false)
    expect(fundCard(sources, 'subsidiary')).toEqual({ count: 1, amount: 300000, pending: 0 })
    expect(fundCard(sources, 'director_loan')).toEqual({ count: 1, amount: 70000, pending: 0 })
    expect(fundCard(sources, 'director_saving')).toEqual({ count: 0, amount: 0, pending: 0 })
  })
})

describe('the hero', () => {
  it('is what moved in the office month, by the day the money moved — never a pending or cancelled one', () => {
    expect(movedInMonth(LOANS, '2026-10')).toBe(100000)
    expect(movedInMonth(LOANS, '2026-09')).toBe(50000)
  })
})

describe('a row', () => {
  it('describes how it is lent or taken', () => {
    expect(fundLine(deal({ rate: 0.0085, months: 12, fundingSource: 'HC' }))).toBe('0.850% /mo · 12 months · SC HC')
    expect(fundLine(deal({ rate: 0.02, months: null }))).toBe('2.000% /mo · no fixed term')
    expect(fundLine(deal({ side: 'in', typeLabel: 'Director loan', rate: 0.01, months: 1 }))).toBe('Director loan · 1.000% /mo · 1 month')
  })

  it('says its status, an overdue loan red', () => {
    expect(fundStatus(LOANS[0])).toEqual({ text: 'active', tone: 'ledger' })
    expect(fundStatus(LOANS[1])).toEqual({ text: 'overdue', tone: 'danger' })
    expect(fundStatus(LOANS[2])).toEqual({ text: 'pending approval', tone: 'wait' })
    expect(fundStatus(LOANS[3])).toEqual({ text: 'repaid', tone: 'info' })
    expect(fundStatus(LOANS[4])).toEqual({ text: 'cancelled', tone: 'def' })
    expect(fundStatus(deal({ status: 'matured' }))).toEqual({ text: 'matured', tone: 'alert' })
  })

  it('says, on Fund IN, a maturity about to come or gone — as its list always did', () => {
    const src = (maturity: string) => deal({ side: 'in', maturity })
    expect(fundStatus(src('2026-10-30'), '2026-10-15')).toEqual({ text: 'matures in 15d', tone: 'wait' })
    expect(fundStatus(src('2026-10-14'), '2026-10-15')).toEqual({ text: 'past maturity', tone: 'alert' })
    expect(fundStatus(src('2027-01-15'), '2026-10-15')).toEqual({ text: 'active', tone: 'ledger' })
    // A loan's maturity is not read so.
    expect(fundStatus(deal({ maturity: '2026-10-20' }), '2026-10-15')).toEqual({ text: 'active', tone: 'ledger' })
  })

  it('names its party with its code once — a company called by its code is just that', () => {
    expect(withCode('Carres', 'CAR')).toBe('Carres (CAR)')
    expect(withCode('2990', '2990')).toBe('2990')
    expect(withCode('Loo', null)).toBe('Loo')
  })

  it('is found by its party, its description, its notes and its status', () => {
    const r = deal({ notes: 'Kingsley经手', fundingSource: 'WW' })
    for (const word of ['carres', 'sc ww', 'kingsley', 'active', '2.000%']) expect(fundHaystack(r)).toContain(word)
  })
})

describe('the drawer', () => {
  it('says where the deal stands — the design’s words where the system does the same', () => {
    expect(fundNote(LOANS[2])).toBe('Waiting for Principal approval before the money leaves.')
    expect(fundNote({ ...LOANS[2], side: 'in' })).toBe('Waiting for Principal approval before it is booked.')
    expect(fundNote(LOANS[0])).toBe('Disbursed — bank and loan ledger are updated.')
    expect(fundNote({ ...LOANS[0], side: 'in' })).toBe('Received — bank and ledger are updated.')
    expect(fundNote(LOANS[1])).toBe('Overdue — RM 12,333.34 past its day since 20 Aug 2026.')
    expect(fundNote({ ...LOANS[0], cancelPending: true })).toBe('Cancellation requested — waiting for Principal approval.')
    expect(fundNote(LOANS[3])).toBe('Repaid in full.')
    expect(fundNote(LOANS[4])).toBe('Cancelled.')
  })

  it('draws the trail: Created, then Disbursed / Received by its approver, then where it went', () => {
    expect(fundTrail(LOANS[0])).toEqual([
      { label: 'Created', by: 'Aina', at: '2026-10-04T02:00:00Z', on: null, state: 'done' },
      { label: 'Disbursed', by: 'Principal', at: '2026-10-05T03:00:00Z', on: null, state: 'done' },
    ])
    expect(fundTrail(LOANS[2]).map((s) => [s.label, s.state])).toEqual([
      ['Created', 'done'],
      ['Disbursed', 'todo'],
    ])
    expect(fundTrail(LOANS[4]).map((s) => [s.label, s.state])).toEqual([
      ['Created', 'done'],
      ['Cancelled', 'bad'],
    ])
    // An imported deal with no approval on record: the day the money moved.
    expect(fundTrail(deal({ approvedAt: null, approvedBy: null }))[1]).toEqual({ label: 'Disbursed', by: null, at: null, on: '2026-10-05', state: 'done' })
    expect(fundTrail(deal({ side: 'in', status: 'repaid', repaidAt: '2026-12-01T01:00:00Z', repaidBy: 'Carrie' })).map((s) => [s.label, s.by])).toEqual([
      ['Created', 'Aina'],
      ['Received', 'Principal'],
      ['Repaid', 'Carrie'],
    ])
  })
})
