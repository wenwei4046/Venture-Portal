import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ClaimQueueRow } from '@/lib/claim-requests'
import type { DeptRequestRow } from '@/app/(portal)/payments/dept-requests/_lib/dept-read'
import { claimRequestsModel, deptRequestsModel } from '@/lib/fin-app/requests-model'

// Payments' request queues in the Finance phone app (2026-10-16, part E4): a
// request's own screen, *Raise voucher* / *Generate PV* in the kit's sheet
// (the bank, how), a Dept request's *Cancel request* asked first, a raised
// voucher opened in the app — each the page's own action, answered in words.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), raise: vi.fn(), generate: vi.fn(), cancel: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/claim-requests',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/payments/claim-requests/actions', () => ({ raiseClaimVoucher: mocks.raise }))
vi.mock('@/app/(portal)/payments/dept-requests/actions', () => ({ generateDeptRequestPvInWords: mocks.generate, cancelDeptRequestInWords: mocks.cancel }))

import FinAppFrame from './FinAppFrame'
import RequestsApp from './RequestsApp'
import { resetNav } from './nav'

const BANK = '11111111-2222-4333-8444-555555555555'
const BANKS = [{ id: BANK, bank_name: 'Hong Leong Bank', current_balance: 111196.95 }]
const claim = (over: Partial<ClaimQueueRow>): ClaimQueueRow => ({
  claimId: 'c-1', claimType: 'benefit', claimantName: 'Kar Jun', department: 'Revenue', amount: 320, description: 'Fair travel',
  sourcePool: null, requestNo: 'RQ-0012', approvedByName: 'Grace Lim', approvedAt: '2026-10-14T03:00:00Z', voucherId: null, voucherNo: null, voucherStatus: null, ...over,
})
const CLAIMS = [claim({}), claim({ claimId: 'c-2', claimantName: 'Esther', amount: 80, voucherId: 'pv-9', voucherNo: 'HV-PV-202610-0490', voucherStatus: 'pending_approval' })]
const DEPT: DeptRequestRow[] = [
  { id: 'd-1', amount: 1200, payee: 'Grab Ads', description: 'October ads', status: 'pending_finance_pv', requestedAt: '2026-10-15T02:00:00Z', pvId: null, department: 'Marketing', requestedBy: 'Mei', voucherNo: null },
]

const draw = (kind: 'claim' | 'dept', search = '', can = { raise: true, cancel: true }) => {
  window.history.replaceState(null, '', `/fin-app/page/${kind}-requests${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={[]}>
      <RequestsApp kind={kind} model={kind === 'claim' ? claimRequestsModel(CLAIMS) : deptRequestsModel(DEPT)} banks={BANKS} search={search} can={can} />
    </FinAppFrame>,
  )
}

beforeEach(() => resetNav())
afterEach(() => vi.clearAllMocks())

describe('the request queues on the phone', () => {
  it('opens on what waits for a voucher and what is with the Principal', () => {
    draw('claim')
    expect(screen.getByText('Waiting for a voucher · 1 claim')).toBeInTheDocument()
    expect(screen.getByText('1 with the Principal')).toBeInTheDocument()
  })

  it('Raise voucher asks the bank and how, then answers in words', async () => {
    mocks.raise.mockResolvedValueOnce({ ok: false, reason: 'Choose the bank account to pay from.' }).mockResolvedValueOnce({ ok: true })
    draw('claim', 'f=waiting&id=c-1')
    expect(screen.getByText('RQ-0012')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Raise voucher' }))
    const sheet = await screen.findByRole('dialog', { name: /Raise voucher · Kar Jun/ })
    fireEvent.change(within(sheet).getByLabelText('Pay from'), { target: { value: BANK } })
    fireEvent.change(within(sheet).getByLabelText('Method'), { target: { value: 'cheque' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Raise voucher' }))
    })
    expect(mocks.raise).toHaveBeenCalledWith({ claimId: 'c-1', bankId: BANK, method: 'cheque' })
    expect(within(sheet).getByText('Choose the bank account to pay from.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Raise voucher' }))
    })
    expect(mocks.flash).toHaveBeenCalledWith('Voucher raised — with the Principal')
  })

  it('a claim with the Principal opens its voucher in the app', () => {
    draw('claim', 'f=principal&id=c-2')
    fireEvent.click(screen.getByRole('button', { name: 'Open voucher' }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=pv-9')
  })

  it('a Dept request generates its PV, and its cancel asks first', async () => {
    mocks.generate.mockResolvedValue({ ok: true })
    mocks.cancel.mockResolvedValue({ ok: true })
    draw('dept', 'f=waiting&id=d-1')
    expect(screen.getByText('Pool already debited')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    const ask = await screen.findByRole('dialog', { name: 'Cancel Marketing → Grab Ads?' })
    expect(within(ask).getByText(/This cannot be undone/)).toBeInTheDocument()
    expect(mocks.cancel).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel request' }))
    })
    expect(mocks.cancel).toHaveBeenCalledWith('d-1', 'Cancelled by Finance from the phone app')
    expect(mocks.flash).toHaveBeenCalledWith('Request cancelled — the pool is refunded')
  })

  it('without Treasury · Create or Void there is no step', () => {
    draw('dept', 'f=waiting&id=d-1', { raise: false, cancel: false })
    expect(screen.queryByRole('button', { name: 'Generate PV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull()
  })
})
