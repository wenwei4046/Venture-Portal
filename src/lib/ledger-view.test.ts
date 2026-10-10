import { describe, expect, it } from 'vitest'
import { hasLedgerActivity, ledgerDeptNames, ledgerExportHref, ledgerPeriodLabel } from './ledger-view'

// 2026-10-09 — the General Ledger's head (the user's Claude Design handoff).

describe('the ledger period', () => {
  it('names a month once, a year once', () => {
    expect(ledgerPeriodLabel('2026-10-01', '2026-10-31')).toBe('01 – 31 October 2026')
    expect(ledgerPeriodLabel('2026-09-15', '2026-10-09')).toBe('15 Sep – 09 Oct 2026')
    expect(ledgerPeriodLabel('2025-12-01', '2026-01-31')).toBe('01 Dec 2025 – 31 Jan 2026')
  })
})

describe('an account with activity', () => {
  const led = (lines: number, opening: number, closing: number) => ({ lines: Array.from({ length: lines }), openingBalance: opening, closingBalance: closing })
  it('has a line beyond its balance brought forward, or a balance', () => {
    expect(hasLedgerActivity(led(2, 0, 0))).toBe(true)
    expect(hasLedgerActivity(led(1, 500, 500))).toBe(true)
    expect(hasLedgerActivity(led(1, 0, 0))).toBe(false)
  })
})

describe('the ledger export link', () => {
  it('carries the picked accounts, the period and Show zero', () => {
    expect(ledgerExportHref('xlsx', { codes: [], from: '2026-10-01', to: '2026-10-31', showZero: false })).toBe('/reports/ledger/export?format=xlsx&from=2026-10-01&to=2026-10-31')
    expect(ledgerExportHref('pdf', { codes: ['1010', '5027'], from: '2026-10-01', to: '2026-10-31', showZero: true })).toBe(
      '/reports/ledger/export?format=pdf&codes=1010%2C5027&from=2026-10-01&to=2026-10-31&showZero=1',
    )
  })
})

// 2026-10-10 — the Dept column names the departments added since the five.
describe('the ledger’s department names', () => {
  it('names each extra department by its segment', () => {
    expect(ledgerDeptNames([{ value: 'it', label: 'IT' }, { value: 'revenue_department', label: 'Revenue Department' }])).toEqual({
      it: 'IT',
      revenue_department: 'Revenue Department',
    })
    expect(ledgerDeptNames([])).toEqual({})
  })
})
