import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen, within } from '@testing-library/react'

// 2026-10-07 — Service Billing on the sheet (the user approved the Invoice /
// Statements sample, v6): the month beside the title, every control in a
// captioned band, four summary cards, the payroll basis folded above the
// invoices with its figures on the fold, and the list told each invoice's
// category. The list is a client component: what the page sends it is
// printed and read here as the browser would get it.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchPaidByInvoice: vi.fn(),
  loadDepartmentMode: vi.fn(),
  departmentModeCard: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/debtor-aging-data', () => ({ fetchPaidByInvoice: mocks.fetchPaidByInvoice }))
vi.mock('@/lib/department-mode-server', () => ({ loadDepartmentMode: mocks.loadDepartmentMode }))
vi.mock('@/lib/dept-registry', async (original) => ({
  ...(await original<typeof import('@/lib/dept-registry')>()),
  extraBillingModeOptions: () => [],
  primedRegistryRows: () => [],
}))
// The head's tools (month, From payroll ▼, Export ▼, + Create Invoice ▼) are
// BillingTools — tested on their own; here, what the page hands them.
vi.mock('./BillingTools', () => ({
  default: (p: { period: string; canCreate: boolean; companies: unknown[] }) => (
    <span data-testid="tools" data-period={p.period} data-can-create={String(p.canCreate)} data-companies={p.companies.length} />
  ),
}))
vi.mock('./MarketingProjectList', () => ({
  default: (p: { invoiceByContract?: Record<string, { id: string; no: string | null }> }) => (
    <pre data-testid="marketing">{JSON.stringify(p.invoiceByContract ?? null)}</pre>
  ),
}))
vi.mock('./NonBillableList', () => ({ default: () => <div data-testid="non-billable" /> }))
vi.mock('./CreditNotesList', () => ({ default: () => null }))
vi.mock('@/components/department/DepartmentModeCard', () => ({
  default: (props: { segmentKey: string; department?: Promise<unknown> }) => {
    mocks.departmentModeCard(props)
    return <div data-testid="dept-mode" />
  },
}))
vi.mock('./InvoicesList', () => ({
  default: (p: {
    invoices: Array<{ id: string }>
    categoryByInvoice?: Record<string, string>
    canSetDefault?: boolean
    receiptsByInvoice?: Record<string, Array<{ voucherNo: string | null }>>
  }) => (
    <pre data-testid="list">
      {JSON.stringify({ ids: p.invoices.map((i) => i.id), categoryByInvoice: p.categoryByInvoice, canSetDefault: p.canSetDefault, receiptsByInvoice: p.receiptsByInvoice })}
    </pre>
  ),
}))

import BillingView from './BillingView'

const PERIOD = '2026-09-01'
const base = {
  period_month: PERIOD, company_id: 'co-2990', billable_to_type: 'subsidiary', billable_to_department_id: null,
  billable_to_freetext_name: null, billable_to_freetext_address: null, billable_to_freetext_phone: null, billable_to_freetext_email: null,
  description: null, invoice_date: '2026-09-30', due_date: null, reference_no: null, category_code: null, created_at: '2026-09-30T00:00:00Z', settlement_voucher_id: null,
}
const INVOICES = [
  { ...base, id: 'd1', invoice_no: 'HV-INV-202609-0055', billing_mode: 'director_attribution', total_amount: 9642.13, status: 'issued' },
  { ...base, id: 'c1', invoice_no: 'HV-INV-202609-0046', billing_mode: 'payroll_consolidated', total_amount: 8641.63, status: 'paid' },
  { ...base, id: 'm1', invoice_no: 'HV-INV-202609-0039', billing_mode: 'marketing_project', total_amount: 2850, status: 'paid', company_id: 'co-hk', contract_id: 'ct-1' },
  { ...base, id: 'v1', invoice_no: 'HV-INV-202610-0002', billing_mode: 'venture_attribution', total_amount: 1054.89, status: 'voided' },
]
const LINES = [
  { invoice_id: 'c1', line_no: 1, description: 'HR', amount: 1352.45, category_code: '5050', segment: 'hr' },
  { invoice_id: 'c1', line_no: 2, description: 'Finance', amount: 2128.67, category_code: '5050', segment: 'finance' },
  { invoice_id: 'c1', line_no: 3, description: 'Director Office', amount: 2174.63, category_code: '5050', segment: 'director_office' },
  { invoice_id: 'c1', line_no: 4, description: 'IT', amount: 2985.88, category_code: '5050', segment: 'it' },
  { invoice_id: 'm1', line_no: 1, description: 'Design', amount: 2850, category_code: '5019', segment: null },
]

type Filter = [string, string, unknown]
function database() {
  const from = vi.fn((table: string) => {
    const filters: Filter[] = []
    const result = () => {
      const has = (f: string, col: string) => filters.some(([ff, c]) => ff === f && c === col)
      switch (table) {
        case 'invoices':
          return { data: has('neq', 'period_month') ? [] : INVOICES, error: null }
        case 'invoice_lines':
          return { data: LINES, error: null }
        case 'companies':
          return { data: [{ id: 'co-2990', name: '2990', short_code: '2990' }, { id: 'co-hk', name: 'Hookka', short_code: 'HK' }], error: null }
        case 'chart_of_accounts':
          return { data: [{ code: '5019', name: 'Design Income', type: 'revenue', parent_code: null }, { code: '5050', name: 'Salary Income', type: 'revenue', parent_code: null }], error: null }
        case 'payroll_runs':
          return { data: { marketing_opex_total: 59697.96, hr_opex_total: 5797.05, finance_opex_total: 26636.73, director_office_total: 7415.8, it_opex_total: 5971.75, revenue_opex_total: 0, director_salary_total: 0, approved_at: '2026-10-05T02:08:45Z' }, error: null }
        case 'director_salary_submissions':
          return {
            data: {
              total_gross: 2500, total_payroll_gross: 2500, total_invoice: 0, total_saving: 0, director_count: 1, submitted_at: '2026-10-05T06:35:55Z',
              by_company: [{ company_id: 'co-2990', company_name: '2990', company_short_code: '2990', basic: 2500, kpi: 0, allowance: 6769.38, epf_er: 325, socso_er: 42.85, eis_er: 4.9, total_ctc: 9642.13 }],
            },
            error: null,
          }
        default:
          return { data: [], error: null }
      }
    }
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push(['eq', col, val]), q),
      neq: (col: string, val: unknown) => (filters.push(['neq', col, val]), q),
      in: (col: string, val: unknown) => (filters.push(['in', col, val]), q),
      gte: () => q, lte: () => q, not: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null } },
      single: async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null } },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return q
  })
  const rpc = vi.fn((name: string) => {
    const result = name === 'get_submitted_hr_summary' ? { data: { dept_summaries: {} }, error: null } : { data: [], error: null }
    const q = {
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from, rpc })
  mocks.fetchPaidByInvoice.mockResolvedValue(new Map())
  mocks.loadDepartmentMode.mockResolvedValue(null)
  return { from, rpc }
}

const card = (name: string) => screen.getByRole('group', { name })
const sent = () => JSON.parse(screen.getByTestId('list').textContent ?? '{}') as {
  ids: string[]
  categoryByInvoice: Record<string, string>
  canSetDefault: boolean
  receiptsByInvoice: Record<string, Array<{ voucherNo: string | null; date: string | null; amount: number; batch?: boolean }>>
}
const page = async () => render(await BillingView({ searchParams: Promise.resolve({ period: PERIOD }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'fm', role: 'finance', permissions: ['billing'] }))
})

describe('Service Billing on the sheet', () => {
  it('opens on four cards — invoiced, outstanding, received, the payroll basis — and no figure strip', async () => {
    database()
    await page()
    expect(card('Invoiced · September')).toHaveAttribute('data-tone', 'primary')
    expect(card('Invoiced · September')).toHaveTextContent('RM 21,133.76')
    expect(card('Invoiced · September')).toHaveTextContent('3 invoices · 1 voided left out')
    expect(card('Outstanding')).toHaveAttribute('data-tone', 'wait')
    expect(card('Outstanding')).toHaveTextContent('RM 9,642.13')
    expect(card('Outstanding')).toHaveTextContent('1 issued')
    expect(card('Received')).toHaveTextContent('RM 11,491.63')
    expect(card('Received')).toHaveTextContent('2 paid')
    expect(card('Payroll basis')).toHaveTextContent('Submitted')
    expect(card('Payroll basis')).toHaveTextContent('HR 5 Oct · Director salary 5 Oct · 0 marketing contracts')
    expect(document.querySelector('.statement-amount')).toBeNull()
    expect(screen.queryByText('HR OPEX')).toBeNull()
  })

  // 2026-10-09 (the Finance revamp): the controls in ONE row beside the title.
  // 2026-10-10 (the handoff): the eyebrow names the month, and the row is
  // BillingTools — the month control, From payroll ▼, Export ▼, + Create
  // Invoice ▼ — handed the page's month and whether Finance may create.
  it('heads the page with the month in the eyebrow and the tools beside the title', async () => {
    database()
    await page()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Service Billing')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DAILY OPERATIONS · SERVICE BILLING · SEPTEMBER 2026')
    expect(document.querySelector('.act-band')).toBeNull()
    const tools = within(document.querySelector('.page-head') as HTMLElement).getByTestId('tools')
    expect(tools.dataset).toMatchObject({ period: PERIOD, canCreate: 'true', companies: '2' })
  })

  it('hands Marketing projects the month’s invoice of each contract, for its Invoice button', async () => {
    database()
    await page()
    expect(JSON.parse(screen.getByTestId('marketing').textContent ?? 'null')).toEqual({ 'ct-1': { id: 'm1', no: 'HV-INV-202609-0039' } })
  })

  it('folds the payroll basis above the invoices, its figures on the fold, counting the consolidated lines by department', async () => {
    database()
    await page()
    const fold = document.querySelector('details.fin-fold') as HTMLElement
    expect(fold).not.toHaveAttribute('open')
    const summary = fold.querySelector('summary') as HTMLElement
    expect(summary).toHaveTextContent('Payroll basis')
    expect(summary).toHaveTextContent('HR 1,352 / 5,797 · Finance 2,129 / 26,637 · Director Office 2,175 / 7,416 · IT 2,986 / 5,972 · Director 9,642 ✓ · Marketing 2,850 / 59,698')
    expect(within(fold).getByText('Director Salary Submission')).toBeInTheDocument()
    // 2026-10-10 (the handoff): opened, the fold starts with a line per department.
    const lines = Array.from(fold.querySelectorAll('.bil-fold-line')).map((l) => l.textContent?.replace(/s+/g, ' ').trim())
    expect(lines[0]).toBe('HR · billed / from payroll1,352.45 / 5,797.05')
    expect(lines).toContain('Director · billed / from payroll9,642.13 / 9,642.13')
    expect(lines).toHaveLength(6)
    // Above the invoices, as before.
    expect(fold.compareDocumentPosition(screen.getByTestId('list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says "Director salary · pending" on the fold while the director submission has not come in', async () => {
    const db = database()
    const base = db.from.getMockImplementation()!
    db.from.mockImplementation((table: string) => {
      if (table !== 'director_salary_submissions') return base(table)
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }
      return q as never
    })
    await page()
    const lines = Array.from(document.querySelectorAll('details.fin-fold .bil-fold-line')).map((l) => l.textContent?.replace(/\s+/g, ' ').trim())
    expect(lines).toContain('Director salarypending')
    expect(lines.some((l) => l?.startsWith('Director ·'))).toBe(false)
  })

  it('tells the list each invoice’s category from its lines, and that Finance may set the default arrangement', async () => {
    database()
    await page()
    expect(sent().ids).toEqual(['d1', 'c1', 'm1', 'v1'])
    expect(sent().categoryByInvoice).toEqual({ c1: 'Salary Income', m1: 'Design Income' })
    expect(sent().canSetDefault).toBe(true)
  })
})

// 2026-10-08 — the page awaited eleven reads one after another (~690 ms in
// production) and the mode switch a twelfth after that. Two stages now.
describe('Service Billing reads in two stages', () => {
  it('asks for what hangs off the invoices the moment both invoice lists are in — not after every other read', async () => {
    const { from, rpc } = database()
    // Hold back a read nothing else needs: the staff billing allocation.
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    const answer = rpc.getMockImplementation()!
    rpc.mockImplementation((name: string) => {
      const q = answer(name)
      if (name !== 'get_staff_billing_allocation') return q
      return {
        ...q,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => held.then(() => q.then(resolve, reject)),
      }
    })

    const rendering = page()
    await vi.waitFor(() => {
      expect(from).toHaveBeenCalledWith('invoice_lines')
      expect(from).toHaveBeenCalledWith('credit_notes')
      expect(mocks.fetchPaidByInvoice).toHaveBeenCalledWith(expect.anything(), ['d1'])
    })
    release()
    await rendering
    expect(card('Invoiced · September')).toHaveTextContent('RM 21,133.76')
  })

  it('starts Finance’s mode switch with the page’s own reads, and hands the card that read', async () => {
    const { from } = database()
    const mode = { id: 'dept-fin', name: 'Finance', segmentKey: 'finance', isInternal: false, costModel: 'cost_center', openSplitPeople: 0, canSwitch: true }
    mocks.loadDepartmentMode.mockResolvedValue(mode)
    await page()
    expect(mocks.loadDepartmentMode).toHaveBeenCalledTimes(1)
    expect(mocks.loadDepartmentMode).toHaveBeenCalledWith('finance')
    const lines = from.mock.calls.findIndex(([table]) => table === 'invoice_lines')
    expect(mocks.loadDepartmentMode.mock.invocationCallOrder[0]).toBeLessThan(from.mock.invocationCallOrder[lines])
    const props = mocks.departmentModeCard.mock.calls[0][0] as { segmentKey: string; department?: Promise<unknown> }
    expect(props.segmentKey).toBe('finance')
    await expect(props.department).resolves.toBe(mode)
  })
})

// 2026-10-08 — the receipts, credit notes and batch vouchers of every listed
// invoice were each one `.in()` over every listed id (this month's AND every
// other month's still-open invoice) — past ~500 ids the URL fails outright —
// and one unranged read, which PostgREST stops at 1000 rows without a word.
describe('Service Billing’s receipts, past the caps', () => {
  type Row = Record<string, unknown>
  const INVOICE = { ...base, settlement_voucher_id: null }

  /** 150 issued invoices this month; invoice p000 holds 1,001 receipts. */
  function bigMonth() {
    const db = database()
    const base = db.from.getMockImplementation()!
    const invoices: Row[] = Array.from({ length: 150 }, (_, i) => ({
      ...INVOICE,
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
      // The last receipt is the latest: 1,001st in payment-date order.
      payment_date: i === 1000 ? '2026-09-30' : '2026-09-01',
      amount: 0.1,
      direction: 'credit',
      status: 'paid',
    }))
    const tables: Record<string, Row[]> = { invoices, payment_vouchers: receipts, credit_notes: [] }
    const inLists: Record<string, number[]> = {}
    db.from.mockImplementation((table: string) => {
      if (!(table in tables)) return base(table)
      const filters: Array<(r: Row) => boolean> = []
      const orders: string[] = []
      let range: [number, number] | null = null
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        in: (c: string, v: unknown[]) => {
          ;(inLists[`${table}.${c}`] ??= []).push(v.length)
          filters.push((r) => v.includes(r[c]))
          return q
        },
        order: (c: string) => (orders.push(c), q),
        range: (lo: number, hi: number) => ((range = [lo, hi]), q),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          const rows = tables[table].filter((r) => filters.every((f) => f(r)))
          rows.sort((a, b) => {
            for (const c of orders) {
              const x = String(a[c])
              const y = String(b[c])
              if (x !== y) return x < y ? -1 : 1
            }
            return 0
          })
          const [lo, hi] = range ?? [0, 999]
          return Promise.resolve({ data: rows.slice(lo, Math.min(hi + 1, lo + 1000)), error: null }).then(resolve, reject)
        },
      }
      return q as never
    })
    return { inLists }
  }

  it('asks 100 invoices a time, and still hands the list the 1,001st receipt', async () => {
    const { inLists } = bigMonth()
    await page()
    const p000 = sent().receiptsByInvoice.p000
    expect(p000).toHaveLength(1001)
    expect(p000[1000]).toMatchObject({ voucherNo: 'HV-OR-202609-LAST', date: '2026-09-30' })
    // Credit notes: one chunk of 100, one of 50. Receipts: the same two as
    // written, then the capped chunk again in two pages.
    expect(inLists['credit_notes.invoice_id']).toEqual([100, 50])
    expect([...inLists['payment_vouchers.invoice_id']].sort((a, b) => a - b)).toEqual([50, 100, 100, 100])
    expect(Math.max(...Object.values(inLists).flat())).toBe(100)
  })
})
