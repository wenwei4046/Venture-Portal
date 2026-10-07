import { describe, expect, it } from 'vitest'
import { moreTabLabel, tabsForRole } from './nav-config'

// 2026-10-07 (user, on the phone: "下面还是华语字体"): Finance's and the
// Principal's phone tab bar reads in English, like the pages it opens. HR's
// and a department manager's bar is as it was.
describe('the phone tab bar', () => {
  it('reads in English for Finance and the Principal', () => {
    expect(tabsForRole('finance').map((t) => t.label)).toEqual(['Overview', 'Payments', 'Receipts', 'Invoices'])
    expect(tabsForRole('principal').map((t) => t.label)).toEqual(['Overview', 'Approvals', 'Payments', 'Receipts'])
    expect(moreTabLabel('finance')).toBe('More')
    expect(moreTabLabel('principal')).toBe('More')
  })
  it('is untouched for HR and a department manager', () => {
    expect(tabsForRole('hr').map((t) => t.label)).toEqual(['总览', '薪资', '员工', '董事'])
    expect(tabsForRole('dept_manager')[0].label).toBe('总览')
    expect(moreTabLabel('hr')).toBe('更多')
  })
})
