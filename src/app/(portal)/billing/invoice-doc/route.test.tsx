import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

// The invoice document's reads (2026-10-15, the Finance revamp v2 — P01): what
// each invoice still asks for is the hub's figure — its receipts, a
// consolidated receipt's part, its approved credit notes — and an internal
// department is still named.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
vi.mock('@/lib/dept-registry', () => ({ extraBillingModeOptions: () => [], primedRegistryRows: () => [] }))
import { GET } from './route'

const inv = (over: Record<string, unknown>) => ({
  id: 'i1', invoice_no: 'HV-INV-202610-0013', company_id: 'co-hc', period_month: '2026-10-01', billing_mode: 'hr_attribution', total_amount: '2204.00', status: 'issued',
  billable_to_type: 'subsidiary', billable_to_department_id: null, billable_to_freetext_name: null, billable_to_freetext_address: null,
  billable_to_freetext_address_parts: null, billable_to_freetext_phone: null, billable_to_freetext_email: null, description: 'HR shared service — Oct', invoice_date: '2026-10-07', due_date: '2026-11-06',
  reference_no: null, category_code: '5020', settlement_voucher_id: null, ...over,
})

function database() {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const rows: Record<string, unknown[]> = {
    invoices: [
      inv({}),
      inv({ id: 'i2', invoice_no: 'HV-INV-202610-0014', status: 'paid', company_id: null, billable_to_type: 'dept_pool', billable_to_department_id: 'd-office', total_amount: '900.00', settlement_voucher_id: 'v-batch', billing_mode: 'venture_attribution' }),
      inv({ id: 'i3', invoice_no: 'HV-INV-202610-0015', company_id: null, billable_to_type: 'freetext', billable_to_freetext_name: 'Rygis Private Gym', billable_to_freetext_address: 'Lot 12', billable_to_freetext_email: 'hello@rygis.my' }),
      inv({
        id: 'i4', invoice_no: 'HV-INV-202610-0016', company_id: null, billable_to_type: 'freetext', billable_to_freetext_name: 'Rygis Private Gym',
        billable_to_freetext_address: 'No 83, Jalan Jambu 3, 11060 Paya Terubong, Pulau Pinang, Malaysia', billable_to_freetext_phone: '012-345 6789',
        billable_to_freetext_address_parts: { line1: 'No 83, Jalan Jambu 3', line2: '', postcode: '11060', city: 'Paya Terubong', state: 'Pulau Pinang', country: 'Malaysia' },
      }),
    ],
    companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
    departments: [{ id: 'd-office', name: 'Venture (Office)' }],
    invoice_lines: [
      { invoice_id: 'i1', line_no: 1, description: 'Salary recharge', amount: '1807.28', category_code: '5020', segment: null },
      { invoice_id: 'i1', line_no: 2, description: 'Statutory recharge', amount: '396.72', category_code: '5021', segment: null },
    ],
    credit_notes: [{ id: 'cn1', invoice_id: 'i1', credit_note_no: 'HV-CN-202610-0001', amount: '100.00', reason: 'x', status: 'approved' }],
  }
  const from = vi.fn((table: string) => {
    let list = rows[table] ?? []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'order', 'in']) {
      q[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        // Receipts by invoice, the consolidated receipt by its id.
        if (table === 'payment_vouchers' && m === 'in') {
          list = args[0] === 'invoice_id'
            ? [{ invoice_id: 'i1', voucher_no: 'HV-OR-202610-0030', payment_date: '2026-10-08', amount: '500.00' }]
            : [{ id: 'v-batch', voucher_no: 'HV-OR-202610-0041', payment_date: '2026-10-09', amount: '5000.00' }]
        }
        return q
      }
    }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: list, error: null }))
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ role: 'finance' })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('the invoice document’s figures', () => {
  it('asks what each still owes as the hub works it out, and names every party', async () => {
    const calls = database()
    await GET(new Request('http://localhost/billing/invoice-doc?period=2026-10'))
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'export')
    const docs = mocks.exportPdfResponse.mock.calls[0][0].element.props.invoices
    // Issued, part-paid (500) and credited (100): 1,604 still owed.
    expect(docs[0]).toMatchObject({ total: 2204, received: 500, credited: 100, remaining: 1604, paid_on: '2026-10-08', billing_mode_label: 'HR OPEX' })
    expect(docs[0].bill_to).toEqual({ name: 'HOUZS Century', kind: 'Subsidiary · HC', contact: [] })
    expect(docs[0].lines.map((l: { description: string }) => l.description)).toEqual(['Salary recharge', 'Statutory recharge'])
    // Paid on a consolidated receipt: its whole, on that receipt's day; an internal department named.
    expect(docs[1]).toMatchObject({ received: 900, remaining: 0, paid_on: '2026-10-09', billing_mode_label: 'Venture (HV) OPEX' })
    expect(docs[1].bill_to).toEqual({ name: 'Venture (Office)', kind: 'Department pool', contact: [] })
    expect(calls.some((c) => c.table === 'departments' && c.method === 'eq')).toBe(false)
    // An outside party carries how to reach it.
    expect(docs[2].bill_to).toEqual({ name: 'Rygis Private Gym', kind: 'External party', contact: ['Lot 12', 'hello@rygis.my'] })
    // Its address in six parts (2026-10-20) prints a line each, as a letter is addressed.
    expect(docs[3].bill_to.contact).toEqual(['No 83, Jalan Jambu 3', '11060 Paya Terubong', 'Pulau Pinang, Malaysia', '012-345 6789'])
  })
})
