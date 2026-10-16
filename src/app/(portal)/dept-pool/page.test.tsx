import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Department Pools per the user's Claude Design handoff (Phase 4
// of the Finance revamp), for whoever reads every department (Finance, the
// Principal). Cash: five cards (total balance, in / out / net to date, below
// zero), Balance by bank ABOVE By department, each closing on an "All
// departments" row. Accrual: five cards (revenue, cost, expense,
// inter-billing, net margin) over By department. Cash or Accrual is the
// sidebar's choice (?basis=). Somebody who reads only their own department
// keeps the page as it was.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), fetchIncomeStatement: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), execute: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/cfo-reports', () => ({ fetchIncomeStatement: mocks.fetchIncomeStatement }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/(portal)/hr-costing/actions', () => ({ executeHrCosting: vi.fn() }))
vi.mock('./hr-actions', () => ({ executeHrCostingInWords: mocks.execute }))
// The tables' saved column layout comes from the browser client; here there is none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

import DeptPoolPage from './page'

type Row = Record<string, unknown>

const TABLES: Record<string, Row[]> = {
  departments: [
    { id: 'd-fn', name: 'Finance', is_internal: false },
    { id: 'd-hr', name: 'HR', is_internal: false },
    { id: 'd-it', name: 'IT', is_internal: false },
    { id: 'd-mk', name: 'Marketing', is_internal: false },
    { id: 'd-vo', name: 'Venture Office', is_internal: true },
  ],
  dept_pool_balances: [
    { department_id: 'd-mk', balance: 182300 },
    { department_id: 'd-hr', balance: 98750 },
    { department_id: 'd-fn', balance: 64200 },
    { department_id: 'd-it', balance: -12400 },
    { department_id: 'd-vo', balance: 5000 },
  ],
  dept_pools: [
    { department_id: 'd-mk', transaction_type: 'np_in', amount: 300000 },
    { department_id: 'd-mk', transaction_type: 'expense_out', amount: 117700 },
    { department_id: 'd-hr', transaction_type: 'np_in', amount: 120000 },
    { department_id: 'd-hr', transaction_type: 'expense_out', amount: 21250 },
    { department_id: 'd-fn', transaction_type: 'np_in', amount: 80000 },
    { department_id: 'd-fn', transaction_type: 'inter_billing_out', amount: 15800 },
    { department_id: 'd-it', transaction_type: 'np_in', amount: 20000 },
    { department_id: 'd-it', transaction_type: 'expense_out', amount: 32400 },
    { department_id: 'd-vo', transaction_type: 'np_in', amount: 5000 },
  ],
  bank_accounts: [
    { gl_account_code: '1010', bank_name: 'Hong Leong', current_balance: 350000, is_primary: true, status: 'active' },
    { gl_account_code: '1020', bank_name: 'Alliance', current_balance: 93343.28, is_primary: false, status: 'active' },
  ],
  journal_lines: [
    { account_code: '1010', debit: 200000, credit: 94506.72, journal_entries: { segment: 'corporate', is_reversed: false } },
    { account_code: '1010', debit: 150000, credit: 0, journal_entries: { segment: 'marketing', is_reversed: false } },
    { account_code: '1020', debit: 32300, credit: 0, journal_entries: { segment: 'marketing', is_reversed: false } },
    { account_code: '1010', debit: 98750, credit: 0, journal_entries: { segment: 'hr', is_reversed: false } },
    { account_code: '1020', debit: 64200, credit: 0, journal_entries: { segment: 'finance', is_reversed: false } },
  ],
}

const pick = (row: Row, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Row | undefined)?.[k], row)

function database() {
  const from = (table: string) => {
    let rows = [...(TABLES[table] ?? [])]
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.order = () => q
    q.range = (lo: number, hi: number) => {
      rows = rows.slice(lo, hi + 1)
      return q
    }
    q.eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => pick(r, col) === val)
      return q
    }
    q.in = (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(pick(r, col)))
      return q
    }
    q.single = async () => ({ data: rows[0] ?? null, error: null })
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
    return q
  }
  const rpc = async () => ({
    data: [
      { id: 's1', period_month: '2026-09-01', submitted_at: '2026-09-28T02:00:00Z', submitted_by_name: 'HR', execution_state: 'executed', dept_summaries: { mk: { department_id: 'd-mk', total_ctc: 32960 } } },
      { id: 's2', period_month: '2026-10-01', submitted_at: '2026-10-08T02:00:00Z', submitted_by_name: 'HR', execution_state: 'approved_for_execution', dept_summaries: { hr: { department_id: 'd-hr', total_ctc: 20000 } } },
      { id: 's0', period_month: '2026-08-01', submitted_at: '2026-08-28T02:00:00Z', submitted_by_name: 'HR', execution_state: 'pending', dept_summaries: { it: { department_id: 'd-it', total_ctc: 5000 } } },
    ],
    error: null,
  })
  mocks.createClient.mockResolvedValue({ from, rpc })
}

const pool = (key: string, revenue: number, cost: number, expense: number, interBilling: number) => ({
  pool: key, revenue, cost, expense: expense + interBilling, margin: revenue - cost - expense - interBilling,
  expenseLines: interBilling ? [{ label: 'Inter-billing — HV-INV-1', amount: interBilling }, { label: 'Opex', amount: expense }] : [{ label: 'Opex', amount: expense }],
})

const card = (name: string) => screen.getByRole('group', { name })
const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['dept_pool', 'treasury'] })

beforeEach(() => {
  vi.clearAllMocks()
  database()
  mocks.requirePermission.mockResolvedValue(FINANCE)
  mocks.fetchIncomeStatement.mockResolvedValue({
    pools: [pool('dept_pool_marketing', 386000, 214000, 98600, 12400), pool('dept_pool_finance', 202500, 168400, 9800, 0), pool('venture_pool', 54000, 0, 4000, 0)],
  })
  vi.useFakeTimers({ now: new Date('2026-10-09T04:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('Department Pools · cash, for Finance', () => {
  it('heads the page, then five cards', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · CASH · OCTOBER 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Department Pools')
    expect(screen.getByRole('link', { name: 'Submissions' })).toHaveAttribute('href', '/dept-pool/submissions')
    expect(card('Total balance')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total balance')).toHaveTextContent('RM 443,343.28')
    expect(card('Total balance')).toHaveTextContent('4 departments + Venture')
    expect(card('In (to date)')).toHaveTextContent('RM 725,000.00')
    expect(card('Out (to date)')).toHaveTextContent('RM 281,656.72')
    expect(card('Net (to date)')).toHaveTextContent('RM 443,343.28')
    expect(card('Below zero')).toHaveAttribute('data-tone', 'danger')
    expect(card('Below zero')).toHaveTextContent('1')
    expect(card('Below zero')).toHaveTextContent('IT')
  })

  // The sidebar lists each department since 2026-10-09, so the two bases
  // are switched in the head (the user's sample: Cash | Accrual P&L).
  it('switches to Accrual P&L in its head', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const basis = screen.getByRole('group', { name: 'Basis' })
    expect(within(basis).getByRole('link', { name: 'Cash' })).toHaveAttribute('aria-current', 'page')
    expect(within(basis).getByRole('link', { name: 'Accrual P&L' })).toHaveAttribute('href', '/dept-pool?basis=accrual')
  })

  it('puts Balance by bank above By department, each closing on All departments', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['Balance by bank', 'By department'])

    const banks = section('Balance by bank')
    expect(within(banks).getByText('2 BANKS')).toBeInTheDocument()
    const mk = within(banks).getByText('Marketing').closest('tr') as HTMLElement
    expect(mk).toHaveTextContent('150,000.00')
    expect(mk).toHaveTextContent('32,300.00')
    expect(mk).toHaveTextContent('182,300.00')
    expect(banks.querySelector('tfoot')).toHaveTextContent('All departments')

    const depts = section('By department')
    expect(within(depts).getByText('CASH · TO DATE')).toBeInTheDocument()
    expect(within(depts).getByRole('link', { name: 'Marketing' })).toHaveAttribute('href', '/dept-pool/marketing')
    const it = within(depts).getByText('IT').closest('tr') as HTMLElement
    expect(it).toHaveTextContent('20,000.00')
    expect(it.querySelector('.text-danger')).toHaveTextContent('(12,400.00)')
    expect(within(depts).getByText(/Venture/).closest('tr')).toHaveTextContent('205,000.00')
    const foot = depts.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('All departments')
    expect(foot).toHaveTextContent('725,000.00')
    expect(foot).toHaveTextContent('281,656.72')
  })
})

describe('Department Pools · the HR costing submission, for Finance', () => {
  it('reads each department’s latest submission as a chip, the ready one with Mark executed', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const depts = section('By department')
    const row = (name: string) => within(depts).getByText(name).closest('tr') as HTMLElement
    expect(within(row('Marketing')).getByText('executed').closest('.chip')).toHaveClass('ledger')
    expect(within(row('HR')).getByText('ready to execute').closest('.chip')).toHaveClass('accent')
    expect(within(row('HR')).getByRole('button', { name: 'Mark executed' })).toBeInTheDocument()
    // 2026-10-10 — the handoff: waiting on the Principal is the blue wait tone, not alert.
    expect(within(row('IT')).getByText('awaiting Principal').closest('.chip')).toHaveClass('wait')
    expect(within(row('IT')).getByText('awaiting Principal').closest('.chip')).not.toHaveClass('alert')
    expect(row('Finance')).toHaveTextContent('—')
    expect(within(row('Marketing')).queryByRole('button', { name: 'Mark executed' })).toBeNull()
  })

  // 2026-10-16 — the desktop's one-way steps ask first, as the phone's do: nothing sets a submission back.
  it('Mark executed asks first, and only its answer marks the month executed', async () => {
    mocks.execute.mockResolvedValue({ ok: true })
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const row = within(section('By department')).getByText('HR').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Mark executed' }))
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('Mark October 2026 executed?')
    expect(ask).toHaveTextContent('This cannot be undone.')
    expect(mocks.execute).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Mark executed' }))
    })
    expect(mocks.execute).toHaveBeenCalledWith('s2')
    expect(mocks.refresh).toHaveBeenCalled()
  })
})

// 2026-10-10 — the handoff: Balance by bank and By department are the sheet's
// tables — ▽ on Department, a Range on the amounts, columns that resize and
// reorder — still closing on "All departments", with every link, chip and
// Mark executed kept. A bank's column is headed by its name alone.
describe('Department Pools · the sheet tables, for Finance', () => {
  it('heads each bank column with the bank’s name alone', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const banks = section('Balance by bank')
    expect(banks.querySelector('thead th[data-col="bank:1010"]')).toHaveTextContent(/^Hong Leong\W*$/)
    expect(banks.querySelector('thead th[data-col="bank:1020"]')).toHaveTextContent(/^Alliance\W*$/)
    expect(banks).not.toHaveTextContent('(1010)')
  })

  it('filters by department and by a range of amounts', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const banks = section('Balance by bank')
    expect(within(banks).getByRole('button', { name: 'Filter Department' })).toBeInTheDocument()
    fireEvent.click(within(banks).getByRole('button', { name: 'Filter Total' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Total' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()

    const depts = section('By department')
    fireEvent.click(within(depts).getByRole('button', { name: 'Filter Department' }))
    const filter = screen.getByRole('dialog', { name: 'Filter Department' })
    fireEvent.click(within(filter).getByRole('checkbox', { name: 'Marketing' }))
    expect(within(depts).queryByText('Marketing')).toBeNull()
    expect(within(depts).getByText('HR')).toBeInTheDocument()
    expect(within(depts).getByRole('button', { name: 'Filter In (to date)' })).toBeInTheDocument()
  })

  it('keeps the balance hidden until its header shows it', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    const depts = section('By department')
    const hr = within(depts).getByText('HR').closest('tr') as HTMLElement
    expect(hr).toHaveTextContent('••••••')
    fireEvent.click(within(depts).getByRole('button', { name: /Balance/ }))
    expect(hr).toHaveTextContent('98,750.00')
  })

  it('makes the accrual By department a sheet table too', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({ basis: 'accrual' }) }))
    const depts = section('By department')
    expect(within(depts).getByRole('button', { name: 'Filter Department' })).toBeInTheDocument()
    expect(within(depts).getByRole('button', { name: 'Filter = Net margin' })).toBeInTheDocument()
    expect(within(depts).getByRole('link', { name: 'P&L' })).toHaveAttribute('href', '/dept-pool/marketing?tab=pnl')
  })
})

describe('Department Pools · accrual, for Finance', () => {
  it('shows five cards over By department with its total', async () => {
    render(await DeptPoolPage({ searchParams: Promise.resolve({ basis: 'accrual' }) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · ACCRUAL P&L · OCTOBER 2026')
    const basis = screen.getByRole('group', { name: 'Basis' })
    expect(within(basis).getByRole('link', { name: 'Accrual P&L' })).toHaveAttribute('aria-current', 'page')
    expect(within(basis).getByRole('link', { name: 'Cash' })).toHaveAttribute('href', '/dept-pool')
    expect(card('Revenue (bill)')).toHaveTextContent('RM 642,500.00')
    expect(card('Cost')).toHaveTextContent('RM 382,400.00')
    expect(card('Expense')).toHaveTextContent('RM 112,400.00')
    expect(card('Inter-billing')).toHaveTextContent('RM 12,400.00')
    expect(card('Net margin')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net margin')).toHaveTextContent('RM 135,300.00')
    const depts = section('By department')
    expect(within(depts).getByText('ACCRUAL · TO DATE')).toBeInTheDocument()
    const foot = depts.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('All departments')
    expect(foot).toHaveTextContent('135,300.00')
  })
})

describe('somebody who reads only their own department', () => {
  it('keeps the page as it was', async () => {
    mocks.requirePermission.mockResolvedValue({ ...withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_pool'] }), department_id: 'd-it' })
    render(await DeptPoolPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · POOL OVERVIEW')
    expect(screen.queryByRole('group', { name: 'Total balance' })).toBeNull()
  })
})
