import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ContraOptions } from '@/lib/fund-contra'

// Fund contra (2026-11-04, mig 20261104230000): Fund OUT loans against Fund IN fund sources, each line a principal and
// an interest, the sides equal — sent to the Principal; the dialog says what still stops it.

const mocks = vi.hoisted(() => ({ open: vi.fn(), file: vi.fn() }))
vi.mock('@/app/(portal)/fund-out/contra-actions', () => ({ openFundContra: mocks.open, fileFundContra: mocks.file }))

import FundContraDialog from './FundContraDialog'

const OPTIONS: ContraOptions = {
  loans: [
    { id: 'L1', label: 'CAR [LO#1] · RM 200,000.00', outstanding: 145_000 },
    { id: 'L2', label: 'CAR [LO#2] · RM 100,000.00', outstanding: 91_666.67 },
  ],
  sources: [{ id: 'S1', label: 'HC · RM 220,000.00', outstanding: 220_000 }],
}

const draw = () => {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<FundContraDialog open onClose={onClose} onSaved={onSaved} today="2026-11-04" />)
  return { onSaved, onClose }
}
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.open.mockResolvedValue({ ok: true, options: OPTIONS })
  mocks.file.mockResolvedValue({ ok: true, message: 'Contra submitted — waiting for the Principal' })
})

describe('Fund contra', () => {
  it('two loans against one fund source, principal and interest, sent to the Principal', async () => {
    const { onSaved } = draw()
    await act(async () => undefined)
    set('loan 1', 'L1')
    set('loan 1 principal', '10,000')
    set('loan 1 interest', '1,200')
    fireEvent.click(screen.getByRole('button', { name: '+ Add loan' }))
    set('loan 2', 'L2')
    set('loan 2 principal', '5000')
    set('fund source 1', 'S1')
    set('fund source 1 principal', '15000')
    set('fund source 1 interest', '1200')
    expect(screen.getByText('Owes RM 145,000.00 in principal')).toBeInTheDocument()
    expect(screen.getByText('Ready — RM 16,200.00 each side, to the Principal for approval.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(mocks.file).toHaveBeenCalledWith({
      date: '2026-11-04',
      notes: '',
      lines: [
        { side: 'loan', id: 'L1', principal: 10_000, interest: 1200 },
        { side: 'loan', id: 'L2', principal: 5000, interest: 0 },
        { side: 'source', id: 'S1', principal: 15_000, interest: 1200 },
      ],
    })
    expect(onSaved).toHaveBeenCalledWith('Contra submitted — waiting for the Principal')
  })

  it('says why it cannot go — unequal sides — and sends nothing', async () => {
    draw()
    await act(async () => undefined)
    set('loan 1', 'L1')
    set('loan 1 principal', '100')
    set('fund source 1', 'S1')
    set('fund source 1 principal', '90')
    expect(screen.getByText('The two sides must be equal — Fund OUT RM 100.00, Fund IN RM 90.00')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('keeps the database’s refusal in the window', async () => {
    mocks.file.mockResolvedValue({ ok: false, reason: 'HC is already in a contra waiting for the Principal' })
    const { onSaved } = draw()
    await act(async () => undefined)
    set('loan 1', 'L1')
    set('loan 1 principal', '100')
    set('fund source 1', 'S1')
    set('fund source 1 principal', '100')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(screen.getByText('HC is already in a contra waiting for the Principal')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
