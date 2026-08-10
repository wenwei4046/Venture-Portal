import { describe, it, expect } from 'vitest'
import {
  autoMatch, nameSimilarity, parseAmount, parseDate, parseStatementRows, csvToRows,
} from './bank-recon'

describe('autoMatch — amount first, name second, date last', () => {
  it('same amount twice: names decide who pairs with whom', () => {
    const statement = [
      { key: 's1', date: '2026-07-05', description: 'IBG HOOKKA SDN BHD', amount: -10000 },
      { key: 's2', date: '2026-07-05', description: 'IBG OHANA MARKETING', amount: -10000 },
    ]
    const book = [
      { key: 'b1', date: '2026-07-20', description: 'Loan disbursement — Ohana', amount: -10000 },
      { key: 'b2', date: '2026-07-21', description: 'Loan disbursement — Hookka', amount: -10000 },
    ]
    const r = autoMatch(statement, book)
    const map = new Map(r.pairs.map(p => [p.statementKey, p.bookKey]))
    expect(map.get('s1')).toBe('b2') // Hookka ↔ Hookka despite dates being far
    expect(map.get('s2')).toBe('b1')
    expect(r.unmatchedStatement).toHaveLength(0)
    expect(r.unmatchedBook).toHaveLength(0)
  })

  it('different amounts never match; leftovers reported both sides', () => {
    const r = autoMatch(
      [{ key: 's1', date: '2026-07-01', description: 'X', amount: 500 }],
      [{ key: 'b1', date: '2026-07-01', description: 'X', amount: 500.01 }],
    )
    expect(r.pairs).toHaveLength(0)
    expect(r.unmatchedStatement).toEqual(['s1'])
    expect(r.unmatchedBook).toEqual(['b1'])
  })

  it('date breaks ties when names are equally blank', () => {
    const r = autoMatch(
      [{ key: 's1', date: '2026-07-10', description: '', amount: 999 }],
      [
        { key: 'bFar', date: '2026-07-30', description: '', amount: 999 },
        { key: 'bNear', date: '2026-07-11', description: '', amount: 999 },
      ],
    )
    expect(r.pairs[0].bookKey).toBe('bNear')
    expect(r.unmatchedBook).toEqual(['bFar'])
  })

  it('money-in never pairs with money-out of the same magnitude', () => {
    const r = autoMatch(
      [{ key: 's1', date: '2026-07-01', description: 'refund', amount: 250 }],
      [{ key: 'b1', date: '2026-07-01', description: 'refund', amount: -250 }],
    )
    expect(r.pairs).toHaveLength(0)
  })
})

describe('nameSimilarity', () => {
  it('overlapping company tokens score high', () => {
    expect(nameSimilarity('IBG HOOKKA SDN BHD', 'Loan — Hookka')).toBeGreaterThan(0.4)
    expect(nameSimilarity('IBG HOOKKA SDN BHD', 'Salary CHOW WAI MAN')).toBe(0)
  })
})

describe('parseAmount', () => {
  it('handles MY bank formats', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('(1,234.56)')).toBe(-1234.56)
    expect(parseAmount('1,234.56-')).toBe(-1234.56)
    expect(parseAmount('1,234.56CR')).toBe(1234.56)
    expect(parseAmount('1,234.56DR')).toBe(-1234.56)
    expect(parseAmount('RM 300.00')).toBe(300)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-')).toBeNull()
  })
})

describe('parseDate', () => {
  it('handles DD/MM/YYYY, YYYY-MM-DD, D MMM YYYY', () => {
    expect(parseDate('05/07/2026')).toBe('2026-07-05')
    expect(parseDate('2026-07-05')).toBe('2026-07-05')
    expect(parseDate('5 Jul 2026')).toBe('2026-07-05')
    expect(parseDate('31-12-26')).toBe('2026-12-31')
    expect(parseDate('garbage')).toBeNull()
  })
})

describe('parseStatementRows', () => {
  it('finds the header below a letterhead and splits debit/credit', () => {
    const rows = csvToRows(
      [
        'HONG LEONG BANK BERHAD',
        'Account: 123-456-7890,,,,',
        'Date,Description,Debit,Credit,Balance',
        '01/07/2026,OPENING BALANCE,,,"108,189.60"',
        '05/07/2026,IBG TRANSFER HOOKKA,"10,000.00",,"98,189.60"',
        '08/07/2026,DEPOSIT 2990,,"5,000.00","103,189.60"',
        ',,,,',
      ].join('\n'),
    )
    const r = parseStatementRows(rows)
    if ('error' in r) throw new Error(r.error)
    expect(r.lines).toEqual([
      { date: '2026-07-05', description: 'IBG TRANSFER HOOKKA', amount: -10000 },
      { date: '2026-07-08', description: 'DEPOSIT 2990', amount: 5000 },
    ])
    expect(r.skipped).toBe(2) // opening-balance row (no amount) + trailing blank row
  })

  it('reports a clear error when no header is recognisable', () => {
    const r = parseStatementRows([['random'], ['junk']])
    expect('error' in r).toBe(true)
  })
})
