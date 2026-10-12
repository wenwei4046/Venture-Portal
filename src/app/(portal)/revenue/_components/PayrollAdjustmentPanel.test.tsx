import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PayrollAdjustmentPanel from './PayrollAdjustmentPanel'

const row = { staffId: 'employee', syncedAmount: 13000, adjustmentAmount: -500, reason: 'DN / dropped sales',
  grossCommission: 12500, status: 'draft', adjustedAt: null, sourceRunCount: 2 }
const names = new Map([['employee','Employee One']])
describe('Revenue payroll adjustment display', () => {
  it('shows the all-Revenue reconciliation and debit reason separately from a source statement', () => {
    render(<PayrollAdjustmentPanel read={{ rows: [row], unavailable: false }} periodLabel="September 2026" staffNames={names} statement />)
    const table = screen.getByRole('table', { name: 'Monthly gross commission reconciliation' })
    expect(within(table).getByRole('row', { name: /Synced commission/ })).toHaveTextContent('RM 13,000.00')
    expect(within(table).getByRole('row', { name: /Payroll adjustment/ })).toHaveTextContent('− RM 500.00')
    expect(within(table).getByRole('row', { name: /Final Gross/ })).toHaveTextContent('RM 12,500.00')
    expect(screen.getByText(/DN \/ dropped sales/)).toBeVisible()
    expect(screen.getByText(/2 synced sub-departments/)).toBeVisible()
  })
  it('shows additions and preserved adjustments for a reopened run without adding a department total', () => {
    render(<PayrollAdjustmentPanel read={{ rows: [{ ...row, adjustmentAmount: 200, grossCommission: 13200, reason: 'Correction' }], unavailable: false }} periodLabel="September 2026" staffNames={names} />)
    const table = screen.getByRole('table', { name: 'Monthly payroll adjustments by salesperson' })
    expect(table).toHaveTextContent('+ RM 200.00')
    expect(table).toHaveTextContent('RM 13,200.00')
    expect(table.querySelector('tfoot')).toBeNull()
  })
  // The section's lede went (2026-10-12): the table is the whole of it.
  it('says nothing under its heading but the figures', () => {
    render(<PayrollAdjustmentPanel read={{ rows: [row], unavailable: false }} periodLabel="September 2026" staffNames={names} />)
    expect(screen.queryByText(/across all Revenue sub-departments/)).toBeNull()
    expect(screen.queryByText(/last saved payroll/)).toBeNull()
  })
  it('does not silently present an unavailable payroll read as zero adjustment', () => {
    render(<PayrollAdjustmentPanel read={{ rows: [], unavailable: true }} periodLabel="September 2026" staffNames={names} />)
    expect(screen.getByRole('status')).toHaveTextContent('Payroll adjustments are currently unavailable')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
