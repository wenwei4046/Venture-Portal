import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PaymentTabs from './PaymentTabs'

// 2026-10-09 — the Finance revamp: Payments has a Payroll batches tab beside
// the status tabs, counted by its batches; Receipts, with no payroll, has not.

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/payments',
  useSearchParams: () => new URLSearchParams(''),
}))

describe('PaymentTabs', () => {
  it('adds Payroll batches when the ledger counts batches, and opens it by ?status=payroll', () => {
    render(<PaymentTabs counts={{ all: 5, paid: 4, payroll: 2 }} />)
    const tab = screen.getByRole('button', { name: /Payroll batches/ })
    expect(tab.querySelector('[data-tab-count]')).toHaveTextContent('2')
    fireEvent.click(tab)
    expect(push).toHaveBeenCalledWith('/payments?status=payroll')
  })

  it('has no such tab without a count for it', () => {
    render(<PaymentTabs counts={{ all: 5, paid: 4 }} />)
    expect(screen.queryByRole('button', { name: /Payroll batches/ })).toBeNull()
  })
})
