import { describe, expect, it } from 'vitest'
import { PROD_LOGINS } from '@/lib/page-tabs.fixtures'
import { lensNav } from '@/lib/view-as'
import { userTabs } from '@/lib/page-tabs'
import { statementDepts } from '@/lib/dept-statements'
import { accountMenuActive, finAccountMenu, finNavSections, visibleAccountMenu } from './fin-nav'
import { activeHrNavKey, visibleHrNav } from './hr-nav'
import type { NavData, NavViewer } from './nav-config'

// Finance's sidebar (2026-10-14, the Finance revamp v2 — `Finance Desktop.dc.html`):
// Overview, then Daily · Fund · Report · Department in that order, Admin in the
// footer's account menu; Approvals and Claims only for whoever holds them
// (the user's call); no Overdue (its page is gone).

const login = (email: string, extra: Partial<NavViewer> = {}): NavViewer => {
  const f = PROD_LOGINS.find((l) => l.email === email)!
  return { id: email, role: f.role, permissions: f.keys, actions: f.actions, ...extra } as unknown as NavViewer
}
const finance = login('finance@venture.my')
const carrie = login('carrieong1218@gmail.com', { personalLogin: true })
const data: NavData = { revenueSubDepts: [], deptPoolDepts: statementDepts([]) }

const labels = (v: NavViewer) => visibleHrNav(finNavSections(data), v).map((s) => [s.roman, s.label, s.items.map((i) => i.label)])

describe("Finance's sidebar", () => {
  it('lists finance@’s rows in the design’s order, Claims last in Department', () => {
    expect(labels(finance)).toEqual([
      [null, null, ['Overview']],
      ['I.', 'Daily', ['Payments', 'Receipt', 'Invoice', 'Billing Allocator', 'Daily Bank', 'Reconciliation', 'Journal Entries']],
      ['II.', 'Fund', ['Fund IN', 'Fund OUT', 'Invoice Financing', 'Repayment', 'Statements']],
      ['III.', 'Report', ['General Ledger', 'P&L', 'Cash Flow', 'Receipt & Payment', 'Balance Sheet', 'Trial Balance', 'Debtor Aging', 'Loan Aging', 'Company Statement', 'Chart of Account', 'Base Rate History']],
      ['IV.', 'Department', ['Dept Pool', 'Venture', 'Marketing', 'Finance', 'HR', 'Director Office', 'Venture Pool', 'Claims']],
    ])
  })

  it('has no Overdue — its page went on 2026-10-14', () => {
    const all = finNavSections(data).flatMap((s) => s.items)
    expect(all.map((i) => i.label)).not.toContain('Overdue')
    expect(all.map((i) => i.href)).not.toContain('/overdue')
  })

  it('puts Approvals first in Daily for whoever may decide (the Principal’s Finance lens)', () => {
    const principal = login('principal@venture.my')
    const daily = visibleHrNav(finNavSections(data), principal).find((s) => s.label === 'Daily')!
    expect(daily.items[0].label).toBe('Approvals')
  })

  it('drops what the account cannot open, and the numerals count what is left (Carrie, Finance · Maker)', () => {
    const sections = visibleHrNav(finNavSections(data), carrie)
    expect(sections.map((s) => s.label)).toEqual([null, 'Daily', 'Fund', 'Department'])
    expect(sections.find((s) => s.label === 'Department')?.roman).toBe('III.')
    expect(sections.find((s) => s.label === 'Department')?.items.map((i) => i.label)).toEqual(['Venture Pool', 'Claims'])
  })

  it('lists the departments the registry hands in (IT, Revenue Department …)', () => {
    const more: NavData = {
      revenueSubDepts: [],
      deptPoolDepts: statementDepts([
        { id: 'it', name: 'IT', segmentKey: 'it', poolGlCode: '1100', billingModeKey: 'it_attribution', isInternal: false },
      ] as never),
    }
    const dept = visibleHrNav(finNavSections(more), finance).find((s) => s.label === 'Department')!
    expect(dept.items.map((i) => i.label)).toContain('IT')
  })

  it('follows the lens: the Principal on Finance’s view lists only Finance’s tabs', () => {
    const principal = login('principal@venture.my')
    const tabs = userTabs(null, principal.actions, principal.permissions as string[])
    const lens = lensNav({ ...principal, role: 'finance', actualRole: 'principal', tabs } as never) as NavViewer
    const rows = visibleHrNav(finNavSections(data), lens).flatMap((s) => s.items.map((i) => i.label))
    expect(rows).toContain('Payments')
    expect(rows).toContain('Chart of Account')
  })

  it.each([
    ['/dashboard', null, 'overview'],
    ['/payments', null, 'payments'],
    ['/payments/payroll-requests', null, 'payments'],
    ['/payments/new', null, 'payments'],
    ['/payments/new', 'mode=receipt', 'receipts'],
    ['/receipts', null, 'receipts'],
    ['/statements', null, 'invoices'],
    ['/invoices/abc', null, 'invoices'],
    ['/billing/requests', null, 'invoices'],
    ['/billing-allocator/abc', null, 'billing'],
    ['/reconciliation', null, 'recon'],
    ['/reconciliation/journal', null, 'recon'],
    ['/reconciliation/journal-entries/abc', null, 'journal'],
    ['/statements/monthly', 'period=2026-09', 'statements'],
    ['/statements/abc', null, 'statements'],
    ['/repayment-schedule', null, 'repayment'],
    ['/reports/income-statement', null, 'pnl'],
    ['/reports/monthly-cash-flow', null, 'cf'],
    ['/settings', 'tab=accounts', 'coa'],
    ['/settings', 'tab=departments', null],
    ['/dept-pool', null, 'dp'],
    ['/dept-pool/statements/marketing', 'view=pnl', 'dp-marketing'],
    ['/dept-pool/marketing', null, 'dp-marketing'],
    ['/venture-pool', null, 'venture-pool'],
    ['/admin/rooms', null, null],
  ])('%s?%s lights %s', (path, query, key) => {
    expect(activeHrNavKey(finNavSections(data), path, query ? new URLSearchParams(query) : null)).toBe(key)
  })
})

describe("Finance's account menu", () => {
  it('opens Account (a login of one’s own) and Admin for Carrie', () => {
    const groups = visibleAccountMenu(finAccountMenu(), carrie)
    expect(groups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ['Account', ['Edit profile', 'Change password']],
      ['Admin', ['Audit Log', 'Meeting Rooms']],
    ])
  })

  it('keeps Account away from a shared login (finance@) — Admin only, Departments with the chart', () => {
    const groups = visibleAccountMenu(finAccountMenu(), finance)
    expect(groups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([['Admin', ['Audit Log', 'Departments', 'Meeting Rooms']]])
  })

  it('keeps Account away while viewing as somebody', () => {
    const groups = visibleAccountMenu(finAccountMenu(), { ...carrie, viewingAs: { id: 'x', name: 'X' } })
    expect(groups.map((g) => g.title)).toEqual(['Admin'])
  })

  it('knows the page a row opens', () => {
    expect(accountMenuActive(finAccountMenu(), '/settings', new URLSearchParams('tab=departments'))).toBe('depts')
    expect(accountMenuActive(finAccountMenu(), '/audit-log/access', null)).toBe('audit')
    expect(accountMenuActive(finAccountMenu(), '/payments', null)).toBeNull()
  })
})
