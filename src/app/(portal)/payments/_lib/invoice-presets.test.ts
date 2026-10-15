import { describe, expect, it } from 'vitest'
import { readInvoicePreset, readRefundPreset } from './invoice-presets'

// What the voucher page starts from for an invoice (2026-10-16 — shared with
// the Finance phone app's sheets). The regression: a paid invoice settled on
// a consolidated receipt has no receipt of its own, and its refund read RM 0
// — the page opened a blank voucher, the phone said there was nothing to
// refund (HV-INV-202610-0006, paid RM 2,271.03 on a batch receipt).

type Rows = Record<string, Array<Record<string, unknown>>>

/** A read-only stand-in for the server client: each table's rows, filtered by eq / neq. */
function client(rows: Rows) {
  return {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
        single: async () => ({ data: (rows[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null }),
        then: (done: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: (rows[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(done),
      }
      return q
    },
  } as never
}

const INV = { id: 'i1', invoice_no: 'HV-INV-202610-0006', company_id: 'co-2990', billable_to_freetext_name: null, total_amount: 2271.03, period_month: '2026-10-01', billing_mode: 'hr_attribution', billable_to_type: 'subsidiary', companies: { name: '2990' } }

describe('the voucher page’s presets for an invoice', () => {
  it('a paid invoice settled on a consolidated receipt refunds what it owed — not RM 0', async () => {
    const preset = await readRefundPreset(client({ invoices: [{ ...INV, status: 'paid' }], payment_vouchers: [], credit_notes: [] }), 'i1')
    expect(preset).toEqual({ invoice_no: 'HV-INV-202610-0006', company_name: '2990', company_id: 'co-2990', amount: 2271.03 })
  })

  it('less its approved credit notes; its own receipts when they say more', async () => {
    const credited = await readRefundPreset(
      client({ invoices: [{ ...INV, status: 'paid' }], payment_vouchers: [], credit_notes: [{ invoice_id: 'i1', status: 'approved', amount: 271.03 }, { invoice_id: 'i1', status: 'draft', amount: 99 }] }),
      'i1',
    )
    expect(credited?.amount).toBe(2000)
    const direct = await readRefundPreset(
      client({ invoices: [{ ...INV, status: 'paid' }], payment_vouchers: [{ invoice_id: 'i1', direction: 'credit', status: 'paid', amount: 2300 }], credit_notes: [] }),
      'i1',
    )
    expect(direct?.amount).toBe(2300)
  })

  it('nothing to refund on an invoice not paid; nothing to settle on one paid', async () => {
    expect(await readRefundPreset(client({ invoices: [{ ...INV, status: 'issued' }], payment_vouchers: [], credit_notes: [] }), 'i1')).toBeNull()
    expect(await readInvoicePreset(client({ invoices: [{ ...INV, status: 'paid' }], payment_vouchers: [], credit_notes: [] }), 'i1')).toBeNull()
  })

  it('an invoice still owed settles its balance, into the pool its billing mode lands in', async () => {
    const preset = await readInvoicePreset(
      client({
        invoices: [{ ...INV, status: 'issued', billable_to_type: 'dept_pool', company_id: null, companies: null }],
        payment_vouchers: [{ invoice_id: 'i1', direction: 'credit', status: 'paid', amount: 271.03 }],
        credit_notes: [],
      }),
      'i1',
    )
    expect(preset).toMatchObject({ id: 'i1', company_name: '—', total_amount: 2000, target_pool: 'dept_pool_hr', billable_to_type: 'dept_pool' })
  })
})
