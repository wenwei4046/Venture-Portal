import { describe, it, expect } from 'vitest'
import { payerExpenseSplits } from './inter-billing-nature'

const typeOf = (code: string) =>
  ({ '9091': 'expense', '9087': 'expense', '7012': 'other_income', '5020': 'revenue' })[code]

describe('payerExpenseSplits', () => {
  it('maps income categories to their payer expense counterparts', () => {
    expect(
      payerExpenseSplits([{ category_code: '7012', amount: 100 }], 100, null, typeOf, '9051'),
    ).toEqual([{ accountCode: '9094', amount: 100 }])
    expect(
      payerExpenseSplits([{ category_code: '5020', amount: 50 }], 50, null, typeOf, '9056'),
    ).toEqual([{ accountCode: '9030', amount: 50 }])
  })

  it('keeps expense-recovery categories on the same account', () => {
    expect(
      payerExpenseSplits([{ category_code: '9091', amount: 75.5 }], 75.5, null, typeOf, '9051'),
    ).toEqual([{ accountCode: '9091', amount: 75.5 }])
  })

  it('falls back to the dept 905x for uncategorised lines', () => {
    expect(
      payerExpenseSplits([{ category_code: null, amount: 10 }], 10, null, typeOf, '9051'),
    ).toEqual([{ accountCode: '9051', amount: 10 }])
  })

  it('groups multi-nature invoices into one split per account', () => {
    const splits = payerExpenseSplits(
      [
        { category_code: '7012', amount: 60 },
        { category_code: '9091', amount: 25 },
        { category_code: '7012', amount: 15 },
      ],
      100, null, typeOf, '9051',
    )
    expect(splits).toContainEqual({ accountCode: '9094', amount: 75 })
    expect(splits).toContainEqual({ accountCode: '9091', amount: 25 })
  })

  it('uses the header category for single-line legacy invoices', () => {
    expect(payerExpenseSplits([], 200, '7012', typeOf, '9051')).toEqual([
      { accountCode: '9094', amount: 200 },
    ])
  })
})
