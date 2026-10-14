import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { voucherChangeLine } from './voucher-page'

// The full page's audit log (2026-10-14, the Finance revamp v2 — D06): each
// change to the voucher, and to its files, in a line — what `audit_changes()`
// handed this reader, said as the people who made it would say it.

const change = (over: Partial<Parameters<typeof voucherChangeLine>[0]>) => ({
  table_name: 'payment_vouchers',
  op: 'UPDATE' as const,
  old_row: {},
  new_row: {},
  changed: [],
  masked: [],
  ...over,
})

describe('voucherChangeLine', () => {
  it('says what was created, for how much, to whom', () => {
    expect(voucherChangeLine(change({ op: 'INSERT', new_row: { voucher_no: 'HV-PV-202610-0520', amount: 442.64, payee_name: 'Tan Yong Hong' } }))).toBe(
      'Created HV-PV-202610-0520 · RM 442.64 · Tan Yong Hong',
    )
  })

  it('names the step a status took', () => {
    const step = (from: string, to: string) => voucherChangeLine(change({ changed: ['status'], old_row: { status: from }, new_row: { status: to } }))
    expect(step('draft', 'pending_approval')).toBe('Submitted for approval')
    expect(step('pending_approval', 'draft')).toBe('Returned to draft')
    expect(step('pending_approval', 'paid')).toBe('Approved and paid')
    expect(step('paid', 'voided')).toBe('Voided — entries reversed')
  })

  it('tells an amount and a date before → after, and the rest as changed', () => {
    expect(
      voucherChangeLine(change({ changed: ['amount', 'description'], old_row: { amount: 442.64 }, new_row: { amount: 447.68 } })),
    ).toBe('Amount RM 442.64 → RM 447.68 · Description changed')
    expect(voucherChangeLine(change({ changed: ['payment_date'], old_row: { payment_date: '2026-10-01' }, new_row: { payment_date: '2026-10-03' } }))).toBe(
      'Payment date 01 Oct 2026 → 03 Oct 2026',
    )
    expect(voucherChangeLine(change({ changed: ['bank_account_id'] }))).toBe('Bank changed')
  })

  it('leaves out what an approval writes beside its status', () => {
    expect(
      voucherChangeLine(change({ changed: ['status', 'approved_by', 'approved_at', 'executed_at', 'journal_entry_id'], old_row: { status: 'pending_approval' }, new_row: { status: 'paid' } })),
    ).toBe('Approved and paid')
  })

  it('says a file was added or taken off, by its name', () => {
    expect(voucherChangeLine(change({ table_name: 'payment_attachments', op: 'INSERT', new_row: { file_name: 'Receipt-2125.pdf' } }))).toBe('Attachment added · Receipt-2125.pdf')
    expect(voucherChangeLine(change({ table_name: 'payment_attachments', op: 'DELETE', old_row: { file_name: 'old.pdf' } }))).toBe('Attachment removed · old.pdf')
  })

  it('never shows a value the reader may not see', () => {
    expect(voucherChangeLine(change({ changed: ['notes'], masked: ['notes'], old_row: { notes: 'secret' }, new_row: { notes: 'other' } }))).toBe('Notes changed')
  })
})
