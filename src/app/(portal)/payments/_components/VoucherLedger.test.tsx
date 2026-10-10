import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchAllRows: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
// The vouchers' own read is answered by hand; every other pager is the real one.
vi.mock('@/lib/paginate', async (original) => ({
  ...(await original<typeof import('@/lib/paginate')>()),
  fetchAllRows: mocks.fetchAllRows,
}))
vi.mock('@/lib/receipt-extras', async (original) => ({
  ...(await original<typeof import('@/lib/receipt-extras')>()),
  fetchReceiptExtras: vi.fn(async () => []),
}))
vi.mock('@/lib/payment-extras', () => ({ fetchPaymentExtras: vi.fn(async () => []) }))
vi.mock('./PaymentTabs', () => ({
  default: (props: { counts?: Record<string, number> }) => <pre data-testid="tabs">{JSON.stringify(props.counts ?? null)}</pre>,
}))
vi.mock('./PaymentFilters', () => ({ default: () => <div data-testid="payment-filters" /> }))
vi.mock('./BackToTop', () => ({ default: () => null }))
// The table is a client component: its props are exactly what the server sends
// to the browser, so they are printed and read here as the browser would get them.
vi.mock('./VouchersTable', () => ({
  default: (props: { rows: unknown[] }) => <pre data-testid="sent">{JSON.stringify(props.rows)}</pre>,
}))

import VoucherLedger from './VoucherLedger'
import { fetchPaymentExtras } from '@/lib/payment-extras'

const base = {
  direction: 'debit', voucher_type: 'expense', status: 'paid', reference_type: null as string | null,
  payment_date: '2026-10-05', created_at: '2026-10-01T03:00:00+00:00', target_pool: null, source_pool: null,
  fund_source_id: null, loan_id: null,
}
const VOUCHERS = [
  { ...base, id: 'v-tnb', voucher_no: 'HV-PV-202610-0450', amount: 1200, payee_name: 'TNB', description: 'September bill' },
  { ...base, id: 'v-aina', voucher_no: 'HV-PV-202610-0451', amount: 3200.5, payee_name: 'Aina binti Example', description: 'Payroll disbursement Sep 2026 — Aina binti Example', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-bala', voucher_no: 'HV-PV-202610-0452', amount: 4100.25, payee_name: 'Bala Sample', description: 'Payroll disbursement Sep 2026 — Bala Sample', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-kwsp', voucher_no: 'HV-PV-202610-0453', amount: 1014, payee_name: 'KWSP', description: 'KWSP — Sep 2026 payroll (Zeta · 1 staff)', reference_type: 'payroll_statutory' },
  { ...base, id: 'v-fund', voucher_no: 'HV-PV-202610-0454', amount: 4225, payee_name: 'HR custody', description: 'Payroll bank transfer — Sep 2026 (Zeta)', reference_type: 'payroll_payment_request', voucher_type: 'payroll_bank_transfer', status: 'pending_approval' },
]

function database(claimQueue: Array<{ voucher_id: string | null }> = []) {
  const from = vi.fn((table: string) => {
    const result = table === 'payroll_payment_requests' ? { count: 2, data: null, error: null } : table === 'bank_accounts' ? { data: [{ id: 'bank-hl', bank_name: 'Hong Leong' }], error: null } : { data: [], error: null }
    const q = {
      select: () => q, eq: () => q, order: () => q, range: () => q,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return q
  })
  // Payments › Claim requests' queue (2026-10-08).
  const rpc = vi.fn(async () => ({ data: claimQueue, error: null }))
  mocks.createClient.mockResolvedValue({ from, rpc })
  mocks.fetchAllRows.mockResolvedValue(VOUCHERS)
  return { from, rpc }
}

const sent = () => JSON.parse(screen.getByTestId('sent').textContent ?? '[]') as Array<{
  id: string
  payee_name: string
  description: string | null
  amount: number
  status: string
  catLabel?: string
  poolLabel?: string
  batchKey?: string
  locked?: boolean
}>

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "我现在有 finance executive 了，我不希望他看到 payroll detail，
// 也就是每个人的 payout").
describe('Payments, for an account with Payroll payouts', () => {
  it('lists every voucher as before, the salary ones under their batch', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().map((r) => r.id)).toEqual(['v-tnb', 'v-aina', 'v-bala', 'v-kwsp', 'v-fund'])
    expect(sent().find((r) => r.id === 'v-aina')?.batchKey).toBe('Payroll disbursement Sep 2026')
    expect(sent().some((r) => r.locked)).toBe(false)
    expect(screen.getByRole('link', { name: /Payroll Requests/ })).toHaveTextContent('2')
    expect(screen.getByText('5 of 5 vouchers')).toBeVisible()
  })
})

// A member's claim HR approved as a payment request waits here for Finance's
// voucher (2026-10-08) — the badge counts only those still without one.
describe('Payments › Claim Requests', () => {
  it('counts the claims still waiting for a voucher', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    const { rpc } = database([{ voucher_id: null }, { voucher_id: null }, { voucher_id: 'v-1' }])
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(rpc).toHaveBeenCalledWith('claim_payment_queue')
    expect(screen.getByRole('link', { name: /Claim Requests/ })).toHaveAttribute('href', '/payments/claim-requests')
    expect(screen.getByRole('link', { name: /Claim Requests/ })).toHaveTextContent('2')
  })

  it('is not asked on the receipts side', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    const { rpc } = database()
    render(await VoucherLedger({ direction: 'credit', params: {} }))
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /Claim Requests/ })).toBeNull()
  })
})

describe('Payments, for a treasury account without Payroll payouts', () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
  })

  it('sends the browser no payroll voucher — only one total per batch', async () => {
    database()
    const { container } = render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().filter((r) => !r.locked).map((r) => r.id)).toEqual(['v-tnb'])
    expect(sent().filter((r) => r.locked).map((r) => [r.payee_name, r.description, r.amount, r.status])).toEqual([
      ['KWSP Sep 2026', '1 张 · 1 paid · 只显示总数', 1014, 'paid'],
      ['Payroll bank transfer Sep 2026', '1 张 · 1 pending approval · 只显示总数', 4225, 'pending_approval'],
      ['Payroll disbursement Sep 2026', '2 张 · 2 paid · 只显示总数', 7300.75, 'paid'],
    ])
    // Not a person, not a voucher number of theirs, not a department that is one person.
    for (const secret of ['Aina', 'Bala', 'HV-PV-202610-0451', 'HV-PV-202610-0452', 'Zeta', 'HR custody', '3,200.50', '4,100.25']) {
      expect(container.innerHTML).not.toContain(secret)
    }
  })

  // 2026-10-10: the count and the status, apart, so the Finance view can say
  // them in English ("26 vouchers · 26 paid · total only").
  it('sends each batch’s count and status alongside, and nothing more', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    const rows = sent() as Array<{ locked?: boolean; payee_name: string; lockedNote?: { count: number; statusText: string } }>
    expect(rows.filter((r) => r.locked).map((r) => [r.payee_name, r.lockedNote])).toEqual([
      ['KWSP Sep 2026', { count: 1, statusText: '1 paid' }],
      ['Payroll bank transfer Sep 2026', { count: 1, statusText: '1 pending approval' }],
      ['Payroll disbursement Sep 2026', { count: 2, statusText: '2 paid' }],
    ])
  })

  it('still totals every voucher in the summary, and counts the folded ones', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(screen.getByText('RM 9,514.75')).toBeVisible() // paid: 1,200 + 3,200.50 + 4,100.25 + 1,014
    expect(screen.getByText('RM 4,225.00')).toBeVisible() // pending: the funding transfer
    expect(screen.getByText('5 of 5 vouchers')).toBeVisible()
  })

  it('has no way into Payroll Requests, and does not ask how many are waiting', async () => {
    const { from } = database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(screen.queryByRole('link', { name: /Payroll Requests/ })).toBeNull()
    expect(from).not.toHaveBeenCalledWith('payroll_payment_requests')
  })

  it('a search for a person finds nothing: a batch answers to its own name only', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { q: 'aina' } }))
    expect(screen.queryByTestId('sent')).toBeNull()
    expect(screen.getByText('0 of 5 vouchers')).toBeVisible()
  })

  it('…and a search for the batch finds the batch', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { q: 'payroll disbursement' } }))
    expect(sent().map((r) => [r.payee_name, r.locked])).toEqual([['Payroll disbursement Sep 2026', true]])
  })

  it('a pool or an amount filter leaves the batches out rather than read inside them', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { min: '4000' } }))
    expect(screen.queryByTestId('sent')).toBeNull() // TNB is under 4,000 and no batch is offered
    expect(screen.getByText('0 of 5 vouchers')).toBeVisible()
  })
})

// 2026-10-08: the ledger's five reads were awaited one after another
// (~400–450 ms in production) though none needs another's answer.
describe('the ledger’s reads', () => {
  it('asks for everything at once — nothing waits for the vouchers', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    const { from, rpc } = database()
    let release = () => {}
    mocks.fetchAllRows.mockImplementation(() => new Promise((resolve) => { release = () => resolve(VOUCHERS) }))

    const ledger = VoucherLedger({ direction: 'debit', params: {} })
    await vi.waitFor(() => {
      expect(from).toHaveBeenCalledWith('payroll_payment_requests')
      expect(from).toHaveBeenCalledWith('payment_voucher_sources')
      expect(rpc).toHaveBeenCalledWith('claim_payment_queue')
      expect(fetchPaymentExtras).toHaveBeenCalled()
    })
    release()
    render(await ledger)
    expect(screen.getByText('5 of 5 vouchers')).toBeVisible()
  })
})

// 2026-10-07: Payments and Receipts on the sheet the way HR Costing is (user
// approved the Payments sample, orange): summary cards instead of the figure
// strip, the tabs counted, one toolbar of filters, a section head over the table.
describe('the ledger on the sheet', () => {
  const card = (name: string) => screen.getByRole('group', { name })

  it('opens on four summary cards — paid, waiting, approved, all — with the paid one as the primary', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(card('Total paid')).toHaveTextContent('RM 9,514.75')
    expect(card('Total paid')).toHaveAttribute('data-tone', 'primary')
    expect(card('Pending approval')).toHaveTextContent('RM 4,225.00')
    expect(card('Pending approval')).toHaveAttribute('data-tone', 'wait')
    expect(card('Pending approval')).toHaveTextContent('0 draft · 1 pending')
    expect(card('Approved · to pay')).toHaveTextContent('RM 0.00')
    expect(card('All vouchers')).toHaveTextContent('5')
    expect(card('All vouchers')).toHaveTextContent('0 voided')
    expect(document.querySelector('.statement-amount')).toBeNull()
  })

  it('counts every tab, and heads the table with what is on show', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(JSON.parse(screen.getByTestId('tabs').textContent ?? 'null')).toEqual({ all: 5, draft: 0, pending_approval: 1, approved: 0, paid: 4, voided: 0, payroll: 1 })
    const head = document.querySelector('.sect-head')
    expect(head).toHaveTextContent('Payment vouchers')
    expect(head).toHaveTextContent('5 of 5 vouchers')
  })

  // 2026-10-09 (the Finance revamp): payroll batches have a tab of their own.
  // 2026-10-10 — the handoff heads it "Payroll batches · N BATCHES · M VOUCHERS".
  it('the Payroll batches tab lists the batches’ vouchers only, under a head that counts both', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { status: 'payroll' } }))
    expect(sent().map((r) => r.id)).toEqual(['v-aina', 'v-bala'])
    const head = document.querySelector('.sect-head') as HTMLElement
    expect(head.querySelector('h2')).toHaveTextContent('Payroll batches')
    expect(head.querySelector('.count')).toHaveTextContent('1 batch · 2 vouchers')
  })

  // 2026-10-10 — the handoff: money in is the green (ledger) card.
  it('says Total received and Approved · to receive on the receipt side', async () => {
    database()
    mocks.fetchAllRows.mockResolvedValue(VOUCHERS.map((v) => ({ ...v, direction: 'credit' })))
    render(await VoucherLedger({ direction: 'credit', params: {} }))
    expect(card('Total received')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Approved · to receive')).toBeInTheDocument()
    expect(document.querySelector('.sect-head')).toHaveTextContent('Official receipts')
    // No payroll on the receipt side, so no tab for it.
    expect(JSON.parse(screen.getByTestId('tabs').textContent ?? 'null')).not.toHaveProperty('payroll')
  })

  it('names each receipt’s bank (2026-10-09)', async () => {
    database()
    mocks.fetchAllRows.mockResolvedValue(VOUCHERS.map((v) => ({ ...v, direction: 'credit', bank_account_id: v.id === 'v-tnb' ? 'bank-hl' : null })))
    render(await VoucherLedger({ direction: 'credit', params: {} }))
    const rows = sent() as Array<{ id: string; bankLabel?: string }>
    expect(rows.find((r) => r.id === 'v-tnb')?.bankLabel).toBe('Hong Leong')
    expect(rows.find((r) => r.id === 'v-kwsp')?.bankLabel).toBeUndefined()
  })
})

// 2026-10-10 — the handoff (audit 2026-10-09 l): the head is Dept Requests ·
// Payroll Requests · Create payment, the eyebrow names the month, the cards
// speak English, and Receipts is "Receipt" with its green Total received.
describe('the filter form', () => {
  // 2026-10-10 — the user: drop the old filter row (照设计档); the columns' ▽
  // filter category, pool, amount and date, and the search box finds the rest.
  it('is gone from both sides', async () => {
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(screen.queryByTestId('payment-filters')).toBeNull()
    cleanup()
    render(await VoucherLedger({ direction: 'credit', params: {} }))
    expect(screen.queryByTestId('payment-filters')).toBeNull()
  })
})

describe('the handoff’s head and cards', () => {
  const head = () => document.querySelector('.page-head') as HTMLElement
  const actions = () => within(head()).getAllByRole('link')
  const card = (name: string) => screen.getByRole('group', { name })

  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
  })
  afterEach(() => vi.useRealTimers())

  it('offers Dept Requests, then Payroll Requests with its count, then Create payment — and keeps the extras', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(actions().map((a) => a.textContent)).toEqual([
      'Export Excel', 'Export PDF', 'Dept Requests', 'Payroll Requests · 2', 'Claim Requests', 'Create payment',
    ])
    expect(within(head()).getByRole('link', { name: 'Dept Requests' })).toHaveAttribute('href', '/payments/dept-requests')
  })

  it('Dept Requests asks only for Treasury — its page’s own gate — so an account without Payroll payouts has it too', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(within(head()).getByRole('link', { name: 'Dept Requests' })).toBeInTheDocument()
    expect(within(head()).queryByRole('link', { name: /Payroll Requests/ })).toBeNull()
  })

  it('on a phone only Create payment stays in the head', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    // .pay-act hides below 768px on the Finance view; .pay-act-pri is the one that stays.
    expect(actions().filter((a) => a.classList.contains('pay-act') && !a.classList.contains('pay-act-pri')).map((a) => a.textContent)).toEqual([
      'Export Excel', 'Export PDF', 'Dept Requests', 'Payroll Requests · 2', 'Claim Requests',
    ])
    expect(within(head()).getByRole('link', { name: 'Create payment' })).toHaveClass('pay-act', 'pay-act-pri')
  })

  it('names the month in the eyebrow — the office’s month', async () => {
    // 01:00 on 1 Oct in the office is still 30 Sep on the server's clock.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T17:00:00Z'))
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DAILY OPERATIONS · PAYMENT VOUCHERS · OCTOBER 2026')
  })

  it('counts the repayments and the loans out in English on the Total paid card', async () => {
    database()
    const extra = { voucher_no: null, direction: 'debit' as const, status: 'paid', poolLabel: '—', description: null, paymentOrCreatedDate: '2026-10-02' }
    vi.mocked(fetchPaymentExtras).mockResolvedValueOnce([
      { ...extra, id: 'fsr-1', amount: 500, payee_name: 'HOUZS Century (HC)', catLabel: '还款 · principal' },
      { ...extra, id: 'fsr-2', amount: 80, payee_name: 'HOUZS Century (HC)', catLabel: '还款 · interest' },
      { ...extra, id: 'lout-1', amount: 9000, payee_name: 'HOUZS Bedding (HB)', catLabel: 'Loan OUT · 借出' },
    ])
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(card('Total paid')).toHaveTextContent('4 PVs · 2 repayments · 1 loan out')
    expect(card('Total paid')).not.toHaveTextContent('还款')
  })

  it('the receipt side: titled Receipt, the month in its eyebrow, Loan repayment received beside Create receipt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T03:00:00Z'))
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
    database()
    mocks.fetchAllRows.mockResolvedValue(VOUCHERS.map((v) => ({ ...v, direction: 'credit' })))
    render(await VoucherLedger({ direction: 'credit', params: {} }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Receipt$/)
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DAILY OPERATIONS · OFFICIAL RECEIPTS · OCTOBER 2026')
    expect(actions().map((a) => a.textContent)).toEqual(['Export Excel', 'Export PDF', 'Loan repayment received', 'Create receipt'])
    expect(within(head()).getByRole('link', { name: 'Loan repayment received' })).toHaveAttribute('href', '/payments/new?mode=loan_repayment')
    expect(within(head()).queryByRole('link', { name: 'Dept Requests' })).toBeNull()
    expect(head()).not.toHaveTextContent('收到')
  })
})

// 2026-10-08: the sources were one unranged read (620 rows), and PostgREST
// stops one at 1000 rows without a word — a voucher whose source fell past it
// lost its category and pool. Asked as written first (ties keep the order the
// database gave them); a capped answer is read again in pages.
describe('the ledger’s voucher sources, past 1000 rows', () => {
  type Source = {
    id: string
    voucher_id: string
    pool: string
    amount: number
    account_code: string | null
    chart_of_accounts: { name: string } | null
  }

  function databaseWithSources(sources: Source[]) {
    const db = database()
    const base = db.from.getMockImplementation()!
    const requests: Array<{ orders: string[]; range: [number, number] | null }> = []
    db.from.mockImplementation((table: string) => {
      if (table !== 'payment_voucher_sources') return base(table)
      const req = { orders: [] as string[], range: null as [number, number] | null }
      requests.push(req)
      const q = {
        select: () => q,
        order: (col: string, o?: { ascending?: boolean }) => (req.orders.push(`${col}.${o?.ascending === false ? 'desc' : 'asc'}`), q),
        range: (lo: number, hi: number) => ((req.range = [lo, hi]), q),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          // As written: biggest first, ties as stored. Paged: `id` breaks them.
          const rows = [...sources].sort((a, b) => b.amount - a.amount || (req.range ? a.id.localeCompare(b.id) : 0))
          const [lo, hi] = req.range ?? [0, 999]
          return Promise.resolve({ data: rows.slice(lo, Math.min(hi + 1, lo + 1000)), error: null }).then(resolve, reject)
        },
      }
      return q as never
    })
    return { ...db, requests }
  }

  const older = (n: number): Source[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `s-${String(i).padStart(5, '0')}`,
      voucher_id: `v-older-${i}`,
      pool: 'venture_pool',
      amount: 5000,
      account_code: '9087',
      chart_of_accounts: { name: 'Website & Software' },
    }))

  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
  })

  it('labels the voucher whose source is the 1,001st row', async () => {
    // The TNB bill's source is the smallest of 1,001: last in either order.
    const tnb: Source = {
      id: 's-tnb', voucher_id: 'v-tnb', pool: 'dept_pool_finance', amount: 1200, account_code: '9091',
      chart_of_accounts: { name: 'Water & Electricity' },
    }
    const { requests } = databaseWithSources([...older(1000), tnb])
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().find((r) => r.id === 'v-tnb')).toMatchObject({ catLabel: 'Water & Electricity', poolLabel: 'Finance' })
    expect(requests).toEqual([
      { orders: ['amount.desc'], range: null },
      { orders: ['amount.desc', 'id.asc'], range: [0, 999] },
      { orders: ['amount.desc', 'id.asc'], range: [1000, 1999] },
    ])
  })

  it('under the cap, asks once, as before, and keeps the order the sources came in', async () => {
    // Two sources of one amount on one voucher: their labels join in arrival order.
    const { requests } = databaseWithSources([
      { id: 's-b', voucher_id: 'v-tnb', pool: 'dept_pool_marketing', amount: 600, account_code: '9094', chart_of_accounts: { name: 'Office Rental' } },
      { id: 's-a', voucher_id: 'v-tnb', pool: 'dept_pool_finance', amount: 600, account_code: '9091', chart_of_accounts: { name: 'Water & Electricity' } },
    ])
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().find((r) => r.id === 'v-tnb')).toMatchObject({
      catLabel: 'Office Rental + Water & Electricity',
      poolLabel: 'Marketing + Finance',
    })
    expect(requests).toEqual([{ orders: ['amount.desc'], range: null }])
  })
})
