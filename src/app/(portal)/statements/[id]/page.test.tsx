import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — a statement's page on the Finance view (the user's Claude
// Design handoff): the company as the title with its status chip, three cards
// (the net as the primary, the two subtotals), the invoice items and the
// contra items as two tables, the net summary, and the one action its status
// allows — Issue for a draft, Mark as paid once issued.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('../actions', () => ({ issueStatement: vi.fn(), markStatementPaid: vi.fn() }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

import StatementDetailPage from './page'

const STATEMENT = {
  id: 's1', company_id: 'co-car', period_month: '2026-09-01', status: 'draft', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9,
  created_at: '2026-10-01T02:00:00Z', issued_at: null as string | null,
}
const LINES = [
  { id: 'l1', statement_id: 's1', line_type: 'invoice', category_code: 'hr_pool', description: 'HR shared service · Sep', amount: 20000 },
  { id: 'l2', statement_id: 's1', line_type: 'invoice', category_code: 'rent', description: null, amount: 2507.9 },
  { id: 'l3', statement_id: 's1', line_type: 'contra', category_code: 'loan_interest', description: 'Savings interest · Sep', amount: 600 },
]

function database(statement = STATEMENT, lines = LINES) {
  const from = vi.fn((table: string) => {
    const single = async () => ({ data: table === 'monthly_statements' ? statement : { name: 'Carres', short_code: 'CAR' }, error: null })
    const result = { data: table === 'monthly_statement_lines' ? lines : [], error: null }
    const q = {
      select: () => q, eq: () => q, order: () => q, single,
      then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const page = () => StatementDetailPage({ params: Promise.resolve({ id: 's1' }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
})

describe('a statement on the sheet', () => {
  it('heads with the company, its status and the way back; three cards; two tables; the net summary', async () => {
    database()
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Statements' })).toHaveAttribute('href', '/statements/monthly')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carres')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('draft')
    expect(card('Net amount')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net amount')).toHaveTextContent('RM 21,907.90')
    expect(card('Net amount')).toHaveTextContent('Carres pays HV')
    expect(card('Subtotal invoice')).toHaveTextContent('RM 22,507.90')
    expect(card('Subtotal invoice')).toHaveTextContent('2 items')
    expect(card('Subtotal contra')).toHaveTextContent('RM (600.00)')
    const heads = Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)
    expect(heads).toEqual(['Invoice items', 'Contra items', 'Net summary', 'Actions'])
    const tables = Array.from(document.querySelectorAll('table'))
    expect(tables).toHaveLength(2)
    expect(within(tables[0]).getByText('HR Pool')).toBeInTheDocument()
    expect(within(tables[0]).getByText('HR shared service · Sep')).toBeInTheDocument()
    expect(tables[0].querySelector('tfoot')).toHaveTextContent('Subtotal invoice')
    expect(tables[0].querySelector('tfoot')).toHaveTextContent('RM 22,507.90')
    expect(within(tables[1]).getByText('Loan Interest')).toBeInTheDocument()
    expect(tables[1].querySelector('tfoot')).toHaveTextContent('RM (600.00)')
    const summary = screen.getByRole('region', { name: 'Net summary' })
    expect(summary).toHaveTextContent('Net payable')
    expect(summary).toHaveTextContent('RM 21,907.90')
    expect(screen.getByRole('button', { name: 'Issue to subsidiary' })).toBeInTheDocument()
  })

  it('once issued offers Mark as paid, and says when it was issued; paid, nothing', async () => {
    database({ ...STATEMENT, status: 'issued', issued_at: '2026-10-02T03:30:00Z' })
    const { unmount } = render(await page())
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeInTheDocument()
    expect(screen.getByText(/Issued 2 Oct 2026/)).toBeInTheDocument()
    expect(document.querySelector('.page-head .chip')).toHaveClass('alert')
    unmount()
    database({ ...STATEMENT, status: 'paid', net_amount: -1200, total_invoice: 0, total_contra: 1200 })
    render(await page())
    expect(screen.queryByRole('button', { name: /Mark as paid|Issue/ })).toBeNull()
    expect(card('Net amount')).toHaveTextContent('HV owes Carres')
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
  })
})
