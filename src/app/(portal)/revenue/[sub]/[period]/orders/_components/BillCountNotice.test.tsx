import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ includeOrder: vi.fn(), setNoComm: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../../run-actions', () => ({ includeOrder: mocks.includeOrder, setNoComm: mocks.setNoComm }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import BillCountNotice, { billOutcomeMessage } from './BillCountNotice'

beforeEach(() => vi.clearAllMocks())

const result = { orderNo: 'HC-SO-2611-044', changed: true }

describe('the notice Don’t count leaves, of either kind (2026-11-14)', () => {
  it('says a bill out of the month is out, and a bill paying nobody still counts', () => {
    expect(billOutcomeMessage({ orderId: 'o', orderNo: 'HC-SO-2611-044', excluded: true, result }, 'November 2026', false))
      .toBe('HC-SO-2611-044 no longer counts in November 2026.')
    expect(billOutcomeMessage({ orderId: 'o', orderNo: 'HC-SO-2611-044', excluded: true, noComm: true, result }, 'November 2026', true))
      .toBe('HC-SO-2611-044 pays no commission in November 2026 — no override and no KPI on it either. It still counts in sales and margin. Payroll follows when the salesperson is sent.')
    expect(billOutcomeMessage({ orderId: 'o', orderNo: 'HC-SO-2611-044', excluded: false, noComm: true, result }, 'November 2026', false))
      .toBe('HC-SO-2611-044 pays its commission again.')
  })

  it('Undo on a bill paying nobody pays it again — never counts an exclusion off', async () => {
    mocks.setNoComm.mockResolvedValue({ ok: true, result })
    const onChange = vi.fn()
    render(<BillCountNotice outcome={{ orderId: 'o', orderNo: 'HC-SO-2611-044', excluded: true, noComm: true, result }}
      monthLabel="November 2026" hasRun={false} className="n" buttonClassName="b" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(mocks.setNoComm).toHaveBeenCalledWith('o', false)
    expect(mocks.includeOrder).not.toHaveBeenCalled()
    expect(onChange.mock.calls[0][0]).toMatchObject({ excluded: false, noComm: true })
  })

  it('keeps a refusal on the line', async () => {
    mocks.setNoComm.mockResolvedValue({ ok: false, reason: 'SHAWN’s November 2026 is closed.' })
    const onChange = vi.fn()
    render(<BillCountNotice outcome={{ orderId: 'o', orderNo: 'HC-SO-2611-044', excluded: true, noComm: true, result }}
      monthLabel="November 2026" hasRun={false} className="n" buttonClassName="b" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText(/is closed/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
