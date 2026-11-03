import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentRequestRow } from './_lib/requests-model'

// The Finance sidebar's count on Payment request (2026-11-03, the user: "当有request时显示有多少个request可以吗？直到我开
// pv" → the soft count, sample B): the page's own "Waiting for you" — what still waits for Finance's voucher — for an
// account that can open the page. Nothing for one that cannot, and nothing when the read fails: the sidebar is never
// broken by it.

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }))
vi.mock('./_lib/requests-read', () => ({ readPaymentRequests: mocks.read }))

import { waitingRequestCount } from './waiting-count'

const finance = { id: 'fin', role: 'finance', permissions: ['treasury'], tabs: undefined }
const row = (key: string, stage: PaymentRequestRow['stage']) => ({ key, stage }) as PaymentRequestRow

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue(finance)
})

describe('the count on Payment request', () => {
  it('is what still waits for a voucher — the payroll still to fund, a claim or a request with no PV — as the page’s hero counts', async () => {
    mocks.read.mockResolvedValue({
      rows: [row('payroll:1', 'finance'), row('claim:2', 'finance'), row('request:3', 'principal'), row('statutory:4', 'hr'), row('request:5', 'finance')],
    })
    expect(await waitingRequestCount()).toBe(3)
    expect(mocks.read).toHaveBeenCalledWith(finance)
  })

  it('is nothing for an account that cannot open the page — signed out, no Treasury, or the page’s tab closed', async () => {
    mocks.getUser.mockResolvedValueOnce(null)
    expect(await waitingRequestCount()).toBeNull()
    mocks.getUser.mockResolvedValueOnce({ ...finance, permissions: ['hr_costing'] })
    expect(await waitingRequestCount()).toBeNull()
    mocks.getUser.mockResolvedValueOnce({ ...finance, tabs: [] })
    expect(await waitingRequestCount()).toBeNull()
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('is nothing when the read fails, so the sidebar shows no number rather than an error', async () => {
    mocks.read.mockRejectedValue(new Error('connection reset'))
    expect(await waitingRequestCount()).toBeNull()
  })
})
