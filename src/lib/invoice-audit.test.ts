import { describe, expect, it } from 'vitest'
import { invoiceChangeLine, invoiceTrail, type DatedInvoiceChange } from './invoice-audit'

// An invoice's audit log and trail in words (2026-10-15, the Finance revamp v2
// — D06's *Trail* and *Audit log* on an invoice's full page).

const upd = (old_row: Record<string, unknown>, new_row: Record<string, unknown>, changed: string[]) => ({ op: 'UPDATE' as const, table_name: 'invoices', old_row, new_row, changed })

describe('an invoice’s change in words', () => {
  it('says what was created — a draft, or an invoice made issued', () => {
    expect(invoiceChangeLine({ op: 'INSERT', table_name: 'invoices', old_row: null, new_row: { invoice_no: 'HV-INV-202610-0012', total_amount: 1200, status: 'draft' }, changed: null })).toBe(
      'Created HV-INV-202610-0012 · RM 1,200.00',
    )
    expect(invoiceChangeLine({ op: 'INSERT', table_name: 'invoices', old_row: null, new_row: { invoice_no: 'HV-INV-202610-0013', total_amount: 5797.4, status: 'issued' }, changed: null })).toBe(
      'Created HV-INV-202610-0013 · RM 5,797.40 · issued',
    )
    expect(invoiceChangeLine({ op: 'DELETE', table_name: 'invoices', old_row: { status: 'draft' }, new_row: null, changed: null })).toBe('Deleted')
  })

  it('says each status it moved to', () => {
    expect(invoiceChangeLine(upd({ status: 'draft' }, { status: 'issued' }, ['status']))).toBe('Approved & issued — posted to the GL')
    expect(invoiceChangeLine(upd({ status: 'issued' }, { status: 'paid', settlement_voucher_id: 'v1' }, ['status', 'settlement_voucher_id']))).toBe('Paid')
    expect(invoiceChangeLine(upd({ status: 'issued' }, { status: 'paid_via_netting' }, ['status']))).toBe('Paid via netting')
    expect(invoiceChangeLine(upd({ status: 'paid' }, { status: 'voided' }, ['description', 'status']))).toBe('Description changed · Voided — entries reversed')
    expect(invoiceChangeLine(upd({ status: 'paid' }, { status: 'issued' }, ['status']))).toBe('Back to issued')
  })

  it('says a field changed, before → after; the party and its contact once each', () => {
    expect(invoiceChangeLine(upd({ total_amount: 1200, base_amount: 1200 }, { total_amount: 1000, base_amount: 1000 }, ['total_amount', 'base_amount']))).toBe('Amount RM 1,200.00 → RM 1,000.00')
    expect(invoiceChangeLine(upd({ category_code: '5020' }, { category_code: '5030' }, ['category_code']))).toBe('Account 5020 → 5030')
    expect(invoiceChangeLine(upd({ invoice_date: '2026-09-30', due_date: null }, { invoice_date: '2026-10-31', due_date: '2026-11-30' }, ['invoice_date', 'due_date']))).toBe(
      'Invoice date 30 Sep 2026 → 31 Oct 2026 · Due none → 30 Nov 2026',
    )
    expect(invoiceChangeLine(upd({ period_month: '2026-09-01' }, { period_month: '2026-10-01' }, ['period_month']))).toBe('Period Sep 2026 → Oct 2026')
    expect(invoiceChangeLine(upd({ billable_to_type: 'company', company_id: 'a' }, { billable_to_type: 'freetext', company_id: null, billable_to_freetext_name: 'Lee' }, ['billable_to_type', 'company_id', 'billable_to_freetext_name']))).toBe('Billed to changed')
    expect(invoiceChangeLine(upd({}, {}, ['billable_to_freetext_phone', 'billable_to_freetext_email']))).toBe('Contact changed')
    expect(invoiceChangeLine(upd({ billing_mode: 'hr_attribution' }, { billing_mode: 'manual' }, ['billing_mode']), (m) => (m === 'hr_attribution' ? 'HR attribution' : 'Manual'))).toBe(
      'Billing mode HR attribution → Manual',
    )
    // Bookkeeping a person did not change says nothing of its own.
    expect(invoiceChangeLine(upd({}, {}, ['updated_at', 'version']))).toBe('Updated')
  })

  it('says a credit note raised, approved, voided or deleted', () => {
    const cn = { credit_note_no: 'HV-CN-202610-0003', amount: 200, status: 'draft' }
    expect(invoiceChangeLine({ op: 'INSERT', table_name: 'credit_notes', old_row: null, new_row: cn, changed: null })).toBe('Credit note HV-CN-202610-0003 raised · RM 200.00')
    expect(invoiceChangeLine({ op: 'UPDATE', table_name: 'credit_notes', old_row: cn, new_row: { ...cn, status: 'approved' }, changed: ['status', 'approved_by'] })).toBe(
      'Credit note HV-CN-202610-0003 approved — RM 200.00 off',
    )
    expect(invoiceChangeLine({ op: 'UPDATE', table_name: 'credit_notes', old_row: cn, new_row: { ...cn, status: 'voided' }, changed: ['status'] })).toBe('Credit note HV-CN-202610-0003 voided')
    expect(invoiceChangeLine({ op: 'DELETE', table_name: 'credit_notes', old_row: { ...cn, credit_note_no: null }, new_row: null, changed: null })).toBe('Credit note draft deleted')
  })
})

describe('an invoice’s trail', () => {
  const stamp = (at: string) => `@${at}`
  const base = { createdBy: 'Aina', createdAt: 't0', invoiceDate: '2026-10-31', lastReceipt: null as string | null }
  const at = (t: string, who: string, c: ReturnType<typeof upd> | DatedInvoiceChange): DatedInvoiceChange => ({ ...c, at: t, who })

  it('a draft: created, the rest still to come', () => {
    expect(invoiceTrail({ ...base, status: 'draft' }, [], stamp)).toEqual([
      { label: 'Created', by: 'Aina', when: '@t0', state: 'done' },
      { label: 'Issued', by: null, when: null, state: 'todo' },
      { label: 'Paid', by: null, when: null, state: 'todo' },
    ])
  })

  it('issued, then paid — each by whoever moved it, the first issue kept though it went back to issued once', () => {
    const changes = [
      at('t1', 'Carrie', upd({ status: 'draft' }, { status: 'issued' }, ['status'])),
      at('t2', 'Principal', upd({ status: 'issued' }, { status: 'paid' }, ['status'])),
      at('t3', 'Carrie', upd({ status: 'paid' }, { status: 'issued' }, ['status'])),
      at('t4', 'Principal', upd({ status: 'issued' }, { status: 'paid' }, ['status'])),
    ]
    expect(invoiceTrail({ ...base, status: 'paid' }, changes, stamp)).toEqual([
      { label: 'Created', by: 'Aina', when: '@t0', state: 'done' },
      { label: 'Issued', by: 'Carrie', when: '@t1', state: 'done' },
      { label: 'Paid', by: 'Principal', when: '@t4', state: 'done' },
    ])
    expect(invoiceTrail({ ...base, status: 'issued' }, changes.slice(0, 1), stamp)[2]).toEqual({ label: 'Paid', by: null, when: null, state: 'todo' })
  })

  it('made issued by a generator, then voided', () => {
    const changes = [
      at('t0', 'Principal', { op: 'INSERT', table_name: 'invoices', old_row: null, new_row: { status: 'issued', total_amount: 10 }, changed: null }),
      at('t5', 'Principal', upd({ status: 'issued' }, { status: 'voided' }, ['status'])),
    ]
    expect(invoiceTrail({ ...base, status: 'voided' }, changes, stamp).slice(1)).toEqual([
      { label: 'Issued', by: 'Principal', when: '@t0', state: 'done' },
      { label: 'Voided', by: 'Principal', when: '@t5', state: 'bad' },
    ])
  })

  it('older than the audit trail: the invoice date, the last receipt', () => {
    expect(invoiceTrail({ ...base, status: 'paid_via_netting', lastReceipt: '2026-11-05' }, [], stamp).slice(1)).toEqual([
      { label: 'Issued', by: null, when: '31 Oct 2026', state: 'done' },
      { label: 'Paid via netting', by: null, when: '05 Nov 2026', state: 'done' },
    ])
  })
})
