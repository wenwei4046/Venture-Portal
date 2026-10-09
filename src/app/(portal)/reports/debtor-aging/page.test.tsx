import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Debtor Aging, Loan Aging and the Company Statement per the
// user's Claude Design handoff (Phase 4 of the Finance revamp): the date in
// the eyebrow, Excel / PDF in the head, cards, and the aging tables closing
// on a navy "All" row. A department manager's Debtor Aging stays as it was.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), fetchLoanMonitorData: vi.fn(), fetchCounterpartyStatement: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const rows: Record<string, unknown[]> = {
        invoices: [
          { id: 'i1', invoice_no: 'HV-INV-1', invoice_date: '2026-10-02', due_date: '2026-10-31', total_amount: 64000, description: null, company_id: 'c1', billable_to_department_id: null, billable_to_freetext_name: null },
          { id: 'i2', invoice_no: 'HV-INV-2', invoice_date: '2026-08-02', due_date: '2026-08-31', total_amount: 6000, description: null, company_id: 'c2', billable_to_department_id: null, billable_to_freetext_name: null },
        ],
        companies: [{ id: 'c1', name: 'HOUZS Century' }, { id: 'c2', name: 'HOUZS Design' }],
        departments: [],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
      q.range = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res)
      return q
    },
  }),
}))
vi.mock('@/lib/debtor-aging-data', () => ({ fetchPaidByInvoice: async () => new Map() }))
vi.mock('@/lib/loan-monitor', () => ({ fetchLoanMonitorData: mocks.fetchLoanMonitorData }))
vi.mock('@/lib/counterparty-statement-data', () => ({ fetchCounterpartyStatement: mocks.fetchCounterpartyStatement }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))

import DebtorAgingPage from './page'
import LoanAgingPage from '../loan-aging/page'
import CompanyStatementPage from '../company-statement/page'

const card = (name: string) => screen.getByRole('group', { name })
const buckets = (current: number, m1: number, m2: number, m3: number) => ({ current, m1, m2, m3, total: current + m1 + m2 + m3 })
const side = (due: number[], grand: number) => ({
  due: [{ key: 'd1', counterparty: 'HOUZS Kitchen', detail: '', buckets: buckets(due[0], due[1], due[2], due[3]) }],
  dueTotal: buckets(due[0], due[1], due[2], due[3]),
  scheduled: [], scheduledTotal: grand, noTerm: [], noTermTotal: 0, grandTotal: grand,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] }))
  mocks.fetchLoanMonitorData.mockResolvedValue({ currentYM: '2026-10', collect: side([4000, 2000, 0, 0], 250000), repay: side([1000, 0, 0, 0], 120000) })
  mocks.fetchCounterpartyStatement.mockResolvedValue({
    rows: [],
    totals: { collectPrincipal: 300000, collectInterest: 12000, repayPrincipal: 200000, repayInterest: 8000, net: 104000 },
  })
})

describe('Debtor Aging on the sheet', () => {
  it('shows the receivable in cards and closes on a navy All row', async () => {
    render(await DebtorAgingPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · DEBTOR AGING · AS AT 9 OCT 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/debtor-aging/export?format=xlsx&view=detail')
    expect(card('Total receivable')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total receivable')).toHaveTextContent('RM 70,000.00')
    expect(card('Total receivable')).toHaveTextContent('2 companies')
    expect(card('Current')).toHaveTextContent('RM 64,000.00')
    expect(card('Over 1 month')).toHaveTextContent('RM 6,000.00')
    const all = document.querySelector('tr.rpt-all') as HTMLElement
    expect(all).toHaveTextContent('All companies')
    expect(all).toHaveTextContent('70,000.00')
  })

  it('stays as it was for a department manager', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_reports'] }))
    render(await DebtorAgingPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · DEBTOR AGING')
    expect(document.querySelector('tr.rpt-all')).toBeNull()
  })
})

describe('Loan Aging on the sheet', () => {
  it('shows both sides in cards and closes each aging on a navy All row', async () => {
    render(await LoanAgingPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · LOAN AGING · OCTOBER 2026')
    expect(card('To collect · outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('To collect · outstanding')).toHaveTextContent('RM 250,000.00')
    expect(card('Due this month')).toHaveTextContent('RM 4,000.00')
    expect(card('Late · to collect')).toHaveTextContent('RM 2,000.00')
    expect(card('To repay · outstanding')).toHaveTextContent('RM 120,000.00')
    const alls = Array.from(document.querySelectorAll('tr.rpt-all')).map((r) => r.textContent)
    expect(alls[0]).toContain('All borrowers')
    expect(alls[1]).toContain('All lenders')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/loan-aging/export?format=xlsx&view=aging')
  })
})

describe('the Company Statement on the sheet', () => {
  it('shows what is to collect, to repay and the net', async () => {
    render(await CompanyStatementPage())
    expect(card('To collect')).toHaveTextContent('RM 312,000.00')
    expect(card('To collect')).toHaveTextContent('Principal 300,000.00 · Interest 12,000.00')
    expect(card('To repay')).toHaveTextContent('RM 208,000.00')
    expect(card('Net')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net')).toHaveTextContent('Collect RM 104,000.00')
    expect(within(document.querySelector('.page-head') as HTMLElement).getByRole('link', { name: 'Export Excel' })).toHaveAttribute('href', '/reports/company-statement/export?format=xlsx')
  })
})
