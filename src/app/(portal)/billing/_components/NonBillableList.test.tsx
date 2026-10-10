import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-10 — the handoff's Non-billable: a sortable sheet table, the type as
// a chip, the source in words ("Payment voucher"), "N TRANSACTIONS", and what
// left the Venture Pool in red brackets, totalled at the foot.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

import NonBillableList from './NonBillableList'

const TXNS = [
  { id: 't1', created_at: '2026-10-06T03:00:00Z', transaction_type: 'expense_out', amount: 2899.75, description: 'AI tools Sep26 claim', reference_table: 'payment_vouchers' },
  { id: 't2', created_at: '2026-10-03T03:00:00Z', transaction_type: 'expense_out', amount: 43.29, description: 'Meta Ads interest', reference_table: 'payment_vouchers' },
  { id: 't3', created_at: '2026-10-02T03:00:00Z', transaction_type: 'transfer_in', amount: 500, description: 'From Marketing pool', reference_table: 'dept_pools' },
]
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement

describe('Non-billable on the sheet', () => {
  it('counts the transactions and lists them with the type as a chip and the source in words', () => {
    render(<NonBillableList transactions={TXNS} period="2026-10-01" canAdd />)
    const head = screen.getByRole('heading', { name: 'Non-billable' }).closest('.sect-head') as HTMLElement
    expect(head.querySelector('.count')).toHaveTextContent('3 TRANSACTIONS · OCTOBER 2026')
    const heads = Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
    expect(heads).toEqual(['date', 'type', 'description', 'source', 'amount'])
    const ai = rowOf('AI tools Sep26 claim')
    expect(ai).toHaveTextContent('6 Oct 2026')
    expect(within(ai).getByText('expense out').closest('.chip')).toBeInTheDocument()
    expect(ai).toHaveTextContent('Payment voucher')
    expect(rowOf('From Marketing pool')).toHaveTextContent('Dept transfer')
    expect(screen.getByRole('button', { name: 'Filter Description' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Add non-billable expense' })).toHaveAttribute('href', '/payments/new?preset=non_billable')
  })

  it('shows what left the pool in red brackets and totals it at the foot', () => {
    render(<NonBillableList transactions={TXNS} period="2026-10-01" canAdd={false} />)
    const out = within(rowOf('AI tools Sep26 claim')).getByText('(2,899.75)')
    expect(out).toHaveClass('text-danger')
    expect(within(rowOf('From Marketing pool')).getByText('+500.00')).toHaveClass('text-ledger')
    const foot = document.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total deducted')
    expect(within(foot).getByText('(2,943.04)')).toHaveClass('text-danger')
    expect(screen.queryByRole('link', { name: '+ Add non-billable expense' })).toBeNull()
  })

  it('says so when the month has none', () => {
    render(<NonBillableList transactions={[]} period="2026-10-01" canAdd />)
    expect(screen.getByText('No Venture Pool transactions in Oct 2026.')).toBeInTheDocument()
  })
})
