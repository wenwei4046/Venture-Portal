import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NewFundSourceForm from './NewFundSourceForm'

vi.mock('../actions', () => ({ createFundSource: vi.fn() }))

const companies = [
  { id: 'c1', name: 'Kingsley Sdn Bhd', short_code: 'KING', is_active: true, created_at: '', updated_at: '' },
]
const departments = [{ id: 'd1', name: 'Marketing' }]
const liabilityAccounts = [
  { code: '4055', name: 'Lim Wei Liang', type: 'liability' as const, parent_code: '4000', is_active: true },
]
const banks = [{ id: 'b1', bank_name: 'Maybank', account_number: '5140 1234 5678', is_primary: true }]

function setup() {
  return render(
    <NewFundSourceForm companies={companies} departments={departments} liabilityAccounts={liabilityAccounts} banks={banks} />,
  )
}

const byName = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement

describe('NewFundSourceForm (2026-09-22 shell)', () => {
  it('keeps every field createFundSource reads, under the same names', () => {
    setup()
    for (const n of [
      'source_type', 'from_id', 'effective_date', 'amount', 'cost_rate_percent', 'lock_in_months', 'repayment_date',
      'compound_interest', 'min_pay_interest', 'account_code', 'bank_account_id', 'notes',
    ]) expect(byName(n), n).not.toBeNull()
    expect(byName('source_type').value).toBe('subsidiary')
  })

  it("Liang's 60k @ 0.5% × 60 from 5 Oct 2026: 1,000 + 300, fully repaid 5 Sep 2031", () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Director Loan' }))
    expect(byName('source_type').value).toBe('director_loan')
    fireEvent.change(byName('from_freetext_name'), { target: { value: 'Lim Wei Liang' } })
    fireEvent.change(byName('amount'), { target: { value: '60000' } })
    fireEvent.change(byName('cost_rate_percent'), { target: { value: '0.5' } })
    fireEvent.change(byName('lock_in_months'), { target: { value: '60' } })
    fireEvent.change(byName('repayment_date'), { target: { value: '2026-10-05' } })
    expect(screen.getByText('借自 Lim Wei Liang')).toBeInTheDocument()
    expect(screen.getByText('RM 1,000.00')).toBeInTheDocument()
    expect(screen.getByText('RM 300.00')).toBeInTheDocument()
    expect(screen.getByText('RM 1,300.00')).toBeInTheDocument()
    expect(screen.getByText('RM 18,000.00')).toBeInTheDocument()
    expect(screen.getByText('5 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('5 Sep 2031 · 60 期')).toBeInTheDocument()
    // Blank BS account falls back to the umbrella payable in the GL line.
    expect(screen.getByText('4000 Fund Sources Payable')).toBeInTheDocument()
  })

  it('no period + no first date = 无固定期限; a period without a date says so', () => {
    setup()
    fireEvent.change(byName('amount'), { target: { value: '10000' } })
    expect(screen.getByText('无固定期限 · 只按月滚利息')).toBeInTheDocument()
    fireEvent.change(byName('lock_in_months'), { target: { value: '6' } })
    expect(screen.getByText('6 期 · 首期未定')).toBeInTheDocument()
  })

  it('Notes is folded away by default and Submit is enabled', () => {
    setup()
    expect(byName('notes').closest('details')!.open).toBe(false)
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled()
  })
})
