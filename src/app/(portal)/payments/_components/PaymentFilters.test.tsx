import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FinViewProvider } from '@/components/layout/fin-view'
import PaymentFilters from './PaymentFilters'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/payments',
  useSearchParams: () => new URLSearchParams(''),
}))

// 2026-10-10 — the handoff's search box says what it searches, in each side's
// words; the rest of the form is as it was (the handoff filters through the
// column ▽ alone — the form's future is the user's to say).
describe('PaymentFilters', () => {
  it('on the Finance view, searches "voucher #, payee, description" on Payments', () => {
    render(<FinViewProvider value={true}><PaymentFilters side="payments" /></FinViewProvider>)
    expect(screen.getByPlaceholderText('Search voucher #, payee, description…')).toBeInTheDocument()
  })

  it('…and "receipt #, from, description" on Receipt', () => {
    render(<FinViewProvider value={true}><PaymentFilters side="receipts" /></FinViewProvider>)
    expect(screen.getByPlaceholderText('Search receipt #, from, description…')).toBeInTheDocument()
  })

  it('keeps its words, and every field, elsewhere', () => {
    render(<PaymentFilters side="receipts" />)
    expect(screen.getByPlaceholderText('voucher #, description, payee…')).toBeInTheDocument()
    for (const label of ['Search', 'Type', 'Pool', 'From', 'To', 'Amount (RM)']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })
})
