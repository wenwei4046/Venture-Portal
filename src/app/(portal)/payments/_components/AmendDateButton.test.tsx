import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

type Result = { error?: string; old?: string; newDate?: string }
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  amendVoucherDate: vi.fn(async (_fd: FormData): Promise<Result> => ({ old: '2026-10-01', newDate: '2026-09-30' })),
  amendRepaymentDate: vi.fn(async (_fd: FormData): Promise<Result> => ({ old: '2026-10-01', newDate: '2026-09-30' })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({ amendVoucherDate: mocks.amendVoucherDate }))
vi.mock('../../fund-out/actions', () => ({ amendRepaymentDate: mocks.amendRepaymentDate }))
// "Today" is fixed, so "not in the future" is a statement about a known day.
vi.mock('@/lib/office-clock', () => ({ officeDate: () => '2026-10-02' }))

import AmendDateButton from './AmendDateButton'

const receipt = { kind: 'voucher' as const, id: 'v-455', currentDate: '2026-10-01', label: 'HV-OR-202610-0455' }
const dateBox = () => screen.getByLabelText(/对的日期/) as HTMLInputElement
const reasonBox = () => screen.getByLabelText(/原因/) as HTMLInputElement
const confirm = () => fireEvent.click(screen.getByRole('button', { name: '确认改' }))

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "这个日期我录错了怎么办？能自己改吗？").
describe('AmendDateButton', () => {
  it('opens on its own button, on the date as it is recorded', () => {
    render(<AmendDateButton {...receipt} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '改日期' }))
    expect(screen.getByRole('dialog', { name: '改日期' })).toHaveTextContent('改日期 — HV-OR-202610-0455')
    expect(screen.getByText('1 Oct 2026')).toBeVisible()
    expect(dateBox().value).toBe('2026-10-01')
    expect(dateBox().max).toBe('2026-10-02') // the calendar will not offer tomorrow
  })

  it('opened from a row menu, it starts open and draws no button of its own', () => {
    render(<AmendDateButton {...receipt} autoOpen hideTrigger />)
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.queryByRole('button', { name: '改日期' })).toBeNull()
  })

  it('asks for a different date, not a future one, and a reason — before anything is sent', () => {
    render(<AmendDateButton {...receipt} autoOpen hideTrigger />)
    confirm()
    expect(screen.getByRole('alert')).toHaveTextContent('日期没有变')

    fireEvent.change(dateBox(), { target: { value: '2026-10-03' } })
    confirm()
    expect(screen.getByRole('alert')).toHaveTextContent('不能填未来的日期')

    fireEvent.change(dateBox(), { target: { value: '2026-09-30' } })
    confirm()
    expect(screen.getByRole('alert')).toHaveTextContent('写一句原因')
    expect(mocks.amendVoucherDate).not.toHaveBeenCalled()
  })

  it('re-dates a voucher through the voucher action, and says what changed', async () => {
    render(<AmendDateButton {...receipt} autoOpen hideTrigger />)
    fireEvent.change(dateBox(), { target: { value: '2026-09-30' } })
    fireEvent.change(reasonBox(), { target: { value: '  录错一天 ' } })
    confirm()
    await waitFor(() => expect(mocks.amendVoucherDate).toHaveBeenCalledTimes(1))
    const fd = mocks.amendVoucherDate.mock.calls[0]![0]
    expect([fd.get('id'), fd.get('new_date'), fd.get('reason')]).toEqual(['v-455', '2026-09-30', '录错一天'])
    expect(mocks.amendRepaymentDate).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('1 Oct 2026 → 30 Sep 2026')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    // Done: nothing more to confirm, only to close.
    expect(screen.queryByRole('button', { name: '确认改' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('re-dates a loan repayment through the loan action', async () => {
    render(<AmendDateButton kind="repayment" id="rep-1" currentDate="2026-10-01" label="Loan repayment · principal · The Cont" autoOpen hideTrigger />)
    fireEvent.change(dateBox(), { target: { value: '2026-10-02' } })
    fireEvent.change(reasonBox(), { target: { value: 'wrong day' } })
    confirm()
    await waitFor(() => expect(mocks.amendRepaymentDate).toHaveBeenCalledTimes(1))
    expect(mocks.amendRepaymentDate.mock.calls[0]![0].get('id')).toBe('rep-1')
    expect(mocks.amendVoucherDate).not.toHaveBeenCalled()
  })

  it('shows what the database refused, and stays open', async () => {
    mocks.amendVoucherDate.mockResolvedValueOnce({ error: 'Sep 2026 is closed (period lock) — reopen it first' })
    render(<AmendDateButton {...receipt} autoOpen hideTrigger />)
    fireEvent.change(dateBox(), { target: { value: '2026-09-30' } })
    fireEvent.change(reasonBox(), { target: { value: 'x' } })
    confirm()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sep 2026 is closed')
    expect(screen.getByRole('button', { name: '确认改' })).toBeEnabled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
