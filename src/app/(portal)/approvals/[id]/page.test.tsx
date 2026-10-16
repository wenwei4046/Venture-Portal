import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  notFound: vi.fn(),
  getVoucherDetailContext: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  flash: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/voucher-detail', async (original) => ({
  ...(await original<typeof import('@/lib/voucher-detail')>()),
  getVoucherDetailContext: mocks.getVoucherDetailContext,
}))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('../actions', () => ({ approveRequestsBulk: mocks.approve, rejectRequestsBulk: mocks.reject, approveRequestGroupPartial: vi.fn() }))
// The list's own behaviour (previews, Download) is AttachmentList.test.tsx's; here, what the page hands it.
vi.mock('@/components/voucher/AttachmentList', () => ({
  default: ({ attachments, canDelete }: { attachments: Array<{ id: string; file_name: string }>; canDelete?: boolean }) => (
    <ul data-testid="attachments" data-can-delete={String(!!canDelete)}>
      {attachments.map((a) => (
        <li key={a.id}>{a.file_name}</li>
      ))}
    </ul>
  ),
}))

import ApprovalDetailPage from './page'

// A request's own page, drawn as Finance's records are (2026-10-17 — D06): the number, its status and facts, the
// numbered cards, the dark panel with Approve · Reject. Who may open it is the request's read's, as before.

const TITLE = 'HV-PV-202610-0451: Aina binti Example — RM 3,200.50'

function database(referenceType: string | null, over: { status?: string; notes?: string | null; approved_at?: string | null; group_id?: string | null; balance?: number } = {}) {
  const approval = {
    id: 'appr', request_type: 'payment_voucher', reference_id: 'voucher', reference_table: 'payment_vouchers',
    submitted_by: 'hr-user', description: TITLE, amount: 3200.5, status: over.status ?? 'pending',
    created_at: '2026-10-02T04:47:41+00:00', approved_at: over.approved_at ?? null, approved_by: null, notes: over.notes ?? null, group_id: over.group_id ?? null,
  }
  const from = vi.fn((table: string) => {
    const q = {
      select: () => q, eq: () => q,
      single: async () => ({ data: table === 'approval_requests' ? approval : { name: 'HR' }, error: null }),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  mocks.getVoucherDetailContext.mockResolvedValue({
    voucher: {
      id: 'voucher', voucher_no: 'HV-PV-202610-0451', voucher_type: 'other', status: 'pending_approval', direction: 'debit',
      amount: 3200.5, currency: 'MYR', payee_name: 'Aina binti Example', payee_company_id: null, bank_account_id: 'bank',
      reference_type: referenceType, reference_id: null, description: 'Payroll disbursement Sep 2026 — Aina binti Example', notes: null,
      payment_method: 'bank_transfer', payment_date: '2026-10-05', source_pool: null, target_pool: null, approved_at: null,
      executed_at: null, created_at: '2026-10-02T04:47:41+00:00', updated_at: '2026-10-02T04:47:41+00:00', created_by: 'hr-user',
      approved_by: null, payment_reference: null,
    },
    sources: [
      { pool: 'venture_pool', amount: 3000, account_code: '6100', account_label: 'Salaries' },
      { pool: 'venture_pool', amount: 200.5, account_code: '6110', account_label: 'Allowances' },
    ],
    attachments: [{ id: 'f1', file_name: 'payslip.pdf', file_type: 'application/pdf', file_size: 2048, storage_path: 'x', description: null, uploaded_at: '2026-10-02', uploaded_by: 'hr-user' }],
    bank: { id: 'bank', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: over.balance ?? 90000 },
    payeeCompany: null, createdByName: 'HR', approvedByName: null, categoryLabel: null,
  })
  return { from }
}

const PRINCIPAL = () => withActions({ id: 'principal', role: 'principal', permissions: ['approvals', 'treasury', 'payroll_payouts', 'hr_costing'] })
const open = async () => render(await ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
  mocks.approve.mockResolvedValue({ approved: 1, failed: [] })
  mocks.reject.mockResolvedValue({ rejected: 1, failed: [] })
})

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout"): the request
// for a salary voucher is titled with who is paid what.
describe('the approval of a payroll voucher', () => {
  it.each(['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'])(
    'does not open for a treasury account without Payroll payouts (%s)',
    async (referenceType) => {
      mocks.requireAuth.mockResolvedValue({ id: 'executive', role: 'finance', permissions: ['treasury'] })
      database(referenceType)
      await expect(ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) })).rejects.toThrow('NOT_FOUND')
    },
  )

  it('opens for the Principal, who decides it', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database('payroll_disbursement')
    await open()
    expect(screen.getByRole('heading', { level: 1, name: 'HV-PV-202610-0451' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('opens for a finance account that was given Payroll payouts', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'manager', role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    database('payroll_disbursement')
    await open()
    expect(screen.getByRole('heading', { level: 1, name: 'HV-PV-202610-0451' })).toBeVisible()
  })
})

describe('the approval of any other voucher', () => {
  it('opens for a treasury account as before — no Approve where it is not theirs to decide, Overview to go back to', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'executive', role: 'finance', permissions: ['treasury'] })
    database(null)
    await open()
    expect(screen.getByRole('heading', { level: 1, name: 'HV-PV-202610-0451' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByRole('link', { name: '← Overview' })).toHaveAttribute('href', '/dashboard')
  })
})

describe('the page, drawn as Finance’s records are', () => {
  it('heads with the number, its status and facts; the cards say whom it pays, its pools line by line, its files and the trail', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null)
    await open()
    expect(screen.getByRole('link', { name: '← Approvals' })).toHaveAttribute('href', '/approvals')
    expect(screen.getByText('Daily · Approvals · HV-PV-202610-0451')).toBeInTheDocument()
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    const payTo = screen.getByRole('region', { name: 'Pay to' })
    expect(within(payTo).getByText('Payroll disbursement Sep 2026 — Aina binti Example')).toBeInTheDocument()
    const pools = screen.getByRole('region', { name: 'Deducted from' })
    expect(within(pools).getByText('Salaries')).toBeInTheDocument()
    expect(within(pools).getByText('RM 3,200.50')).toBeInTheDocument()
    // The files as the request page always listed them — to read, never to remove.
    const files = within(screen.getByRole('region', { name: 'Attachments' })).getByTestId('attachments')
    expect(files).toHaveTextContent('payslip.pdf')
    expect(files).toHaveAttribute('data-can-delete', 'false')
    expect(within(screen.getByRole('region', { name: 'Trail' })).getByText('Waiting for your decision')).toBeInTheDocument()
    // The panel: the bank and the pool named once.
    expect(screen.getByText('123-456-7890 · Balance RM 90,000.00')).toBeInTheDocument()
    expect(screen.getByText('Deduct from pool').nextElementSibling).toHaveTextContent(/^Venture Pool$/)
  })

  it('approves with the queue’s own action and goes back to the queue', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null)
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ids: ['appr'], groupIds: [], notes: undefined, allowOverdraw: false })
    expect(mocks.flash).toHaveBeenCalledWith('Approved · HV-PV-202610-0451')
    expect(mocks.push).toHaveBeenCalledWith('/approvals')
  })

  it('rejects only with a reason', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null)
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject this request?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rejection reason' }), { target: { value: 'Wrong month' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, reject' }))
    })
    expect(mocks.reject).toHaveBeenCalledWith({ ids: ['appr'], groupIds: [], notes: 'Wrong month' })
  })

  it('the bank short of the voucher: Approve shut, saying why', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null, { balance: 500 })
    await open()
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient bank balance — this voucher needs RM 3,200.50 but Hong Leong Bank holds only RM 500.00.')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('a request decided with others sends to its combined request', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null, { group_id: 'grp' })
    await open()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the combined request' })).toHaveAttribute('href', '/approvals?group_id=grp')
  })

  it('decided: its outcome on the trail and its notes, nothing to decide; ⋯ still opens the voucher', async () => {
    mocks.requireAuth.mockResolvedValue(PRINCIPAL())
    database(null, { status: 'rejected', notes: 'Wrong month', approved_at: '2026-10-03T02:00:00+00:00' })
    await open()
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('region', { name: 'Decision notes' })).getByText('Wrong month')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Open the voucher' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/voucher')
  })
})
