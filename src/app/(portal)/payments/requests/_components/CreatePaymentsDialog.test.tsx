import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { parseRequest, type PaymentRequest } from '@/lib/payment-requests/model'

// Create payments (2026-10-29, PR ④): One PV a person ticked or not, what a block waits for, Save drafts against
// Submit together, and a voucher refused said while the rest are made.

const mocks = vi.hoisted(() => ({ createPv: vi.fn(), together: vi.fn(), openCreate: vi.fn(), flash: vi.fn() }))
vi.mock('../../actions', () => ({ createPaymentForRequests: mocks.createPv, submitPaymentsTogether: mocks.together }))
vi.mock('../../create-actions', () => ({ openCreatePayment: mocks.openCreate }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))

import CreatePaymentsDialog, { type CreatePaymentsStart } from './CreatePaymentsDialog'

const OPTIONS = {
  prefix: 'HV-PV-202610', today: '2026-10-29', companies: [], fundSources: [],
  banks: [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 100000 }],
  accounts: [{ code: '9087', name: 'Website & Software', type: 'expense' }],
  pools: [{ value: 'dept_pool_marketing', label: 'Marketing Dept Pool' }],
}
const req = (over: Record<string, unknown>): PaymentRequest =>
  parseRequest({
    id: 'r1', requestNo: 'PRQ-2610-0001', status: 'with_finance', kind: 'claim', mine: false, requesterName: 'KHO WEI JIE',
    departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing', payToSalary: true, payeeName: 'KHO WEI JIE',
    payeeBank: 'Hong Leong Bank', payeeAccount: '•••• 4821', description: 'Claude · Oct', total: 453.79, submittedAt: '2026-10-29T02:00:00Z',
    items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }], shares: [], files: [],
    ...over,
  }) as PaymentRequest
const KHO1 = req({})
const KHO2 = req({ id: 'r2', requestNo: 'PRQ-2610-0002', description: 'Jian Ying', total: 325.79, submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i2', description: 'Jian Ying', amount: 325.79 }] })
const SIA = req({
  id: 'r3', requestNo: 'PRQ-2610-0003', requesterName: 'SIA JOSIAH', payeeName: 'SIA JOSIAH', payeeBank: 'Maybank', payeeAccount: '•••• 3307',
  description: 'Notion', total: 324.91, items: [{ id: 'i3', description: 'Notion', amount: 324.91 }],
  shares: [{ id: 's1', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 108.3, billBack: null }],
})

const draw = async (start: CreatePaymentsStart) => {
  const handlers = { onClose: vi.fn(), onDone: vi.fn() }
  render(<CreatePaymentsDialog open start={start} prefix="HV-PV-202610" today="2026-10-29" {...handlers} />)
  await act(async () => undefined)
  return handlers
}
const win = () => screen.getByRole('dialog', { name: 'Create payments' })
const pick = (label: string, value: string) => fireEvent.change(within(win()).getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openCreate.mockResolvedValue({ ok: true, options: OPTIONS })
})

describe('Create payments', () => {
  it('One PV a person: a payee’s other open request goes in too; unticked, a PV a ticked request — the categories kept', async () => {
    await draw({ groups: [[KHO1, KHO2], [SIA]], ticked: ['r1', 'r3'], canBillBack: true })
    expect(win()).toHaveTextContent('3 requests → 2 payment vouchers · HV-PV-202610')
    expect(within(win()).getByRole('region', { name: 'PV 1 · KHO WEI JIE' })).toHaveTextContent('With PRQ-2610-0002 — the same payee’s other request with no PV yet.')
    pick('PV 1 line 1 category', '9087')
    fireEvent.click(within(win()).getByLabelText(/One PV a person/))
    expect(win()).toHaveTextContent('2 requests → 2 payment vouchers')
    expect(within(win()).queryByLabelText('PV 1 line 2 category')).toBeNull()
    expect((within(win()).getByLabelText('PV 1 line 1 category') as HTMLSelectElement).value).toBe('9087')
  })

  it('without Invoice · Create a split may only be answered No', async () => {
    await draw({ groups: [[SIA]], ticked: ['r3'], canBillBack: false })
    const ask = within(win()).getByRole('group', { name: 'Bill back Dream Crafter?' })
    expect(within(ask).getByRole('button', { name: 'Yes' })).toBeDisabled()
    expect(within(ask).getByRole('button', { name: 'No' })).toBeEnabled()
  })

  it('Save drafts makes each voucher and sends none; one refused is said and the rest are kept', async () => {
    mocks.createPv
      .mockResolvedValueOnce({ ok: false, reason: 'A request is no longer waiting for Finance — reload and try again.' })
      .mockResolvedValueOnce({ ok: true, id: 'pv-2', voucherNo: 'HV-PV-202610-0701', submitted: false, note: 'HV-PV-202610-0701 saved as draft. A receipt could not be carried over — add it on the voucher.' })
    const handlers = await draw({ groups: [[KHO1], [SIA]], ticked: ['r1', 'r3'], canBillBack: true })
    pick('PV 1 line 1 category', '9087')
    pick('PV 2 line 1 category', '9087')
    fireEvent.click(within(within(win()).getByRole('group', { name: 'Bill back Dream Crafter?' })).getByRole('button', { name: 'Yes' }))
    await act(async () => {
      fireEvent.click(within(win()).getByRole('button', { name: 'Save 2 drafts' }))
    })
    expect(mocks.createPv).toHaveBeenCalledTimes(2)
    expect((mocks.createPv.mock.calls[1][0] as FormData).get('payment_request_bill')).toBe(JSON.stringify([{ share: 's1', billBack: true, category: '9087' }]))
    expect(mocks.together).not.toHaveBeenCalled()
    expect(win()).toHaveTextContent('HV-PV-202610-0701 · SIA JOSIAH — saved as a draft. A receipt could not be carried over — add it on the voucher.')
    expect(win()).toHaveTextContent('KHO WEI JIE — not made: A request is no longer waiting for Finance — reload and try again.')
    fireEvent.click(within(win()).getByRole('button', { name: 'Done' }))
    expect(handlers.onDone).toHaveBeenCalled()
  })

  it('nothing made: the window stays as it was, the refusal said', async () => {
    mocks.createPv.mockResolvedValue({ ok: false, reason: 'Accounting period Oct 2026 is closed.' })
    const handlers = await draw({ groups: [[KHO1]], ticked: ['r1'], canBillBack: true })
    pick('PV 1 line 1 category', '9087')
    await act(async () => {
      fireEvent.click(within(win()).getByRole('button', { name: 'Submit 1 for approval' }))
    })
    expect(within(win()).getByRole('alert')).toHaveTextContent('KHO WEI JIE — not made: Accounting period Oct 2026 is closed.')
    expect(within(win()).getByRole('button', { name: 'Submit 1 for approval' })).toBeInTheDocument()
    expect(mocks.together).not.toHaveBeenCalled()
    expect(handlers.onDone).not.toHaveBeenCalled()
  })
})
