import { describe, expect, it } from 'vitest'
import { matches, payeesOf, rowsOf, typeOf, type HubRow } from './hub-model'

// The Approvals hub's model (2026-10-17): what a card lists, what a search finds, a row's kind and who it pays.

const member = (id: string, isVoucher: boolean) => ({ id, label: id, sub: '', amount: 1, isVoucher, open: null, decision: null })
const row = (over: Partial<HubRow> & { key: string }): HubRow => ({
  kind: 'single',
  id: over.key,
  groupId: null,
  title: 'Office rental',
  desc: '',
  amount: 1000,
  hasAmount: true,
  items: 1,
  why: null,
  executive: false,
  hasVoucher: true,
  splittable: false,
  members: [],
  decision: null,
  types: ['payment_voucher'],
  no: null,
  sentBy: 'Carrie',
  on: '',
  name: 'Landlord Sdn Bhd',
  type: 'Payment voucher',
  at: null,
  pool: 'Venture Pool',
  category: 'Office Rental',
  payBy: '',
  files: 0,
  ...over,
})

describe('typeOf', () => {
  it('names a request by its kind, a combined approval by what it holds', () => {
    expect(typeOf({ kind: 'single', types: ['new_loan'], members: [] })).toBe('New loan')
    expect(typeOf({ kind: 'group', types: ['payment_voucher'], members: [member('a', true), member('b', true)] })).toBe('Payment voucher × 2')
    expect(typeOf({ kind: 'group', types: ['new_loan', 'payment_voucher'], members: [member('a', true), member('b', false)] })).toBe('New loan + PV')
  })
})

describe('payeesOf', () => {
  it('one payee by name, several as the first and how many more, blanks left out', () => {
    expect(payeesOf(['Landlord Sdn Bhd', 'Landlord Sdn Bhd'])).toBe('Landlord Sdn Bhd')
    expect(payeesOf(['Aina', 'Bala', null, ' ', 'Chong'])).toBe('Aina + 2 more')
    expect(payeesOf([])).toBe('')
  })
})

describe('rowsOf', () => {
  const hub = { pending: [row({ key: 'a', executive: true }), row({ key: 'b' })], decided: [row({ key: 'd', decision: 'approved' })] }
  it('Pending lists what waits but what was decided here; the executive’s only theirs; Decided the decided', () => {
    expect(rowsOf(hub, 'pending').map((r) => r.key)).toEqual(['a', 'b'])
    expect(rowsOf(hub, 'pending', new Set(['a'])).map((r) => r.key)).toEqual(['b'])
    expect(rowsOf(hub, 'exec').map((r) => r.key)).toEqual(['a'])
    expect(rowsOf(hub, 'exec', new Set(['a']))).toEqual([])
    expect(rowsOf(hub, 'decided').map((r) => r.key)).toEqual(['d'])
  })
})

describe('matches', () => {
  it('finds by the number, who is paid, the request, its kind, who sent it, the pool and the category', () => {
    const r = row({ key: 'a', no: 'HV-PV-202610-0471' })
    for (const q of ['0471', 'landlord', 'RENTAL', 'payment voucher', 'carrie', 'venture pool', 'office rental', '  ']) expect(matches(r, q)).toBe(true)
    expect(matches(r, 'payroll')).toBe(false)
  })
})
