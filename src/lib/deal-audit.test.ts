import { describe, expect, it } from 'vitest'
import { dealChangeLine } from './deal-audit'

// A deal's audit log in words (2026-10-15, the Finance revamp v2 — D06's
// *Audit log* on a loan's and a fund source's full page).

const upd = (table: string, old_row: Record<string, unknown>, new_row: Record<string, unknown>, changed: string[]) => ({ op: 'UPDATE' as const, table_name: table, old_row, new_row, changed })

describe('a deal’s change in words', () => {
  it('says what was created, and what its status became', () => {
    expect(dealChangeLine({ op: 'INSERT', table_name: 'loans', old_row: null, new_row: { principal: 60000 }, changed: null })).toBe('Created · RM 60,000.00')
    expect(dealChangeLine({ op: 'INSERT', table_name: 'fund_sources', old_row: null, new_row: { amount: 30000 }, changed: null })).toBe('Created · RM 30,000.00')
    expect(dealChangeLine(upd('loans', { status: 'pending_approval' }, { status: 'active' }, ['status', 'approved_by', 'approved_at']))).toBe('Approved — disbursed')
    expect(dealChangeLine(upd('fund_sources', { status: 'pending_approval' }, { status: 'active' }, ['status']))).toBe('Approved — received')
    expect(dealChangeLine(upd('loans', { status: 'active' }, { status: 'fully_repaid' }, ['status']))).toBe('Fully repaid')
    expect(dealChangeLine(upd('fund_sources', { status: 'active' }, { status: 'cancelled' }, ['status']))).toBe('Cancelled')
  })

  it('says a term changed, before → after', () => {
    expect(dealChangeLine(upd('loans', { effective_rate: 0.04, tenure_months: 6 }, { effective_rate: 0.035, tenure_months: 12 }, ['effective_rate', 'tenure_months']))).toBe('Rate 4.000% → 3.500% /mo · Term 6 months → 12 months')
    expect(dealChangeLine(upd('fund_sources', { amount: 30000 }, { amount: 25000 }, ['amount', 'updated_at']))).toBe('Amount RM 30,000.00 → RM 25,000.00')
    expect(dealChangeLine(upd('loans', { repayment_start_date: null }, { repayment_start_date: '2026-05-20' }, ['repayment_start_date', 'repayment_start_month']))).toBe('First repayment none → 20 May 2026')
    expect(dealChangeLine(upd('fund_sources', { compound_interest: false }, { compound_interest: true }, ['compound_interest']))).toBe('Compound interest on')
    expect(dealChangeLine(upd('loans', { lock_in_months: 3 }, { lock_in_months: null }, ['lock_in_months']))).toBe('Term 3 months → no fixed term')
    // Bookkeeping a person did not change says nothing of its own.
    expect(dealChangeLine(upd('loans', {}, {}, ['updated_at', 'version']))).toBe('Updated')
  })

  it('says a repayment recorded, removed or changed', () => {
    const row = { payment_type: 'interest', amount: 2400, payment_date: '2026-09-02' }
    expect(dealChangeLine({ op: 'INSERT', table_name: 'repayments', old_row: null, new_row: row, changed: null })).toBe('Repayment recorded · Interest RM 2,400.00 · 02 Sep 2026')
    expect(dealChangeLine({ op: 'DELETE', table_name: 'fund_source_repayments', old_row: row, new_row: null, changed: null })).toBe('Repayment removed · Interest RM 2,400.00 · 02 Sep 2026')
    expect(dealChangeLine(upd('repayments', row, { ...row, amount: 2000 }, ['amount']))).toBe('Repayment Interest RM 2,400.00 → RM 2,000.00')
  })
})
