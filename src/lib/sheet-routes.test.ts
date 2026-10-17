import { describe, expect, it } from 'vitest'
import { isSheetRoute } from './sheet-routes'

describe('isSheetRoute', () => {
  it('puts every page HR reads on the sheet, detail routes included', () => {
    for (const path of [
      '/hr-costing',
      '/hr-costing/payroll',
      '/hr-costing/payroll/2026-09-01',
      '/hr-costing/payroll/2026-09-01/abc/payslip',
      '/hr-costing/payment',
      '/director-salary',
      '/director-salary/abc/print',
      '/director-pool',
      '/revenue',
      '/revenue/fair',
      '/revenue/fair/2026-09-01',
      '/revenue/fair/2026-09-01/orders',
      '/revenue/fair/hierarchy',
      '/revenue/fair/rules',
      '/revenue/fair/2026-09-01/open-bill',
      '/claims',
    ]) {
      expect(isSheetRoute(path), path).toBe(true)
    }
  })

  it('puts the rest of HR’s sidebar on the sheet: the Overview and People', () => {
    for (const path of [
      '/dashboard',
      '/team/people',
      '/team/people/new',
      '/team/people/import',
      '/team/people/invite',
      '/team/people/94982346-42aa-4ad7-b84c-c1a1ff858f38',
      '/team/people/94982346-42aa-4ad7-b84c-c1a1ff858f38/edit',
      '/team/accounts/abc',
      '/team/hierarchy',
      '/team/roles',
      '/team/permissions',
      '/member-admin',
    ]) {
      expect(isSheetRoute(path), path).toBe(true)
    }
  })

  // 2026-10-08: the Product List moved into the Revenue app; what is left at
  // its old address is a redirect, under Revenue like the rest.
  it('keeps the Revenue app — the Product List included — off the portal sheet', () => {
    expect(isSheetRoute('/member/products')).toBe(false)
    expect(isSheetRoute('/revenue/products')).toBe(true)
  })

  // 2026-10-07 (user: "finance 的整体 background 可以换成和 principal 和 hr 一样"
  // → "做 A 先"): Finance's pages — and OPEX — sit on the sheet as well, the
  // pages themselves unchanged for now.
  it('puts Finance’s pages on the sheet too, detail routes included', () => {
    for (const path of [
      '/approvals', '/approvals/abc', '/approvals/payroll-run/abc',
      '/payments', '/payments/new', '/payments/abc', '/payments/abc/edit', '/payments/payroll-requests',
      '/receipts', '/statements', '/statements/monthly', '/statements/abc',
      '/billing', '/billing/contracts/new', '/billing-allocator', '/invoice-pool',
      '/daily-bank', '/fund-in', '/fund-in/abc', '/fund-out', '/fund-out/abc', '/ba', '/repayment-schedule',
      '/dept-pool', '/dept-pool/marketing', '/venture-pool', '/opex',
      '/reports/ledger', '/reports/monthly-pnl', '/reports/company-statement',
      '/reconciliation', '/reconciliation/journal-entries', '/audit-log', '/settings',
    ]) {
      expect(isSheetRoute(path), path).toBe(true)
    }
  })

  it('does not mistake a lookalike prefix for a listed one', () => {
    for (const path of ['/hr-costingx', '/revenue-x', '/teams', '/dashboards', '/paymentsx', '/bax', '/report']) {
      expect(isSheetRoute(path), path).toBe(false)
    }
  })

  it('answers no before a pathname is known', () => {
    expect(isSheetRoute(null)).toBe(false)
    expect(isSheetRoute(undefined)).toBe(false)
    expect(isSheetRoute('')).toBe(false)
  })
})
