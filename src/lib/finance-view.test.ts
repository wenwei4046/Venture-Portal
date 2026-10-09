import { describe, expect, it } from 'vitest'
import { financePageTitle, isFinanceDetailRoute, isFinanceView } from './finance-view'

// 2026-10-09 — the Finance revamp (the user's Claude Design handoff,
// `.design/finance-revamp`) applies to Finance's pages only (user: 只套 Finance
// 的页面): what Finance and the Principal see on those routes. HR's and a
// department manager's pages keep the sheet as it was, and a shared route
// (the Overview, Dept Pool, Reports, Settings) only counts for those two roles.

describe('isFinanceView', () => {
  it('is Finance’s pages, for Finance and the Principal', () => {
    for (const path of ['/payments', '/receipts/abc', '/statements', '/statements/monthly', '/billing-allocator', '/daily-bank', '/fund-in/x1', '/ba', '/overdue', '/repayment-schedule', '/venture-pool', '/reconciliation/journal-entries/new', '/approvals']) {
      expect(isFinanceView(path, 'finance'), path).toBe(true)
      expect(isFinanceView(path, 'principal'), path).toBe(true)
    }
  })

  it('counts a shared route only for those two roles', () => {
    expect(isFinanceView('/dashboard', 'finance')).toBe(true)
    expect(isFinanceView('/dashboard', 'hr')).toBe(false)
    expect(isFinanceView('/dept-pool/marketing', 'dept_manager')).toBe(false)
    expect(isFinanceView('/reports/monthly-pnl', 'dept_manager')).toBe(false)
    expect(isFinanceView('/settings', 'principal')).toBe(true)
  })

  it('leaves HR’s pages alone, whoever opens them', () => {
    for (const path of ['/hr-costing', '/director-salary', '/director-pool', '/revenue/fair', '/claims', '/team', '/opex', '/my-billing', '/audit-log']) {
      expect(isFinanceView(path, 'principal'), path).toBe(false)
      expect(isFinanceView(path, 'finance'), path).toBe(false)
    }
    expect(isFinanceView(null, 'finance')).toBe(false)
  })
})

describe('isFinanceDetailRoute', () => {
  it('is a row’s own page under a Finance list — what Back and an edge swipe return from', () => {
    for (const path of ['/payments/v1', '/receipts/v2', '/fund-in/f1', '/fund-out/l1', '/fund-out/l1/edit', '/statements/s1', '/statements/s1/print', '/approvals/a1', '/reconciliation/sess1', '/reconciliation/journal-entries/j1/edit', '/dept-pool/marketing', '/billing-allocator/t1']) {
      expect(isFinanceDetailRoute(path), path).toBe(true)
    }
  })

  it('is not a list, a form or a sub-page of its own', () => {
    for (const path of ['/payments', '/payments/new', '/payments/export', '/payments/voucher-doc', '/payments/payroll-requests', '/fund-in/new', '/statements/monthly', '/statements/export', '/reconciliation', '/reconciliation/journal', '/reconciliation/journal-entries', '/reconciliation/journal-entries/new', '/dept-pool', '/dept-pool/submissions', '/dept-pool/marketing/contracts', '/billing/invoice-doc', '/reports/ledger', '/daily-bank', '/billing-allocator']) {
      expect(isFinanceDetailRoute(path), path).toBe(false)
    }
  })
})

describe('financePageTitle', () => {
  it('names the page the way the sidebar does, a detail page by its list', () => {
    expect(financePageTitle('/dashboard')).toBe('Overview')
    expect(financePageTitle('/payments/v1')).toBe('Payments')
    expect(financePageTitle('/receipts')).toBe('Receipt')
    expect(financePageTitle('/statements')).toBe('Invoice')
    expect(financePageTitle('/statements/monthly')).toBe('Statements')
    expect(financePageTitle('/statements/s1')).toBe('Statements')
    expect(financePageTitle('/billing-allocator')).toBe('Billing Allocator')
    expect(financePageTitle('/ba')).toBe('Invoice Financing')
    expect(financePageTitle('/reports/ledger')).toBe('General Ledger')
    expect(financePageTitle('/reports/monthly-pnl')).toBe('Reports')
    expect(financePageTitle('/reconciliation/journal-entries/new')).toBe('Journal Entries')
    expect(financePageTitle('/reconciliation')).toBe('Reconciliation')
    expect(financePageTitle('/dept-pool/marketing')).toBe('Dept Pool')
    expect(financePageTitle('/somewhere-else')).toBe('')
  })
})
