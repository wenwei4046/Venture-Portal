import { describe, expect, it } from 'vitest'
import { sourceEditFieldsOf, sourceEditForm, sourceEditPatch, sourceEditsNothing, type SourceEditFields, type SourceEditRow } from './fund-source-edit'

// A pending fund source's Edit sends and writes only what changed (2026-10-16
// — the user's rule of 2026-10-14), its rules checked on the row as it will
// stand: updateFundSource's own words.

const WAS: SourceEditFields = {
  amount: '80000.00',
  ratePct: '0.500',
  months: '12',
  effectiveDate: '2026-10-01',
  repaymentDate: '2026-11-01',
  notes: 'lent to: CMI',
  accountCode: '4056',
  bankId: 'bank-hl',
}
const ROW: SourceEditRow = { amount: 80000, cost_rate: 0.005, lock_in_months: 12, effective_date: '2026-10-01', repayment_date: '2026-11-01' }
const NOW = '2026-10-16T01:00:00.000Z'
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  fd.set('id', 's1')
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('a pending fund source’s Edit', () => {
  it('sends only the fields changed, under the form’s names', () => {
    expect(sourceEditsNothing(sourceEditForm('s1', WAS, { ...WAS, ratePct: '0.5', amount: '80000' }))).toBe(true)
    const fd = sourceEditForm('s1', WAS, { ...WAS, amount: '85000', notes: ' lent to: CMI · HC ', bankId: 'bank-mb' })
    expect(Object.fromEntries(fd.entries())).toEqual({ id: 's1', amount: '85000', notes: 'lent to: CMI · HC', bank_account_id: 'bank-mb' })
  })

  it('reads the desktop form back by its names', () => {
    const fd = form({ amount: '80000.00', cost_rate_percent: '0.500', lock_in_months: '12', effective_date: '2026-10-01', repayment_date: '2026-11-01', notes: 'lent to: CMI', account_code: '4056', bank_account_id: 'bank-hl' })
    expect(sourceEditFieldsOf(fd)).toEqual(WAS)
  })

  it('writes only what was sent, and what moves with it', () => {
    const edit = sourceEditPatch(ROW, form({ amount: '85000' }), '2026-10-16', NOW)
    expect(edit).toEqual({ ok: true, patch: { amount: 85000, updated_at: NOW }, amount: 85000, ratePct: 0.5, effectiveDate: '2026-10-01' })
    const later = sourceEditPatch(ROW, form({ repayment_date: '2026-12-15' }), '2026-10-16', NOW)
    expect(later.ok && later.patch).toEqual({ repayment_date: '2026-12-15', repayment_start_month: '2026-12-01', maturity_date: '2026-12-15', updated_at: NOW })
  })

  it('a blank account, bank or period clears it — the defaults at approval, no fixed term', () => {
    const edit = sourceEditPatch(ROW, form({ account_code: '', bank_account_id: '', lock_in_months: '' }), '2026-10-16', NOW)
    expect(edit.ok && edit.patch).toEqual({ account_code: null, bank_account_id: null, lock_in_months: null, principal_per_month: null, updated_at: NOW })
  })

  it('checks the row as it will stand, in updateFundSource’s words', () => {
    expect(sourceEditPatch(ROW, form({ amount: '0' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Amount must be greater than 0' })
    expect(sourceEditPatch(ROW, form({ cost_rate_percent: '100' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Interest rate must be between 0 and 100%' })
    expect(sourceEditPatch(ROW, form({ lock_in_months: '0' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Repayment period must be at least 1 month' })
    expect(sourceEditPatch(ROW, form({ effective_date: '2026-10-17' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Effective date cannot be in the future' })
    // The effective day moved past the repayment left as it was.
    expect(sourceEditPatch(ROW, form({ effective_date: '2026-10-16', repayment_date: '2026-10-10' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Repayment date must be on or after effective date' })
    expect(sourceEditPatch({ ...ROW, repayment_date: '2026-10-05' }, form({ effective_date: '2026-10-16' }), '2026-10-16', NOW)).toEqual({ ok: false, reason: 'Repayment date must be on or after effective date' })
  })
})
