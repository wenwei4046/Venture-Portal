import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The Billing Allocator's page (2026-10-14, the Finance revamp v2 — D11): it
// reads the month — records, their invoices (each with its batch), the staff
// list, the setup — and hands it to the hub, with what this reader may do
// (+ New allocation and Generate invoices Billing · Create, the rest Billing ·
// Edit), the list asked for (?card=) and a record sent back to be corrected
// (?edit=).

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), canDo: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/permission-actions', () => ({ canDo: mocks.canDo }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeMonth: () => '2026-10' }))
vi.mock('./_components/AllocatorHub', () => ({
  default: (p: Record<string, unknown> & { data: { period: string; txns: Array<{ txnNo: string; locked: boolean; createdAt: string }>; invoices: Array<{ invoiceNo: string; ref: string }>; companies: Array<{ label: string }> } }) => (
    <pre data-testid="hub">
      {JSON.stringify({
        period: p.data.period,
        txns: p.data.txns.map((t) => [t.txnNo, t.locked, t.createdAt]),
        invoices: p.data.invoices.map((i) => [i.invoiceNo, i.ref]),
        companies: p.data.companies.map((c) => c.label),
        can: p.can,
        canSetDefault: p.canSetDefault,
        thisMonth: p.thisMonth,
        initialCard: p.initialCard,
        editId: p.editId ?? null,
      })}
    </pre>
  ),
}))

import BillingAllocatorPage from './page'

const detail = (company_id: string | null, department_id: string | null, amount: number, is_own_share = false) => ({
  company_id,
  department_id,
  method_detail: 'Head: 1.00/48.00 (2026-09)',
  amount,
  is_own_share,
})

const TXNS = [
  {
    id: 't1', txn_no: 'ALC-202609-001', description: 'Office Rental', amount: 18980, method: 'headcount', category_id: 'cat-rent',
    hc_period: '2026-09-01', billed_ref: 'ALC-202609', created_at: '2026-09-01T02:00:00Z',
    alloc_txn_details: [detail(null, null, 366.59, true), detail('co-2990', null, 742.32), detail('co-car', null, 3681.57), detail(null, 'mkt', 4745)],
  },
  {
    id: 't6', txn_no: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage', category_id: 'cat-web',
    hc_period: null, billed_ref: 'ALC-202609-4', created_at: '2026-09-03T02:00:00Z', // that batch was voided: not billed
    alloc_txn_details: [detail(null, null, 859.68, true), detail('co-2990', null, 429.84), detail('co-car', null, 859.68)],
  },
]

const INVOICES = [
  { id: 'i7', invoice_no: 'HV-INV-202609-0007', company_id: 'co-2990', billable_to_department_id: null, status: 'issued', reference_no: 'ALC-202609' },
  { id: 'i13', invoice_no: 'HV-INV-202609-0013', company_id: null, billable_to_department_id: 'mkt', status: 'paid', reference_no: 'ALC-202609' },
]

function database() {
  const tables: Record<string, unknown[]> = {
    companies: [
      { id: 'co-2990', short_code: '2990', name: '2990 Sdn Bhd' },
      { id: 'co-car', short_code: 'CAR', name: 'Carres' },
      { id: 'co-hk', short_code: 'HK', name: 'Hookka' },
    ],
    departments: [{ id: 'mkt', name: 'Marketing' }],
    alloc_categories: [{ id: 'cat-rent', name: 'Rental', coa_code: '7012' }, { id: 'cat-web', name: 'Website & Software', coa_code: '9087' }],
    alloc_txns: TXNS,
    invoices: INVOICES,
  }
  const from = vi.fn((table: string) => {
    const result = { data: tables[table] ?? [], error: null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'like', 'order', 'range']) q[m] = () => q
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const hub = () => JSON.parse(screen.getByTestId('hub').textContent ?? '{}')
const page = (sp: Record<string, string> = {}) => BillingAllocatorPage({ searchParams: Promise.resolve({ period: '2026-09', ...sp }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'fm', role: 'finance', permissions: ['billing'] })
  mocks.canDo.mockImplementation((_u: unknown, fn: string, action: string) => fn === 'billing' && action !== 'create')
  database()
})

describe('the Billing Allocator’s page', () => {
  it('hands the hub the month — a record billed while its batch has live invoices, each invoice with its batch', async () => {
    render(await page())
    expect(hub()).toMatchObject({
      period: '2026-09',
      txns: [
        ['ALC-202609-001', true, '2026-09-01T02:00:00Z'],
        ['ALC-202609-006', false, '2026-09-03T02:00:00Z'],
      ],
      invoices: [
        ['HV-INV-202609-0007', 'ALC-202609'],
        ['HV-INV-202609-0013', 'ALC-202609'],
      ],
      companies: ['2990', 'CAR', 'HK'],
      thisMonth: '2026-10',
      initialCard: 'records',
      editId: null,
    })
  })

  it('asks what this reader may do: Billing · Create for a new allocation and invoices, Billing · Edit for the rest', async () => {
    render(await page())
    expect(hub()).toMatchObject({ can: { create: false, edit: true }, canSetDefault: false })
    expect(mocks.canDo).toHaveBeenCalledWith(expect.anything(), 'billing', 'create')
    expect(mocks.canDo).toHaveBeenCalledWith(expect.anything(), 'billing', 'edit')
  })

  it('opens on the list asked for, and hands on a record sent back to be corrected', async () => {
    render(await page({ card: 'staff', edit: 't6' }))
    expect(hub()).toMatchObject({ initialCard: 'staff', editId: 't6' })
  })

  it('opens on Records for a list it does not know, and on the office’s month with none asked', async () => {
    const { unmount } = render(await page({ card: 'nope' }))
    expect(hub().initialCard).toBe('records')
    unmount()
    render(await BillingAllocatorPage({ searchParams: Promise.resolve({}) }))
    expect(hub().period).toBe('2026-10')
  })
})
