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

  it('leaves the Product List in its own workspace', () => {
    expect(isSheetRoute('/revenue/products')).toBe(false)
  })

  it('leaves the rest of the portal as it is', () => {
    for (const path of ['/payments', '/approvals', '/reports/ledger', '/settings', '/hr-costingx', '/revenue-x', '/teams', '/dashboards']) {
      expect(isSheetRoute(path), path).toBe(false)
    }
  })

  it('answers no before a pathname is known', () => {
    expect(isSheetRoute(null)).toBe(false)
    expect(isSheetRoute(undefined)).toBe(false)
    expect(isSheetRoute('')).toBe(false)
  })
})
