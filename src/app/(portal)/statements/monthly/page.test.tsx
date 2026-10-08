import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen } from '@testing-library/react'

// 2026-10-07 — the monthly Statements on the sheet (the approved Invoice /
// Statements sample): four cards, then each month as a section over its table.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('../_components/GenerateStatementsButton', () => ({ default: () => <button type="button">Generate statements</button> }))
vi.mock('../_components/StatementsPeriodTable', () => ({
  default: (p: { rows: Array<{ companyCode: string; netAmount: number }>; canSetDefault?: boolean }) => (
    <pre data-testid="table" data-can-set-default={String(!!p.canSetDefault)}>{JSON.stringify(p.rows.map((r) => [r.companyCode, r.netAmount]))}</pre>
  ),
}))

import MonthlyStatementsPage from './page'

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
      select: () => q, order: () => q,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'fm', role: 'finance', permissions: ['treasury'] }))
})

describe('the monthly Statements on the sheet', () => {
  it('opens on four cards: the latest month, its net, the drafts, and all', async () => {
    database()
    render(await MonthlyStatementsPage())
    expect(card('Latest period')).toHaveAttribute('data-tone', 'primary')
    expect(card('Latest period')).toHaveTextContent('September 2026')
    expect(card('Latest period')).toHaveTextContent('2 statements · all draft')
    expect(card('Net · September')).toHaveTextContent('RM 17,507.90')
    expect(card('Net · September')).toHaveTextContent('invoice 22,507.90 − contra 5,000.00')
    expect(card('Draft')).toHaveAttribute('data-tone', 'alert')
    expect(card('Draft')).toHaveTextContent('2')
    expect(card('All statements')).toHaveTextContent('4')
    expect(card('All statements')).toHaveTextContent('1 issued · 1 paid')
  })

  it('heads each month with how many and what state they are in, newest first, and lets Finance set the table’s default', async () => {
    database()
    render(await MonthlyStatementsPage())
    const heads = Array.from(document.querySelectorAll('.sect-head')).map((h) => [
      h.querySelector('h2')?.textContent,
      h.querySelector('.count')?.textContent?.replace(/\s+/g, ' ').trim(),
    ])
    expect(heads).toEqual([
      ['September 2026', '2 STATEMENTS · ALL DRAFT'],
      ['May 2026', '2 STATEMENTS · 1 ISSUED · 1 PAID'],
    ])
    const tables = screen.getAllByTestId('table')
    expect(JSON.parse(tables[0].textContent ?? '[]')).toEqual([['CAR', 21907.9], ['2990', -4400]])
    expect(tables[0]).toHaveAttribute('data-can-set-default', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Statements')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/statements/monthly/export?format=xlsx')
  })

  it('says so when there is nothing yet', async () => {
    database([])
    render(await MonthlyStatementsPage())
    expect(screen.getByText('No statements yet.')).toBeInTheDocument()
    expect(card('Latest period')).toHaveTextContent('—')
  })
})
