import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupDepartments, normaliseCycle, statutoryRows } from '@/lib/payment-cycle'
import StatutoryRows from './StatutoryRows'

describe('statutory outstanding balances', () => {
  it('does not let excess paid on SOCSO settle unpaid EIS', () => {
    const cycle = normaliseCycle({ period: '2026-08-01', people: [
      { row_id: 'a', name: 'A', dept_id: 'finance', dept_name: 'Finance', scope: 'staff', socso_er: 10, eis_er: 5 },
    ] })
    const rows = statutoryRows(cycle, groupDepartments(cycle.people))
    const socso = rows.find(row => row.scheme === 'SOCSO')!
    socso.paidAmount = 15
    socso.remainingAmount = 0
    render(<StatutoryRows rows={rows} today="2026-09-11" busy={null} staffFunded onGenerate={vi.fn()} onOpen={vi.fn()} />)
    const bodyRow = screen.getByRole('button', { name: /^PERKESO$/ }).closest('tr')!
    expect(within(bodyRow).queryByText('Paid', { exact: true })).not.toBeInTheDocument()
    const totalRow = screen.getByText('Total outstanding').closest('tr')!
    expect(within(totalRow).getByText('5.00')).toBeInTheDocument()
  })
})
