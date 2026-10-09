import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// 2026-10-09 — the voucher form per the user's Claude Design handoff (Phase 4
// of the Finance revamp): Date, Description and Segment on one row; the lines
// under a navy band, + Add line with its Ins key; a chip that says whether
// the entry balances; Post entry only once it does.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({ createJournalVoucher: vi.fn(), updateJournalVoucher: vi.fn(), deleteJournalVoucher: vi.fn() }))

import JournalVoucherForm from './JournalVoucherForm'

const ACCOUNTS = [
  { code: '1300', name: 'Interest receivable', type: 'asset' as const, parent_code: null, is_active: true },
  { code: '5027', name: 'Interest Income - Loans', type: 'revenue' as const, parent_code: null, is_active: true },
]

describe('the voucher form', () => {
  it('puts Date, Description and Segment on one row over the lines', () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    const head = document.querySelector('.jv-head') as HTMLElement
    expect(Array.from(head.querySelectorAll('.jv-field > span')).map((s) => s.textContent)).toEqual(['Date', 'Description', 'Segment'])
    expect(Array.from(document.querySelectorAll('.jv-row-head > span')).map((s) => s.textContent)).toEqual(['Account', 'Debit', 'Credit', 'Line note', ''])
    expect(screen.getByRole('button', { name: /\+ Add line/ })).toHaveTextContent('Ins')
  })

  it('says whether the entry balances, and posts only once it does', () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Debits must equal credits before posting')
    expect(screen.getByRole('button', { name: 'Post entry' })).toBeDisabled()

    const debits = screen.getAllByLabelText('Debit')
    const credits = screen.getAllByLabelText('Credit')
    fireEvent.change(debits[0], { target: { value: '100' } })
    expect(status).toHaveTextContent('Out of balance · 100.00')
    expect(status).toHaveClass('bad')
    expect(credits[0]).toBeDisabled()

    fireEvent.change(credits[1], { target: { value: '100' } })
    expect(status).toHaveTextContent('Balanced')
    expect(status).toHaveClass('ok')
    // Still no accounts and no description: nothing posts yet.
    expect(screen.getByRole('button', { name: 'Post entry' })).toBeDisabled()
  })
})
