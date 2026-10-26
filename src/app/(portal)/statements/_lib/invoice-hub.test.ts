import { beforeEach, describe, expect, it, vi } from 'vitest'

// Invoice's hub, read (2026-10-14, the Finance revamp v2 — D10). Service
// Billing's reads, moved from BillingView as they were (2026-10-08): what
// hangs off the invoices is asked the moment both invoice lists are in, never
// after every other read; 100 invoices a time; a chunk at PostgREST's cap read
// again in pages. And what the page is handed: the month's invoices and the
// other months' open ones, the month's credit notes, Marketing's billing (the
// lines its manager confirmed, 2026-10-26 — it was the marketing contracts),
// the pool's movements, the payroll basis, Finance's mode switch.

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ loadDepartmentMode: vi.fn() }))
vi.mock('@/lib/department-mode-server', () => ({ loadDepartmentMode: mocks.loadDepartmentMode }))
vi.mock('@/lib/dept-registry', async (original) => ({
  ...(await original<typeof import('@/lib/dept-registry')>()),
  extraBillingModeOptions: () => [],
  primedRegistryRows: () => [],
}))

import { loadInvoiceHub } from './invoice-hub'

type Row = Record<string, unknown>
const PERIOD = '2026-09-01'
const base = {
  period_month: PERIOD, company_id: 'co-2990', billable_to_type: 'subsidiary', billable_to_department_id: null,
  billable_to_freetext_name: null, billable_to_freetext_address: null, billable_to_freetext_phone: null, billable_to_freetext_email: null,
  description: null, invoice_date: '2026-09-30', due_date: null, reference_no: null, category_code: null, created_at: '2026-09-30T00:00:00Z', settlement_voucher_id: null,
}
const INVOICES: Row[] = [
  { ...base, id: 'd1', invoice_no: 'HV-INV-202609-0055', billing_mode: 'director_attribution', total_amount: 9642.13, status: 'issued' },
  { ...base, id: 'c1', invoice_no: 'HV-INV-202609-0046', billing_mode: 'payroll_consolidated', total_amount: 8641.63, status: 'paid' },
  { ...base, id: 'm1', invoice_no: 'HV-INV-202609-0039', billing_mode: 'marketing_project', total_amount: 2850, status: 'paid', company_id: 'co-old' },
  { ...base, id: 'v1', invoice_no: 'HV-INV-202610-0002', billing_mode: 'venture_attribution', total_amount: 1054.89, status: 'voided' },
]
const OTHER: Row[] = [{ ...base, id: 'o1', period_month: '2026-08-01', invoice_no: 'HV-INV-202608-0090', billing_mode: 'hr_attribution', total_amount: 300, status: 'issued' }]
const LINES: Row[] = [
  { id: 'l1', invoice_id: 'c1', line_no: 1, description: 'HR', amount: 1352.45, category_code: '5050', segment: 'hr' },
  { id: 'l2', invoice_id: 'c1', line_no: 2, description: 'Finance', amount: 2128.67, category_code: '5050', segment: 'finance' },
  { id: 'l3', invoice_id: 'c1', line_no: 3, description: 'Director Office', amount: 2174.63, category_code: '5050', segment: 'director_office' },
  { id: 'l4', invoice_id: 'c1', line_no: 4, description: 'IT', amount: 2985.88, category_code: '5050', segment: 'it' },
  { id: 'l5', invoice_id: 'm1', line_no: 1, description: 'Design', amount: 2850, category_code: '5019', segment: null },
  { id: 'l6', invoice_id: 'o1', line_no: 1, description: 'HR — Aug', amount: 300, category_code: '5050', segment: 'hr' },
]

// mkt_bill_import_preview(month): one line on the paid Hookka invoice, one to import for an outside client.
const MARKETING = {
  month: PERIOD,
  locked: false,
  lines: [
    { bill: 'b1', project: 'p1', track: 'PRJ-HK-2609-001', title: 'Catalog', words: "Bedframe Catalog - Sep'26", amount: 2850, sub: { id: 's-hk', code: 'HK', name: 'Hookka' },
      party: { kind: 'subsidiary', id: 'co-old', name: 'Hookka', code: 'HK' }, account: { code: '5019', name: 'Design Income' }, invoice: { id: 'm1', no: 'HV-INV-202609-0039', status: 'paid' } },
    { bill: 'b2', project: 'p2', track: 'PRJ-REDT-2609-001', title: 'Ads', words: "Social Media - Sep'26", amount: 3000, sub: { id: 's-rt', code: 'REDT', name: 'Red Truck' },
      party: { kind: 'client', id: 's-rt', name: 'Red Truck Sdn Bhd', code: 'REDT' }, account: null, invoice: null },
  ],
  typed: [],
}

function database(tables: Record<string, Row[]> = {}) {
  const data: Record<string, Row[]> = {
    invoices: [...INVOICES, ...OTHER],
    invoice_lines: LINES,
    companies: [
      { id: 'co-2990', name: '2990', short_code: '2990', is_active: true },
      { id: 'co-old', name: 'Hookka', short_code: 'HK', is_active: false },
    ],
    departments: [
      { id: 'd-fin', name: 'Finance', is_internal: false },
      { id: 'd-vo', name: 'Venture (Office)', is_internal: true },
    ],
    chart_of_accounts: [
      { code: '5019', name: 'Design Income', type: 'revenue', parent_code: null, is_active: true },
      { code: '5050', name: 'Salary Income', type: 'revenue', parent_code: null, is_active: true },
    ],
    bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', is_primary: true, status: 'active' }],
    venture_pool: [
      { id: 'vp1', created_at: '2026-09-09T02:00:00Z', transaction_type: 'fund_out', amount: 40000, description: 'New loan to 2990', reference_table: 'loans' },
      { id: 'vp2', created_at: '2026-09-09T03:00:00Z', transaction_type: 'expense_out', amount: 4400, description: 'Minimum Pay', reference_table: 'payment_vouchers' },
      { id: 'vp3', created_at: '2026-09-12T03:00:00Z', transaction_type: 'profit_in', amount: 21.5, description: 'Settle', reference_table: 'payment_vouchers' },
    ],
    credit_notes: [
      { id: 'cn1', credit_note_no: 'HV-CN-202609-0001', invoice_id: 'd1', amount: 100, reason: 'Overbilled', status: 'approved', category_code: '5050', billing_mode: 'director_attribution', created_at: '2026-09-29T00:00:00Z' },
      { id: 'cn2', credit_note_no: 'HV-CN-202608-0004', invoice_id: 'o1', amount: 20, reason: 'Aug', status: 'approved', category_code: '5050', billing_mode: 'hr_attribution', created_at: '2026-08-29T00:00:00Z' },
    ],
    payment_vouchers: [],
    ...tables,
  }
  const inLists: Record<string, number[]> = {}
  const from = vi.fn((table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    const orders: string[] = []
    let range: [number, number] | null = null
    const rows = () => {
      const rs = (data[table] ?? []).filter((r) => filters.every((f) => f(r)))
      rs.sort((a, b) => {
        for (const c of orders) {
          const x = String(a[c] ?? '')
          const y = String(b[c] ?? '')
          if (x !== y) return x < y ? -1 : 1
        }
        return 0
      })
      const [lo, hi] = range ?? [0, 999]
      return rs.slice(lo, Math.min(hi + 1, lo + 1000))
    }
    const single = (): { data: Row | null; error: null } => {
      if (table === 'payroll_runs') return { data: { marketing_opex_total: 59697.96, hr_opex_total: 5797.05, finance_opex_total: 26636.73, director_office_total: 7415.8, it_opex_total: 5971.75, revenue_opex_total: 0, director_salary_total: 0, approved_at: '2026-10-05T02:08:45Z' }, error: null }
      if (table === 'director_salary_submissions') {
        return {
          data: {
            total_gross: 2500, total_payroll_gross: 2500, total_invoice: 0, total_saving: 0, director_count: 1, submitted_at: '2026-10-05T06:35:55Z',
            by_company: [{ company_id: 'co-2990', company_name: '2990', company_short_code: '2990', basic: 2500, kpi: 0, allowance: 6769.38, epf_er: 325, socso_er: 42.85, eis_er: 4.9, total_ctc: 9642.13 }],
          },
          error: null,
        }
      }
      return { data: rows()[0] ?? null, error: null }
    }
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: unknown[]) => {
        ;(inLists[`${table}.${c}`] ??= []).push(v.length)
        filters.push((r) => v.includes(r[c]))
        return q
      },
      gte: () => q,
      lte: () => q,
      order: (c: string) => (orders.push(c), q),
      range: (lo: number, hi: number) => ((range = [lo, hi]), q),
      maybeSingle: async () => single(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    }
    return q
  })
  const rpc = vi.fn((fn?: string) => {
    if (fn === 'mkt_bill_import_preview') {
      return { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: MARKETING, error: null }).then(resolve, reject) }
    }
    const result = {
      data: [
        { department_name: 'HR', company_id: 'co-2990', company_short_code: '2990', company_name: '2990', amount: 1000, salary_amount: 800, allowance_amount: 100, epf_amount: 80, socso_amount: 15, eis_amount: 5 },
        { department_name: 'HR', company_id: null, company_short_code: '', company_name: '', amount: 200, salary_amount: 160, allowance_amount: 20, epf_amount: 16, socso_amount: 3, eis_amount: 1 },
      ],
      error: null,
    }
    return { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject) }
  })
  mocks.loadDepartmentMode.mockResolvedValue(null)
  return { client: { from, rpc } as never, from, rpc, inLists }
}

beforeEach(() => vi.clearAllMocks())

describe('Invoice’s hub, read', () => {
  it('hands the month’s invoices newest number first and the other months’ open ones apart', async () => {
    const { client } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.invoices.map((i) => i.id).sort()).toEqual(['c1', 'd1', 'm1', 'v1'])
    expect(hub.otherOpen.map((i) => [i.id, i.other])).toEqual([['o1', true]])
    // The lines are read for the other months' invoices too — their drawer shows them.
    expect(hub.otherOpen[0].lines).toEqual([{ description: 'HR — Aug', account: 'Salary Income', code: '5050', amount: 300 }])
  })

  it('keeps an inactive company’s name on its invoice, offering the dialogs the active ones only', async () => {
    const { client } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.invoices.find((i) => i.id === 'm1')!.party).toEqual({ name: 'Hookka (HK)', kind: 'Subsidiary' })
    expect(hub.companies).toEqual([{ id: 'co-2990', name: '2990', short_code: '2990' }])
    expect(hub.departments).toEqual([{ id: 'd-fin', name: 'Finance' }])
  })

  it('lists the month’s credit notes only, with their invoice and party', async () => {
    const { client } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.creditNotes).toEqual([
      expect.objectContaining({ id: 'cn1', no: 'HV-CN-202609-0001', invoiceId: 'd1', invoiceNo: 'HV-INV-202609-0055', party: '2990 (2990)', amount: 100, category: '5050 · Salary Income' }),
    ])
    expect(hub.invoices.find((i) => i.id === 'd1')!.remaining).toBe(9542.13)
  })

  it('reads Marketing’s billing for the month — each line with its invoice, or none to import', async () => {
    const { client, rpc } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(rpc).toHaveBeenCalledWith('mkt_bill_import_preview', { p_month: PERIOD })
    expect(hub.marketing.lines.map((l) => [l.bill, l.party.name, l.account?.code ?? null, l.invoice?.no ?? null])).toEqual([
      ['b1', 'Hookka', '5019', 'HV-INV-202609-0039'],
      ['b2', 'Red Truck Sdn Bhd', null, null],
    ])
    expect(hub.marketing.month).toBe(PERIOD)
  })

  it('a Marketing read that fails leaves its card empty, the rest of the hub as it is', async () => {
    const { client, rpc } = database()
    const real = rpc.getMockImplementation()!
    rpc.mockImplementation((fn?: string) =>
      fn === 'mkt_bill_import_preview'
        ? { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve) }
        : real(fn),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.marketing).toEqual({ month: PERIOD, locked: false, lines: [], typed: [] })
    expect(hub.invoices).toHaveLength(4)
    spy.mockRestore()
  })

  it('reads every *_out movement as money that left the pool — a loan disbursed (fund_out) too', async () => {
    const { client } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.nonBillable.map((t) => [t.type, t.out, t.source])).toEqual([
      ['fund_out', true, 'Loans'],
      ['expense_out', true, 'Payment voucher'],
      ['profit_in', false, 'Payment voucher'],
    ])
  })

  it('puts the payroll basis together: billed / from payroll by department, the director submission, the allocation', async () => {
    const { client } = database()
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.basis.status).toBe('Submitted')
    expect(hub.basis.note).toBe('HR 5 Oct · Director salary 5 Oct · 2 Marketing lines')
    expect(hub.basis.summary).toBe('HR 1,352 / 5,797 · Finance 2,129 / 26,637 · Director Office 2,175 / 7,416 · IT 2,986 / 5,972 · Director 9,642 ✓ · Marketing 2,850 / 59,698')
    expect(hub.basis.lines[0]).toEqual({ key: 'hr', label: 'HR', value: '1,352.45 / 5,797.05' })
    expect(hub.basis.director).toMatchObject({ count: 1, gross: 2500, billed: 9642.13 })
    expect(hub.basis.director!.rows[0]).toMatchObject({ code: '2990', total: 9642.13, epfEr: 325 })
    expect(hub.basis.allocation).toEqual([
      { department: 'HR', rows: [expect.objectContaining({ code: '2990', amount: 1000 })], billable: 1000, own: expect.objectContaining({ amount: 200 }) },
    ])
  })

  it('says "Director salary · pending" while the director submission has not come in', async () => {
    const { client, from } = database()
    const real = from.getMockImplementation()!
    from.mockImplementation((table: string) => {
      if (table !== 'director_salary_submissions') return real(table)
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }
      return q as never
    })
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.basis.lines).toContainEqual({ key: 'director-pending', label: 'Director salary', value: 'pending' })
    expect(hub.basis.lines.some((l) => l.key === 'director')).toBe(false)
    expect(hub.basis.status).toBe('Partly')
  })

  it('banks read with their numbers, the primary first; Finance’s mode switch handed on', async () => {
    const { client } = database()
    const mode = { id: 'dept-fin', name: 'Finance', segmentKey: 'finance', isInternal: false, costModel: 'cost_center', openSplitPeople: 0, canSwitch: true }
    mocks.loadDepartmentMode.mockResolvedValue(mode)
    const hub = await loadInvoiceHub(client, PERIOD)
    expect(hub.banks).toEqual([{ id: 'b1', label: 'Hong Leong Bank — 123-456-7890' }])
    expect(hub.department).toBe(mode)
    expect(mocks.loadDepartmentMode).toHaveBeenCalledWith('finance')
  })
})

describe('Invoice’s hub reads in two stages', () => {
  it('asks for what hangs off the invoices the moment both invoice lists are in — not after every other read', async () => {
    const { client, from, rpc } = database()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const answer = rpc.getMockImplementation()!
    rpc.mockImplementation(() => {
      const q = answer()
      return { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => held.then(() => q.then(resolve, reject)) }
    })
    const reading = loadInvoiceHub(client, PERIOD)
    await vi.waitFor(() => {
      expect(from).toHaveBeenCalledWith('invoice_lines')
      expect(from).toHaveBeenCalledWith('credit_notes')
      expect(from).toHaveBeenCalledWith('payment_vouchers')
    })
    release()
    await reading
  })

  it('starts Finance’s mode switch with the page’s own reads', async () => {
    const { client, from } = database()
    await loadInvoiceHub(client, PERIOD)
    const lines = from.mock.calls.findIndex(([table]) => table === 'invoice_lines')
    expect(mocks.loadDepartmentMode.mock.invocationCallOrder[0]).toBeLessThan(from.mock.invocationCallOrder[lines])
  })
})

describe('Invoice’s hub, past the caps', () => {
  it('asks 100 invoices a time, and still hands the drawer the 1,001st receipt', async () => {
    const invoices: Row[] = Array.from({ length: 150 }, (_, i) => ({
      ...base,
      id: `p${String(i).padStart(3, '0')}`,
      invoice_no: `HV-INV-202609-${String(i).padStart(4, '0')}`,
      billing_mode: 'marketing_project',
      total_amount: 100,
      status: 'issued',
    }))
    const receipts: Row[] = Array.from({ length: 1001 }, (_, i) => ({
      id: `r${String(i).padStart(4, '0')}`,
      invoice_id: 'p000',
      voucher_no: i === 1000 ? 'HV-OR-202609-LAST' : `HV-OR-202609-${String(i).padStart(4, '0')}`,
      payment_date: i === 1000 ? '2026-09-30' : '2026-09-01',
      amount: 0.01,
      direction: 'credit',
      status: 'paid',
    }))
    const { client, inLists } = database({ invoices, payment_vouchers: receipts, credit_notes: [], invoice_lines: [] })
    const hub = await loadInvoiceHub(client, PERIOD)
    const p000 = hub.invoices.find((i) => i.id === 'p000')!
    expect(p000.receipts).toHaveLength(1001)
    expect(p000.receipts[1000]).toMatchObject({ no: 'HV-OR-202609-LAST', date: '2026-09-30' })
    expect(p000.received).toBe(10.01)
    expect(inLists['credit_notes.invoice_id']).toEqual([100, 50])
    expect(Math.max(...Object.values(inLists).flat())).toBe(100)
  })
})
