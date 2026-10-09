import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-09 — the Venture Pool per the user's Claude Design handoff (Phase 4
// of the Finance revamp): Export in the head; four cards (in / out this month,
// the net change, the running balance); "In vs Out" as a pie for the month
// (In #3F7A64, Out #E99A53) beside twelve months of bars; then the pool
// ledger, each line's direction a chip.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/venture-pool', useSearchParams: () => new URLSearchParams() }))

import VenturePoolPage from './page'

type Row = Record<string, unknown>
const line = (id: string, date: string, debit: number, credit: number, description: string, reference_type: string | null) => ({
  id, debit, credit, description, account_code: '1010',
  journal_entries: { transaction_date: date, description, reference_type, segment: 'corporate', is_reversed: false },
})
const LINES: Row[] = [
  line('j1', '2026-08-12', 300000, 0, 'Fund source received', 'fund_source'),
  line('j2', '2026-09-30', 0, 8745, 'HC fund source — Sep interest', 'fund_source_repayment'),
  line('j3', '2026-10-02', 4126.5, 0, 'HB advance — Oct interest', 'repayment'),
  line('j4', '2026-10-03', 0, 20000, 'Top-up to Dept Pool — IT', 'payment_voucher'),
  line('j5', '2026-10-06', 8163.33, 0, 'HC term loan — Oct interest', 'repayment'),
]

const pick = (row: Row, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Row | undefined)?.[k], row)

function database() {
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      let rows: Row[] = table === 'journal_lines' ? [...LINES] : table === 'bank_accounts' ? [{ gl_account_code: '1010', status: 'active' }] : []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.order = () => q
      q.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => pick(r, c) === v)), q)
      q.in = (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(pick(r, c)))), q)
      q.gte = (c: string, v: string) => ((rows = rows.filter((r) => String(pick(r, c)) >= v)), q)
      q.lt = (c: string, v: string) => ((rows = rows.filter((r) => String(pick(r, c)) < v)), q)
      q.limit = (n: number) => ((rows = rows.slice(0, n)), q)
      q.range = (lo: number, hi: number) => ((rows = rows.slice(lo, hi + 1)), q)
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
      return q
    },
  })
}

const card = (name: string) => screen.getByRole('group', { name })
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['venture_pool'] })
  database()
  vi.useFakeTimers({ now: new Date('2026-10-09T04:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('the Venture Pool on the sheet', () => {
  it('heads the page with Export and shows four cards', async () => {
    render(await VenturePoolPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · VENTURE POOL · OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/venture-pool/export')
    expect(card('In this month')).toHaveAttribute('data-tone', 'ledger')
    expect(card('In this month')).toHaveTextContent('RM 12,289.83')
    expect(card('Out this month')).toHaveAttribute('data-tone', 'danger')
    expect(card('Out this month')).toHaveTextContent('RM (20,000.00)')
    expect(card('Net change')).toHaveAttribute('data-tone', 'danger')
    expect(card('Net change')).toHaveTextContent('RM (7,710.17)')
    expect(card('Running balance')).toHaveAttribute('data-tone', 'primary')
    expect(card('Running balance')).toHaveTextContent('RM 283,544.83')
  })

  it('draws In vs Out: the month as a pie, twelve months as bars', async () => {
    render(await VenturePoolPage())
    const charts = section('In vs Out')
    expect(within(charts).getByText('THIS MONTH · 12 MONTHS')).toBeInTheDocument()
    const pie = charts.querySelector('.vp-pie') as HTMLElement
    expect(pie.getAttribute('style')).toContain('#3F7A64')
    expect(pie.getAttribute('style')).toContain('#E99A53')
    expect(charts).toHaveTextContent('In · 38%')
    expect(charts).toHaveTextContent('Out · 62%')
    expect(charts.querySelectorAll('.vp-month')).toHaveLength(12)
    expect(Array.from(charts.querySelectorAll('.vp-months span')).map((s) => s.textContent)).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
    expect(charts).toHaveTextContent('3 of 12 months have data')
    expect(charts.querySelector('.vp-month[title^="Aug"]')).toHaveAttribute('title', 'Aug · in RM 300,000.00 · out RM 0.00')
  })

  it('lists the pool ledger, each direction a chip', async () => {
    render(await VenturePoolPage())
    const ledger = section('Pool ledger')
    expect(within(ledger).getByText('5 ENTRIES · LATEST FIRST')).toBeInTheDocument()
    const topUp = within(ledger).getByText('Top-up to Dept Pool — IT').closest('tr') as HTMLElement
    expect(within(topUp).getByText('out').closest('.chip')).toHaveClass('info')
    expect(topUp).toHaveTextContent('Payment voucher')
    expect(topUp).toHaveTextContent('(20,000.00)')
    const interest = within(ledger).getByText('HB advance — Oct interest').closest('tr') as HTMLElement
    expect(within(interest).getByText('in').closest('.chip')).toHaveClass('ledger')
  })
})
