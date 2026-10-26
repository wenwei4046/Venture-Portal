import { describe, expect, it } from 'vitest'
import { halfOverride, rowsChanged, storedVoucherFields, voucherEditForm, voucherEditsNothing } from './voucher-edit'

// A voucher's Edit sends only what changed from the voucher AS STORED
// (2026-10-16 — the user's rule of 2026-10-14).

const V = {
  amount: 1950,
  payee_name: 'Director',
  payee_company_id: null,
  bank_account_id: 'bank',
  description: 'Loan Installment',
  notes: null,
  payment_method: 'bank_transfer',
  payment_date: '2026-09-08' as string | null,
  target_pool: null,
}
const ROWS = [{ pool: 'venture_pool', amount: '1950.00', account_code: '1010', override_account_type: '', override_gl_account_code: '', override_reason: '' }]
const entries = (fd: FormData) => Object.fromEntries(fd.entries())

describe('a voucher’s Edit — what is sent', () => {
  it('an untouched form sends nothing but the voucher; an amount typed differently is no change', () => {
    const was = storedVoucherFields(V, ROWS, null)
    expect(voucherEditsNothing(voucherEditForm('pv', 'debit', was, { ...was, amount: '1950', rows: [{ ...ROWS[0], amount: '1950' }] }))).toBe(true)
  })

  it('a voucher saved without a date sends the date the form opened on — a change from what is stored', () => {
    const was = storedVoucherFields({ ...V, payment_date: null }, ROWS, null)
    expect(entries(voucherEditForm('pv', 'debit', was, { ...was, paymentDate: '2026-10-16' }))).toEqual({ id: 'pv', payment_date: '2026-10-16' })
  })

  it('a repayment’s lump row rebuilt into principal and interest is sent whole, with its overrides only when complete', () => {
    const was = storedVoucherFields(V, ROWS, null)
    const rows = [
      { pool: 'venture_pool', amount: '1500.00', account_code: '4054' },
      { pool: 'venture_pool', amount: '450.00', account_code: '6000', override_account_type: 'expense', override_gl_account_code: '9000', override_reason: 'booked as G&A' },
    ]
    expect(rowsChanged(was.rows, rows)).toBe(true)
    expect(entries(voucherEditForm('pv', 'debit', was, { ...was, rows }))).toEqual({
      id: 'pv',
      source_rows_count: '2',
      'source_rows[0][pool]': 'venture_pool',
      'source_rows[0][amount]': '1500.00',
      'source_rows[0][account_code]': '4054',
      'source_rows[1][pool]': 'venture_pool',
      'source_rows[1][amount]': '450.00',
      'source_rows[1][account_code]': '6000',
      'source_rows[1][override_account_type]': 'expense',
      'source_rows[1][override_gl_account_code]': '9000',
      'source_rows[1][override_reason]': 'booked as G&A',
    })
  })

  it('a line’s words are part of it (2026-10-22): changed alone, the lines go, each with its words', () => {
    const stored = [{ ...ROWS[0], description: 'September rent' }]
    const was = storedVoucherFields(V, stored, null)
    expect(voucherEditsNothing(voucherEditForm('pv', 'debit', was, { ...was, rows: [{ ...stored[0], description: ' September rent ' }] }))).toBe(true)
    const rows = [{ ...stored[0], description: 'October rent' }]
    expect(rowsChanged(was.rows, rows)).toBe(true)
    expect(entries(voucherEditForm('pv', 'debit', was, { ...was, rows }))).toEqual({
      id: 'pv',
      source_rows_count: '1',
      'source_rows[0][pool]': 'venture_pool',
      'source_rows[0][amount]': '1950.00',
      'source_rows[0][account_code]': '1010',
      'source_rows[0][description]': 'October rent',
    })
  })

  it('a receipt sends its pool and account each only when changed', () => {
    const was = storedVoucherFields({ ...V, target_pool: 'venture_pool' }, [], '5000')
    expect(entries(voucherEditForm('pr', 'credit', was, { ...was, accountCode: '5010', notes: 'reclassed' }))).toEqual({ id: 'pr', notes: 'reclassed', account_code: '5010' })
  })

  it('finds an override half filled', () => {
    expect(halfOverride([{ pool: 'p', amount: '1', account_code: '9000', override_account_type: 'expense' }])).toBe(0)
    expect(halfOverride(ROWS)).toBeNull()
  })
})
