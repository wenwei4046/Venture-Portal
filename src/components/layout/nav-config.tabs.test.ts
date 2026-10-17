import { describe, expect, it } from 'vitest'
import { moreTabLabel, tabsForRole } from './nav-config'

// 2026-10-07 (user, on the phone: "下面还是华语字体"): Finance's and the
// Principal's phone tab bar reads in English, like the pages it opens. HR's
// bar is as it was.
describe('the phone tab bar', () => {
  it('reads in English for Finance and the Principal', () => {
    expect(tabsForRole('finance').map((t) => t.label)).toEqual(['Overview', 'Payments', 'Receipts', 'Invoices'])
    expect(tabsForRole('principal').map((t) => t.label)).toEqual(['Overview', 'Approvals', 'Payments', 'Receipts'])
    expect(moreTabLabel('finance')).toBe('More')
    expect(moreTabLabel('principal')).toBe('More')
  })
  it('promises a templated account only its Overview', () => {
    expect(tabsForRole('staff').map((t) => t.label)).toEqual(['Overview'])
    expect(moreTabLabel('staff')).toBe('More')
  })
  // 2026-10-11 (one app, lib/one-app.ts): HR's view on a phone is the HR app; Payroll, People and Director
  // Salary are the computer's. The bar keeps only its Overview, for an HR account the HR app has nothing for.
  it('is gone for HR — its phone is the HR app', () => {
    expect(tabsForRole('hr').map((t) => t.label)).toEqual(['总览'])
    expect(moreTabLabel('hr')).toBe('更多')
  })
})
