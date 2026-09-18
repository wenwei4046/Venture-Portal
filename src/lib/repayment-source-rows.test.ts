import { describe, it, expect } from 'vitest'
import { buildRepaymentSourceRows, type RepaymentSourceRow } from './repayment-source-rows'

const COA = new Set(['4054', '4058', '6000', '9096', '1010'])
const has = (c: string) => COA.has(c)

describe('buildRepaymentSourceRows', () => {
  it('principal → the fund source account, interest → 6000, penalty → 9096, one row each', () => {
    const rows = buildRepaymentSourceRows([], { principal: 1500, interest: 450, penalty: 0 }, '4054', has)
    expect(rows).toEqual([
      { role: 'principal', pool: 'venture_pool', amount: '1500.00', account_code: '4054', autoAccount: true },
      { role: 'interest', pool: 'venture_pool', amount: '450.00', account_code: '6000', autoAccount: true },
    ])
  })

  it('a zero component has no row; a penalty gets its own', () => {
    const rows = buildRepaymentSourceRows([], { principal: 100000, interest: 0, penalty: 500 }, '4058', has)
    expect(rows.map((r) => [r.role, r.account_code])).toEqual([['principal', '4058'], ['penalty', '9096']])
  })

  it('a hand-picked account survives a split edit; an auto one follows the fund source', () => {
    const prev: RepaymentSourceRow[] = [
      { role: 'principal', pool: 'dept_pool_finance', amount: '1500.00', account_code: '1010', autoAccount: false },
      { role: 'interest', pool: 'venture_pool', amount: '450.00', account_code: '6000', autoAccount: true },
    ]
    const rows = buildRepaymentSourceRows(prev, { principal: 1600, interest: 400, penalty: 0 }, '4058', has)
    expect(rows[0]).toEqual({ role: 'principal', pool: 'dept_pool_finance', amount: '1600.00', account_code: '1010', autoAccount: false })
    expect(rows[1]).toEqual({ role: 'interest', pool: 'venture_pool', amount: '400.00', account_code: '6000', autoAccount: true })
  })

  it('leaves the account blank when the default is not an active COA code', () => {
    const rows = buildRepaymentSourceRows([], { principal: 10, interest: 1, penalty: 0 }, '4999', (c) => c === '6000')
    expect(rows.map((r) => r.account_code)).toEqual(['', '6000'])
    expect(buildRepaymentSourceRows([], { principal: 10, interest: 0, penalty: 0 }, null, has)[0].account_code).toBe('')
  })

  it('rows without a role (hand-added before ticking repayment) are dropped', () => {
    const rows = buildRepaymentSourceRows([{ pool: 'venture_pool', amount: '5.00', account_code: '9000' }], { principal: 10, interest: 0, penalty: 0 }, '4054', has)
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe('principal')
  })
})
