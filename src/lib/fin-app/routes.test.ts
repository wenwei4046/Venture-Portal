import { describe, expect, it } from 'vitest'
import { HUB_HREF, TAB_HUBS, appHref, hubOf, hubOfRow, tabHubs, tabOf } from './routes'

// The Finance phone app's addresses (2026-10-15): every sidebar row lands on a
// screen of the app — its hub, or a page of its own — and a tab shows the hubs
// whose rows this reader's sidebar shows, in the design's order.

describe('the Finance app’s addresses', () => {
  it('sends each hub row to its hub, the Overview home, and every other row to a page of its own', () => {
    expect(appHref('payments')).toBe('/fin-app/daily/payments')
    expect(appHref('receipts')).toBe('/fin-app/daily/receipts')
    expect(appHref('invoices')).toBe('/fin-app/daily/invoices')
    expect(appHref('billing')).toBe('/fin-app/daily/billing')
    expect(appHref('fund-out')).toBe('/fin-app/fund/out')
    expect(appHref('fund-in')).toBe('/fin-app/fund/in')
    expect(appHref('pnl')).toBe('/fin-app/report/pnl')
    // A department reader's single-month P&L is the P&L hub too.
    expect(appHref('pnl-month')).toBe('/fin-app/report/pnl')
    expect(appHref('overview')).toBe('/fin-app')
    expect(appHref('daily-bank')).toBe('/fin-app/page/daily-bank')
    expect(appHref('dp-revenue_department')).toBe('/fin-app/page/dp-revenue_department')
    expect(hubOfRow('ledger')).toBeNull()
  })

  it('keeps the design’s top tabs, in its order (the prototype’s GROUPS)', () => {
    expect(TAB_HUBS.daily).toEqual(['payments', 'receipts', 'invoices', 'billing'])
    expect(TAB_HUBS.fund).toEqual(['fund-out', 'fund-in'])
    expect(TAB_HUBS.report).toEqual(['pnl', 'cf', 'debtor', 'loan', 'bs'])
  })

  it('shows a tab only the hubs this reader’s sidebar shows', () => {
    const finance = new Set(['payments', 'receipts', 'invoices', 'billing', 'fund-out', 'fund-in', 'pnl', 'cf', 'debtor', 'loan', 'bs'])
    expect(tabHubs('daily', finance)).toEqual(['payments', 'receipts', 'invoices', 'billing'])
    // A reader without Billing: no Invoice, no Billing.
    expect(tabHubs('daily', new Set(['payments', 'receipts']))).toEqual(['payments', 'receipts'])
    // The department reader's P&L row opens the P&L hub.
    expect(tabHubs('report', new Set(['pnl-month', 'cf', 'debtor']))).toEqual(['pnl', 'cf', 'debtor'])
    expect(tabHubs('fund', new Set())).toEqual([])
  })

  it('knows the hub and the tab an address is on', () => {
    expect(hubOf('/fin-app/daily/payments')).toBe('payments')
    expect(hubOf(HUB_HREF['fund-in'])).toBe('fund-in')
    expect(hubOf('/fin-app')).toBeNull()
    expect(tabOf('/fin-app')).toBe('home')
    expect(tabOf('/fin-app/daily/receipts')).toBe('daily')
    expect(tabOf('/fin-app/fund/out')).toBe('fund')
    expect(tabOf('/fin-app/report/bs')).toBe('report')
    expect(tabOf('/fin-app/profile')).toBe('profile')
    expect(tabOf('/fin-app/page/daily-bank')).toBe('home')
  })
})
