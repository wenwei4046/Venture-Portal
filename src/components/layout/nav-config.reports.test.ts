import { describe, expect, it } from 'vitest'
import { buildNavEntries, emptyNavData, isGroup, type NavEntry, type NavViewer } from './nav-config'

// 2026-10-09 — the user's Claude Design handoff: "P&L defaults to Monthly
// P&L". Whoever reads the reports company-wide opens the month-by-month P&L
// from the sidebar. (A department manager's single month went with the kind,
// 2026-10-17: Department reports alone opens no statement.)

function plFor(viewer: NavViewer): string[] {
  const reports = buildNavEntries(emptyNavData).find((e): e is Extract<NavEntry, { children: NavEntry[] }> => isGroup(e) && e.label === 'Reports')
  if (!reports) throw new Error('no Reports group')
  return reports.children.filter((c) => !isGroup(c) && c.label === 'P&L' && c.visible(viewer)).map((c) => (c as { href: string }).href)
}

describe('the sidebar P&L', () => {
  it('opens the Monthly P&L for whoever reads the reports company-wide', () => {
    expect(plFor({ role: 'finance', permissions: ['reports', 'dept_reports'] } as NavViewer)).toEqual(['/reports/monthly-pnl'])
  })
  it('opens nothing for Department reports alone', () => {
    expect(plFor({ role: 'staff', permissions: ['dept_reports'] } as NavViewer)).toEqual([])
  })

  it('lists Cash Flow, Receipt & Payment and Debtor Aging only beside the reports company-wide', () => {
    const reportsFor = (viewer: NavViewer) => {
      const group = buildNavEntries(emptyNavData).find((e): e is Extract<NavEntry, { children: NavEntry[] }> => isGroup(e) && e.label === 'Reports')
      if (!group?.visible(viewer)) return []
      return group.children.filter((c) => !isGroup(c) && c.visible(viewer)).map((c) => c.label)
    }
    expect(reportsFor({ role: 'staff', permissions: ['dept_reports'] } as NavViewer)).toEqual([])
    expect(reportsFor({ role: 'finance', permissions: ['reports', 'dept_reports'] } as NavViewer)).toEqual([
      'P&L', 'Cash Flow', 'Receipt & Payment', 'Balance Sheet', 'Trial Balance', 'Debtor Aging', 'Loan Aging', 'Company Statement',
    ])
  })
})
