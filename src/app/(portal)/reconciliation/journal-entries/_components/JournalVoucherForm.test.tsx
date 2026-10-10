import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// 2026-10-09 — the voucher form per the user's Claude Design handoff (Phase 4
// of the Finance revamp): Date, Description and Segment on one row; the lines
// under a navy band, + Add line with its Ins key; a chip that says whether
// the entry balances; Post entry only once it does.

const mocks = vi.hoisted(() => ({ createJournalVoucher: vi.fn(), updateJournalVoucher: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({
  createJournalVoucher: mocks.createJournalVoucher,
  updateJournalVoucher: mocks.updateJournalVoucher,
  deleteJournalVoucher: vi.fn(),
}))
// The real picker is a typeahead; a plain select is enough to pick an account here.
vi.mock('@/components/AccountPicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (code: string) => void }) => (
    <select aria-label="Account" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      <option value="1300">1300 Interest receivable</option>
      <option value="5027">5027 Interest Income - Loans</option>
    </select>
  ),
}))

import JournalVoucherForm from './JournalVoucherForm'

const ACCOUNTS = [
  { code: '1300', name: 'Interest receivable', type: 'asset' as const, parent_code: null, is_active: true },
  { code: '5027', name: 'Interest Income - Loans', type: 'revenue' as const, parent_code: null, is_active: true },
]

beforeEach(() => vi.clearAllMocks())

/** A balanced two-line entry: Dr 1300 / Cr 5027, 100.00 each. */
function fillBalancedEntry() {
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Interest accrual — Oct' } })
  const accounts = screen.getAllByLabelText('Account')
  fireEvent.change(accounts[0], { target: { value: '1300' } })
  fireEvent.change(accounts[1], { target: { value: '5027' } })
  fireEvent.change(screen.getAllByLabelText('Debit')[0], { target: { value: '100' } })
  fireEvent.change(screen.getAllByLabelText('Credit')[1], { target: { value: '100' } })
}

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

  // 2026-10-10 — the handoff: + New Entry puts the cursor in Description.
  it('opens with the cursor in Description', () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    expect(screen.getByLabelText('Description')).toHaveFocus()
  })

  // 2026-10-10 — the handoff: a leftover line nobody filled in does not hold
  // the entry back, and is not posted.
  it('leaves a completely empty line out of the check and out of what posts', async () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    fillBalancedEntry()
    fireEvent.click(screen.getByRole('button', { name: /\+ Add line/ }))
    expect(screen.getAllByLabelText('Debit')).toHaveLength(3)

    expect(screen.getByRole('button', { name: 'Post entry' })).toBeEnabled()
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.createJournalVoucher).toHaveBeenCalledTimes(1))
    expect(mocks.createJournalVoucher.mock.calls[0][0]).toMatchObject({
      description: 'Interest accrual — Oct',
      lines: [
        { account_code: '1300', debit: 100, credit: 0 },
        { account_code: '5027', debit: 0, credit: 100 },
      ],
    })
  })

  it('still holds Post back while a line is half filled in', () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    fillBalancedEntry()
    fireEvent.click(screen.getByRole('button', { name: /\+ Add line/ }))
    const post = screen.getByRole('button', { name: 'Post entry' })

    // An account with no amount.
    fireEvent.change(screen.getAllByLabelText('Account')[2], { target: { value: '1300' } })
    expect(post).toBeDisabled()
    fireEvent.change(screen.getAllByLabelText('Account')[2], { target: { value: '' } })
    expect(post).toBeEnabled()

    // A note with nothing else.
    fireEvent.change(screen.getAllByLabelText('Line description')[2], { target: { value: 'left over' } })
    expect(post).toBeDisabled()
  })

  it('needs two filled lines, whatever else is on the form', () => {
    render(<JournalVoucherForm accounts={ACCOUNTS} />)
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'One-sided' } })
    fireEvent.change(screen.getAllByLabelText('Account')[0], { target: { value: '1300' } })
    fireEvent.change(screen.getAllByLabelText('Debit')[0], { target: { value: '100' } })
    expect(screen.getByRole('button', { name: 'Post entry' })).toBeDisabled()
  })
})
