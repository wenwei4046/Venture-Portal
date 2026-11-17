import { describe, expect, it } from 'vitest'
import { payslipHref, safeBack, withPaycheck } from './payroll-paycheck-url'

describe('withPaycheck', () => {
  it('puts the open paycheck on the payroll URL', () => {
    expect(withPaycheck('/hr-costing/payroll/2026-10-01', 'row-40')).toBe('/hr-costing/payroll/2026-10-01?paycheck=row-40')
  })
  it('keeps the other query and the hash, and replaces an older paycheck', () => {
    expect(withPaycheck('/hr-costing/payroll/2026-10-01?view=x&paycheck=old#top', 'new'))
      .toBe('/hr-costing/payroll/2026-10-01?view=x&paycheck=new#top')
  })
  it('takes it off when the paycheck closes', () => {
    expect(withPaycheck('/hr-costing/payroll/2026-10-01?paycheck=row-40', null)).toBe('/hr-costing/payroll/2026-10-01')
    expect(withPaycheck('/p?view=x&paycheck=a', null)).toBe('/p?view=x')
  })
})

describe('payslipHref', () => {
  it('carries the page it was opened from', () => {
    expect(payslipHref('2026-10-01', 'staff-1', '/hr-costing/payroll/2026-10-01?paycheck=row-40'))
      .toBe('/hr-costing/payroll/2026-10-01/staff-1/payslip?back=%2Fhr-costing%2Fpayroll%2F2026-10-01%3Fpaycheck%3Drow-40')
  })
})

describe('safeBack', () => {
  it('goes back to a path on this site', () => {
    expect(safeBack('/hr-costing/payroll/2026-10-01?paycheck=row-40', '..')).toBe('/hr-costing/payroll/2026-10-01?paycheck=row-40')
  })
  it('never to another host, and falls back without one', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeBack(bad, '..')).toBe('..')
    }
  })
})
