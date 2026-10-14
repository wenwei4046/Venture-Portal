import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

// The credit note document's reads (2026-10-15, the Finance revamp v2 — P04):
// the invoice it credits (its period, what it is for), its approved credit
// notes besides this one, the day it was issued, its category by name only.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { GET } from './route'

function database() {
  const rows: Record<string, unknown[]> = {
    invoices: [
      {
        id: 'i8', invoice_no: 'HV-INV-202609-0008', period_month: '2026-09-01', description: 'HR shared service — Sep\n- 12 staff', total_amount: '1542.80',
        company_id: 'co-hb', billable_to_type: 'subsidiary', billable_to_department_id: null, billable_to_freetext_name: null,
      },
    ],
    companies: [{ id: 'co-hb', name: 'HOUZS Bedding (HB)', short_code: 'HB' }],
    departments: [],
    chart_of_accounts: [{ code: '5020', name: 'Salary Income' }],
  }
  const from = vi.fn((table: string) => {
    let list = rows[table] ?? []
    let approvedOnly = false
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'neq', 'order', 'in']) q[m] = () => q
    q.eq = (column: string, value: unknown) => {
      if (table === 'credit_notes' && column === 'status' && value === 'approved') approvedOnly = true
      if (table === 'credit_notes' && column === 'id') list = [{ id: 'cn3', credit_note_no: 'HV-CN-202610-0003', invoice_id: 'i8', amount: '100.00', reason: 'Discount', status: 'approved', category_code: '5020', created_at: '2026-10-09T03:00:00Z', approved_at: '2026-10-10T02:00:00Z' }]
      return q
    }
    q.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'credit_notes' && approvedOnly) list = [{ id: 'cn2', invoice_id: 'i8', amount: '220.40' }, { id: 'cn3', invoice_id: 'i8', amount: '100.00' }]
      return Promise.resolve(resolve({ data: list, error: null }))
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ role: 'finance' })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('the credit note document’s figures', () => {
  it('counts the invoice’s other approved credits, issues on its approval day, names its category without a code', async () => {
    database()
    await GET(new Request('http://localhost/billing/credit-note-doc?id=cn3'))
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'export')
    const [doc] = mocks.exportPdfResponse.mock.calls[0][0].element.props.creditNotes
    expect(doc).toMatchObject({
      credit_note_no: 'HV-CN-202610-0003',
      amount: 100,
      issued_at: '2026-10-10T02:00:00Z',
      category_label: 'Salary Income',
      credit_to: { name: 'HOUZS Bedding (HB)', kind: 'Subsidiary · HB' },
      invoice_no: 'HV-INV-202609-0008',
      invoice_period: '2026-09-01',
      invoice_summary: 'HR shared service — Sep',
      invoice_total: 1542.8,
      // cn2 only — never this one twice.
      other_credits: 220.4,
    })
  })
})
