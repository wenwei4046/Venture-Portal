import { describe, expect, it } from 'vitest'
import { buildNavEntries, emptyNavData, isGroup, type NavEntry, type NavViewer } from './nav-config'

// 2026-10-09 — the user's Claude Design handoff: "P&L defaults to Monthly
// P&L". Whoever reads the reports company-wide opens the month-by-month P&L
// from the sidebar; a department manager's P&L still opens their single
// month, as before.

function plFor(viewer: NavViewer): string[] {
  const reports = buildNavEntries(emptyNavData).find((e): e is Extract<NavEntry, { children: NavEntry[] }> => isGroup(e) && e.label === 'Reports')
  if (!reports) throw new Error('no Reports group')
  return reports.children.filter((c) => !isGroup(c) && c.label === 'P&L' && c.visible(viewer)).map((c) => (c as { href: string }).href)
}

describe('the sidebar P&L', () => {
  it('opens the Monthly P&L for whoever reads the reports company-wide', () => {
    expect(plFor({ role: 'finance', permissions: ['reports', 'dept_reports'] } as NavViewer)).toEqual(['/reports/monthly-pnl'])
  })
  it('opens the single month for a department manager', () => {
    expect(plFor({ role: 'dept_manager', permissions: ['dept_reports'] } as NavViewer)).toEqual(['/reports/income-statement'])
  })
})
