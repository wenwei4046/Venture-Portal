import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FinViewProvider } from '@/components/layout/fin-view'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  amendRepayment: vi.fn(async () => ({ old: 1000, newAmount: 950 }) as { error?: string; old?: number; newAmount?: number }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('../../fund-out/actions', () => ({ amendRepayment: mocks.amendRepayment }))

import AmendRepaymentButton from './AmendRepaymentButton'

const props = { repaymentId: 'rep-1', currentAmount: 1000, label: 'Loan repayment · principal' }

beforeEach(() => vi.clearAllMocks())

// 2026-10-10 — the handoff: Receipt's row menu says "Change amount" on the
// Finance view, and so does the dialog it opens.
describe('AmendRepaymentButton', () => {
  it('on the Finance view, asks and answers in English', async () => {
    render(<FinViewProvider value={true}><AmendRepaymentButton {...props} /></FinViewProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Change amount' }))
    expect(screen.getByText('Change this repayment’s amount')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(screen.getByText('The amount has not changed')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '950' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(screen.getByText(/^Write a reason/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('e.g. interest keyed wrong'), { target: { value: 'typo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(await screen.findByText('Changed — 1000.00 → 950.00; GL and bank updated.')).toBeInTheDocument()
    expect(mocks.amendRepayment).toHaveBeenCalledTimes(1)
    expect(document.body.innerHTML).not.toMatch(/[㐀-鿿]/)
  })

  it('keeps its words elsewhere', () => {
    render(<AmendRepaymentButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '改金额' }))
    expect(screen.getByText('改这笔还款的金额')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认改' })).toBeInTheDocument()
  })
})
