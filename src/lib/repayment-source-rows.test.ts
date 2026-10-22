import { describe, it, expect } from 'vitest'
import { buildRepaymentSourceRows, seedRepaymentSourceRows, type RepaymentSourceRow } from './repayment-source-rows'

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

  it('a part’s own words go with it through a split edit (2026-10-22)', () => {
    const prev: Partial<RepaymentSourceRow>[] = [{ role: 'interest', pool: 'venture_pool', amount: '450.00', account_code: '6000', autoAccount: true, description: 'October interest' }]
    const rows = buildRepaymentSourceRows(prev, { principal: 1500, interest: 460, penalty: 0 }, '4054', has)
    expect(rows.map((r) => [r.role, r.description])).toEqual([['principal', undefined], ['interest', 'October interest']])
  })

  it('rows without a role (hand-added before ticking repayment) are dropped', () => {
    const rows = buildRepaymentSourceRows([{ pool: 'venture_pool', amount: '5.00', account_code: '9000' }], { principal: 10, interest: 0, penalty: 0 }, '4054', has)
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe('principal')
  })
})

// ─── seedRepaymentSourceRows (edit form: saved rows get roles) ───────────────

describe('seedRepaymentSourceRows', () => {
  const split = { principal: 1500, interest: 450, penalty: 0 }

  it('matches saved rows to components by amount and keeps their pool + account', () => {
    const rows = seedRepaymentSourceRows(
      [{ pool: 'venture_pool', amount: '450.00', account_code: '5027' }, { pool: 'dept_pool_finance', amount: '1500.00', account_code: '4054' }],
      split, '4054', has,
    )
    expect(rows).toEqual([
      { role: 'principal', pool: 'dept_pool_finance', amount: '1500.00', account_code: '4054', autoAccount: true }, // = default
      { role: 'interest', pool: 'venture_pool', amount: '450.00', account_code: '5027', autoAccount: false }, // kept, flagged manual
    ])
  })

  it('keeps a matched saved row’s own words (2026-10-22)', () => {
    const rows = seedRepaymentSourceRows(
      [{ pool: 'venture_pool', amount: '1500.00', account_code: '4054', description: 'Principal 2/6' }, { pool: 'venture_pool', amount: '450.00', account_code: '6000' }],
      split, '4054', has,
    )
    expect(rows.map((r) => r.description)).toEqual(['Principal 2/6', undefined])
  })

  it('fills a blank saved account with the default', () => {
    const rows = seedRepaymentSourceRows([{ pool: 'venture_pool', amount: '1500.00', account_code: '' }, { pool: '', amount: '450.00', account_code: '' }], split, '4054', has)
    expect(rows.map((r) => [r.account_code, r.pool, r.autoAccount])).toEqual([['4054', 'venture_pool', true], ['6000', 'venture_pool', true]])
  })

  it('rebuilds from the split when the saved rows are one lump or leave leftovers', () => {
    const lump = seedRepaymentSourceRows([{ pool: 'venture_pool', amount: '1950.00', account_code: '1010' }], split, '4054', has)
    expect(lump.map((r) => [r.role, r.account_code])).toEqual([['principal', '4054'], ['interest', '6000']])
    const extra = seedRepaymentSourceRows(
      [{ pool: 'venture_pool', amount: '1500.00', account_code: '4054' }, { pool: 'venture_pool', amount: '450.00', account_code: '6000' }, { pool: 'venture_pool', amount: '5.00', account_code: '9000' }],
      split, '4054', has,
    )
    expect(extra).toHaveLength(2)
    expect(extra.every((r) => r.autoAccount)).toBe(true)
  })
})
