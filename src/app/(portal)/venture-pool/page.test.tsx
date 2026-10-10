import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — the Venture Pool per the user's Claude Design handoff (Phase 4
// of the Finance revamp): Export in the head; four cards (in / out this month,
// the net change, the running balance); "In vs Out" as a pie for the month
// (In #3F7A64, Out #E99A53) beside twelve months of bars; then the pool
// ledger, each line's direction a chip.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/venture-pool', useSearchParams: () => new URLSearchParams() }))
// The ledger's saved column layout comes from the browser client; here there is none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

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

function database(lines: Row[] = LINES) {
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      let rows: Row[] = table === 'journal_lines' ? [...lines] : table === 'bank_accounts' ? [{ gl_account_code: '1010', status: 'active' }] : []
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
    expect(within(ledger).getByText('5 ENTRIES')).toBeInTheDocument()
    const topUp = within(ledger).getByText('Top-up to Dept Pool — IT').closest('tr') as HTMLElement
    expect(within(topUp).getByText('out').closest('.chip')).toHaveClass('info')
    expect(topUp).toHaveTextContent('Payment voucher')
    expect(topUp).toHaveTextContent('(20,000.00)')
    const interest = within(ledger).getByText('HB advance — Oct interest').closest('tr') as HTMLElement
    expect(within(interest).getByText('in').closest('.chip')).toHaveClass('ledger')
  })
})

// 2026-10-10 — the handoff: the ledger filters by every column (▽, a Range
// on the date and the amount), its columns resize against their neighbour in
// a box that scrolls; money in reads black, money out red in brackets; the
// two chart panels stand 1 : 1.6.
describe('the Venture Pool, per the handoff', () => {
  it('filters the ledger by any column, the date and the amount by a range too', async () => {
    render(await VenturePoolPage())
    const ledger = section('Pool ledger')
    for (const name of ['Date', 'Type', 'Direction', 'Description', 'Amount']) {
      expect(within(ledger).getByRole('button', { name: `Filter ${name}` })).toBeInTheDocument()
    }
    fireEvent.click(within(ledger).getByRole('button', { name: 'Filter Date' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Date' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    expect(ledger.querySelector('.st-box table')).toBeInTheDocument()
  })

  it('reads money in black and money out red', async () => {
    render(await VenturePoolPage())
    const ledger = section('Pool ledger')
    const inn = within(ledger).getByText('4,126.50')
    expect(inn).not.toHaveClass('text-ledger')
    expect(inn).not.toHaveClass('text-danger')
    expect(within(ledger).getByText('(20,000.00)')).toHaveClass('text-danger')
  })

  it('stands the chart panels 1 : 1.6', async () => {
    render(await VenturePoolPage())
    expect(section('In vs Out').querySelector('.vp-charts')).toHaveClass('sch-vp-charts')
  })
})

// 2026-10-10 — the rest of the handoff (user: 做完他): the ledger lists every
// line, not the latest 50, and its search is the page's toolbar under the
// cards — over the charts — narrowing the ledger below.
describe('the Venture Pool ledger, whole and searched from the toolbar', () => {
  it('lists every line, not only the latest 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      line(`m${i}`, `2026-0${3 + Math.floor(i / 10)}-${String((i % 10) + 1).padStart(2, '0')}`, 100 + i, 0, `Line ${i + 1}`, 'repayment'),
    )
    database(many)
    render(await VenturePoolPage())
    const ledger = section('Pool ledger')
    expect(within(ledger).getByText('60 ENTRIES')).toBeInTheDocument()
    for (const n of [1, 30, 60]) expect(within(ledger).getByText(`Line ${n}`)).toBeInTheDocument()
    expect(ledger).not.toHaveTextContent('latest 50')
  })

  it('searches the ledger from a toolbar over the charts', async () => {
    render(await VenturePoolPage())
    const search = screen.getByRole('searchbox', { name: 'Search the pool ledger' })
    expect(search).toHaveAttribute('placeholder', 'Search description, type…')
    // Under the cards, over In vs Out; the ledger draws no box of its own.
    expect(search.compareDocumentPosition(section('In vs Out')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const ledger = section('Pool ledger')
    expect(within(ledger).queryByPlaceholderText('Search description, type…')).toBeNull()

    fireEvent.change(search, { target: { value: 'interest' } })
    expect(within(ledger).queryByText('Top-up to Dept Pool — IT')).toBeNull()
    for (const d of ['HC fund source — Sep interest', 'HB advance — Oct interest', 'HC term loan — Oct interest']) {
      expect(within(ledger).getByText(d)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(search).toHaveValue('')
    expect(within(ledger).getByText('Top-up to Dept Pool — IT')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })
})
