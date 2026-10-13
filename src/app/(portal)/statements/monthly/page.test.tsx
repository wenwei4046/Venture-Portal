import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen } from '@testing-library/react'

// 2026-10-07 — the monthly Statements on the sheet (the approved Invoice /
// Statements sample): four cards, then the month's table.
// 2026-10-14 — ONE month at a time (user: 在上面能够选择月份。我不要它把全部
// 月份的 statement 都挤在一个 tab): the month picked at the head, the newest
// with statements when none is asked for.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', async (original) => ({
  ...(await original<typeof import('@/lib/office-time')>()),
  officeMonth: () => '2026-10',
}))
vi.mock('../_components/GenerateStatementsButton', () => ({
  default: (p: { month: string }) => (
    <button type="button" data-month={p.month}>
      Generate statements
    </button>
  ),
}))
vi.mock('../_components/StatementsMonth', () => ({
  default: (p: { month: string; marked: Record<string, string> }) => <span data-testid="month" data-month={p.month} data-marked={JSON.stringify(p.marked)} />,
}))
vi.mock('../_components/StatementsPeriodTable', () => ({
  default: (p: { rows: Array<{ companyCode: string; netAmount: number }>; canSetDefault?: boolean }) => (
    <pre data-testid="table" data-can-set-default={String(!!p.canSetDefault)}>{JSON.stringify(p.rows.map((r) => [r.companyCode, r.netAmount]))}</pre>
  ),
}))

import MonthlyStatementsPage from './page'
import { FinViewProvider } from '@/components/layout/fin-view'

const STATEMENTS = [
  { id: 's1', period_month: '2026-09-01', company_id: 'co-car', status: 'draft', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9, created_at: '2026-10-01' },
  { id: 's2', period_month: '2026-09-01', company_id: 'co-2990', status: 'draft', total_invoice: 0, total_contra: 4400, net_amount: -4400, created_at: '2026-10-01' },
  { id: 's3', period_month: '2026-05-01', company_id: 'co-car', status: 'issued', total_invoice: 31225.39, total_contra: 0, net_amount: 31225.39, created_at: '2026-06-01' },
  { id: 's4', period_month: '2026-05-01', company_id: 'co-2990', status: 'paid', total_invoice: 6000, total_contra: 4900, net_amount: 1100, created_at: '2026-06-01' },
]

function database(statements = STATEMENTS) {
  const from = vi.fn((table: string) => {
    const result = table === 'monthly_statements'
      ? { data: statements, error: null }
      : { data: [{ id: 'co-car', name: 'Carres', short_code: 'CAR' }, { id: 'co-2990', name: '2990', short_code: '2990' }], error: null }
    const q = {
      select: () => q, order: () => q, range: () => q,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const open = (period?: string) => MonthlyStatementsPage({ searchParams: Promise.resolve(period ? { period } : {}) })
const card = (name: string) => screen.getByRole('group', { name })
const heads = () =>
  Array.from(document.querySelectorAll('.sect-head')).map((h) => [
    h.querySelector('h2')?.textContent,
    h.querySelector('.count')?.textContent?.replace(/\s+/g, ' ').trim(),
  ])
const table = () => JSON.parse(screen.getByTestId('table').textContent ?? '[]')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'fm', role: 'finance', permissions: ['treasury'] }))
})

describe('the monthly Statements, one month at a time', () => {
  it('opens on the newest month that has statements — its table alone, not every month’s', async () => {
    database()
    render(await open())
    expect(screen.getByTestId('month')).toHaveAttribute('data-month', '2026-09')
    expect(heads()).toEqual([['September 2026', '2 STATEMENTS · ALL DRAFT']])
    expect(screen.getAllByTestId('table')).toHaveLength(1)
    expect(table()).toEqual([['CAR', 21907.9], ['2990', -4400]])
    expect(screen.getByTestId('table')).toHaveAttribute('data-can-set-default', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Statements')
  })

  it('shows the month asked for: its cards, its table, its Excel and PDF, and Generate opens on it', async () => {
    database()
    render(await open('2026-05'))
    expect(screen.getByTestId('month')).toHaveAttribute('data-month', '2026-05')
    expect(heads()).toEqual([['May 2026', '2 STATEMENTS · 1 ISSUED · 1 PAID']])
    expect(table()).toEqual([['CAR', 31225.39], ['2990', 1100]])
    expect(card('Statements · May')).toHaveTextContent('2')
    expect(card('Statements · May')).toHaveTextContent('1 issued · 1 paid')
    expect(card('Net · May')).toHaveTextContent('RM 32,325.39')
    expect(card('Net · May')).toHaveTextContent('invoice 37,225.39 − contra 4,900.00')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/statements/monthly/export?format=xlsx&period=2026-05')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/statements/monthly/export?format=pdf&period=2026-05')
    expect(screen.getByRole('button', { name: 'Generate statements' })).toHaveAttribute('data-month', '2026-05')
  })

  it('opens on four cards: the month’s count and net, then every month’s drafts and statements', async () => {
    database()
    render(await open())
    expect(card('Statements · September')).toHaveAttribute('data-tone', 'primary')
    expect(card('Statements · September')).toHaveTextContent('2')
    expect(card('Statements · September')).toHaveTextContent('all draft')
    expect(card('Net · September')).toHaveTextContent('RM 17,507.90')
    expect(card('Net · September')).toHaveTextContent('invoice 22,507.90 − contra 5,000.00')
    expect(card('Draft')).not.toHaveAttribute('data-tone')
    expect(card('Draft')).toHaveTextContent('2')
    expect(card('Draft')).toHaveTextContent('waiting to be issued')
    expect(card('Draft')).not.toHaveTextContent('months')
    expect(card('All statements')).toHaveTextContent('4')
    expect(card('All statements')).toHaveTextContent('1 issued · 1 paid')
  })

  it('says how many months a draft is left in, when it is more than one', async () => {
    database([...STATEMENTS, { ...STATEMENTS[0], id: 's5', period_month: '2026-04-01' }])
    render(await open())
    expect(card('Draft')).toHaveTextContent('3')
    expect(card('Draft')).toHaveTextContent('waiting to be issued · 2 months')
  })

  it('dots the months that have statements in the month grid, with how many', async () => {
    database()
    render(await open())
    expect(JSON.parse(screen.getByTestId('month').getAttribute('data-marked') ?? '{}')).toEqual({ '2026-09': '2 statements', '2026-05': '2 statements' })
  })

  it('a month with none says so, and offers the newest month that has some', async () => {
    database()
    render(await open('2026-08'))
    expect(screen.getByText('No statements for August 2026.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'September 2026 →' })).toHaveAttribute('href', '/statements/monthly?period=2026-09')
    expect(screen.queryByTestId('table')).toBeNull()
    expect(card('Statements · August')).toHaveTextContent('0')
    expect(card('Statements · August')).toHaveTextContent('None generated')
    expect(card('Net · August')).toHaveTextContent('RM 0.00')
    expect(card('All statements')).toHaveTextContent('4')
  })

  it('takes a month that is not one as no month at all', async () => {
    database()
    render(await open('2026-13'))
    expect(screen.getByTestId('month')).toHaveAttribute('data-month', '2026-09')
  })

  // 2026-10-10 — the handoff's head: Excel, PDF, then Generate statements, the
  // primary, last. On the Finance view only; a Director keeps the old order.
  // 2026-10-14 — the month comes first, on both.
  it('heads the month, then Excel, PDF, Generate statements on the Finance view', async () => {
    database()
    const page = await open()
    const { unmount } = render(<FinViewProvider value={true}>{page}</FinViewProvider>)
    const head = () => document.querySelector('.page-head') as HTMLElement
    const order = () => Array.from(head().querySelectorAll('[data-testid="month"], a, button')).map((el) => el.textContent?.trim() || el.getAttribute('data-testid'))
    expect(order()).toEqual(['month', 'Excel', 'PDF', 'Generate statements'])
    unmount()
    render(await open())
    expect(order()).toEqual(['month', 'Generate statements', 'Excel', 'PDF'])
  })

  it('says so when there is nothing yet, on this month', async () => {
    database([])
    render(await open())
    expect(screen.getByText('No statements yet.')).toBeInTheDocument()
    expect(screen.getByTestId('month')).toHaveAttribute('data-month', '2026-10')
    expect(card('Statements · October')).toHaveTextContent('None generated')
    expect(card('Draft')).toHaveTextContent('none waiting')
  })
})
