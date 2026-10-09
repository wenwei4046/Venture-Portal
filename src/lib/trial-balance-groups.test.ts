import { describe, expect, it } from 'vitest'
import { groupTrialBalance } from './trial-balance-groups'

// 2026-10-09 — the Trial Balance per the user's Claude Design handoff:
// accounts grouped by type (Assets, Liabilities, Equity, Revenue, …), each
// type's accounts under their top-level parent, with totals at each level.

const row = (code: string, name: string, type: string, debit: number, credit: number) => ({ code, name, type, debit, credit })
const COA = [
  { code: '1000', name: 'Current assets', parent_code: null },
  { code: '1010', name: 'Cash — Hong Leong', parent_code: '1000' },
  { code: '1020', name: 'Cash — Alliance', parent_code: '1000' },
  { code: '1100', name: 'Bank deposits', parent_code: '1000' },
  { code: '1110', name: 'Fixed deposit', parent_code: '1100' },
  { code: '1200', name: 'Loans to subsidiaries', parent_code: null },
  { code: '2100', name: 'Fund sources', parent_code: null },
  { code: '5100', name: 'Interest expense', parent_code: null },
]

describe('the trial balance in groups', () => {
  const blocks = groupTrialBalance(
    [
      row('5100', 'Interest expense', 'expense', 268400, 0),
      row('1010', 'Cash — Hong Leong', 'asset', 2095750, 0),
      row('1020', 'Cash — Alliance', 'asset', 1014700, 0),
      row('1110', 'Fixed deposit', 'asset', 50000, 0),
      row('1200', 'Loans to subsidiaries', 'asset', 3160500, 0),
      row('2100', 'Fund sources', 'liability', 0, 6589350),
    ],
    COA,
  )

  it('orders the types as the statement does, each with its total', () => {
    expect(blocks.map((b) => [b.title, b.total, b.debit, b.credit])).toEqual([
      ['Assets', 'Total assets', 6320950, 0],
      ['Liabilities', 'Total liabilities', 0, 6589350],
      ['Expenses', 'Total expenses', 268400, 0],
    ])
  })

  it('puts each account under its top-level parent, a parent of one standing alone', () => {
    const assets = blocks[0]
    expect(assets.groups.map((g) => [g.code, g.name, g.items.map((i) => i.code), g.debit])).toEqual([
      ['1000', 'Current assets', ['1010', '1020', '1110'], 3160450],
      ['1200', 'Loans to subsidiaries', ['1200'], 3160500],
    ])
  })
})
