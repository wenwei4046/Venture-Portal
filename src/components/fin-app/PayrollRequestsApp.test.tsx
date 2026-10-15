import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { RequestRow } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import { payrollRequestsModel } from '@/lib/fin-app/payroll-requests-model'

// Payments › Payroll Requests in the Finance phone app (2026-10-16, part E4):
// what is still to fund, a request's departments, *Fund* — the desktop's
// round in the kit's sheet (each department what it still owes by default, the
// desktop's checks) — and *Send back to HR* asked first.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), generate: vi.fn(), sendBack: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/payroll-requests',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/payments/payroll-requests/actions', () => ({ generatePvFromRequestInWords: mocks.generate, sendBackPayrollInWords: mocks.sendBack }))

import FinAppFrame from './FinAppFrame'
import PayrollRequestsApp from './PayrollRequestsApp'
import { resetNav } from './nav'

const HL = { id: 'b-hl', bank_name: 'Hong Leong Bank', current_balance: 50000, gl_account_code: '3000' }
const AL = { id: 'b-al', bank_name: 'Alliance Bank', current_balance: 310559.05, gl_account_code: '3010' }
const row = (over: Partial<RequestRow>): RequestRow => ({
  id: 'r-1', amount: 12000, status: 'submitted', requested_at: '2026-10-15T10:48:00Z', payroll_run_id: 'run-1', period_month: '2026-10-01',
  requested_by_name: 'HR Manager', isDirector: false, batchId: 'batch-1', batchLabel: 'Batch #4 · HR 3', ...over,
})
const MODEL = payrollRequestsModel({
  rows: [row({}), row({ id: 'r-2', amount: 261253.69, status: 'pv_generated', batchLabel: 'Batch #3 · Revenue Department 27' })],
  breakdown: {
    'r-1': [
      { pool_key: 'dept_pool_hr', dept_name: 'HR', required_amount: 8000, pool_balance: 9000 },
      { pool_key: 'dept_pool_finance', dept_name: 'Finance', required_amount: 4000, pool_balance: 1000 },
    ],
  },
  funding: { 'r-2': { committedTotal: 261253.69, committedByPool: {}, pvs: [{ id: 'pv-541', voucher_no: 'HV-PV-202610-0541', amount: 261253.69, status: 'pending_approval' }] } },
  statutory: [],
})

const draw = (search = '', can = { fund: true, sendBack: true }, banks = [HL, AL]) => {
  window.history.replaceState(null, '', `/fin-app/page/payroll-requests${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={[]}>
      <PayrollRequestsApp model={MODEL} banks={banks} today="2026-10-16" search={search} can={can} />
    </FinAppFrame>,
  )
}

beforeEach(() => resetNav())
afterEach(() => vi.clearAllMocks())

describe('Payroll Requests on the phone', () => {
  it('opens on what is still to fund and what awaits the Principal', () => {
    draw()
    expect(screen.getByText('To fund · 1 request')).toBeInTheDocument()
    expect(screen.getByText('1 awaiting the Principal')).toBeInTheDocument()
  })

  it('Fund: each department what it still owes, the desktop’s checks, then the voucher in the app', async () => {
    mocks.generate.mockResolvedValue({ ok: true, voucherId: 'pv-600' })
    draw('f=fund&id=r-1')
    fireEvent.click(screen.getByRole('button', { name: 'Fund' }))
    const sheet = await screen.findByRole('dialog', { name: /Fund October 2026/ })
    // From the first bank to the Alliance payroll account (GL 3010), as the desktop.
    expect(within(sheet).getByLabelText('From bank')).toHaveValue('b-hl')
    expect(within(sheet).getByLabelText('To bank')).toHaveValue('b-al')
    expect(within(sheet).getByLabelText('HR Department Pool · owes 8,000.00')).toHaveValue('8000.00')
    expect(within(sheet).getByText('This fully funds the payroll.')).toBeInTheDocument()
    // Finance's pool is short: it goes negative — a warning, not a block.
    expect(within(sheet).getByText(/Finance Department Pool will go negative/)).toBeInTheDocument()
    // More than a department owes is refused.
    fireEvent.change(within(sheet).getByLabelText('Finance Department Pool · owes 4,000.00'), { target: { value: '5000' } })
    expect(within(sheet).getByText(/Can’t fund more than a department still owes: Finance Department Pool/)).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Finance Department Pool · owes 4,000.00'), { target: { value: '1000' } })
    expect(within(sheet).getByText('After this: RM 3,000.00 still to fund — fund the rest later.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Generate PV' }))
    })
    expect(mocks.generate).toHaveBeenCalledWith('r-1', 'b-hl', 'b-al', [{ pool: 'dept_pool_hr', amount: 8000 }, { pool: 'dept_pool_finance', amount: 1000 }], '2026-10-16')
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=pv-600')
  })

  it('a round the source bank cannot cover is said, and not sent', async () => {
    draw('f=fund&id=r-1', { fund: true, sendBack: true }, [{ ...HL, current_balance: 5000 }, AL])
    fireEvent.click(screen.getByRole('button', { name: 'Fund' }))
    const sheet = await screen.findByRole('dialog', { name: /Fund October 2026/ })
    expect(within(sheet).getByText(/Hong Leong Bank holds RM 5,000.00 but this round moves RM 12,000.00 to Alliance Bank/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Generate PV' }))
    })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('Send back to HR asks first', async () => {
    mocks.sendBack.mockResolvedValue({ ok: true })
    draw('f=fund&id=r-1')
    fireEvent.click(screen.getByRole('button', { name: 'Send back to HR' }))
    const ask = await screen.findByRole('dialog', { name: 'Send October 2026 back to HR?' })
    expect(within(ask).getByText(/This cannot be undone/)).toBeInTheDocument()
    expect(mocks.sendBack).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Send back' }))
    })
    expect(mocks.sendBack).toHaveBeenCalledWith('batch-1', '2026-10-01')
    expect(mocks.flash).toHaveBeenCalledWith('October 2026 sent back to HR')
  })

  it('a fully funded request shows its voucher, which opens in the app', () => {
    draw('f=principal&id=r-2')
    expect(screen.queryByRole('button', { name: 'Fund' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /HV-PV-202610-0541/ }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=pv-541')
  })
})
