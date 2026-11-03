import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { parseApproval, parseRequest, type ApprovalRead, type PaymentRequest, type RequestContext } from '@/lib/payment-requests/model'

// Claim (2026-10-29, PR ② — the agreed design's staff page): one's own requests in Payment voucher's hub; the drawer's
// Edit / Submit / Cancel request; the New request window — a pop-out, nothing chosen until picked, the receipts going
// up as they are picked, Submit only once it is whole.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), flash: vi.fn(), open: vi.fn(), save: vi.fn(), cancel: vi.fn(), openFile: vi.fn(), upload: vi.fn(), remove: vi.fn(),
  approve: vi.fn(), sendBack: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/lib/payment-requests/actions', () => ({
  openNewRequest: mocks.open, saveRequest: mocks.save, cancelRequest: mocks.cancel, openRequestFile: mocks.openFile,
  approveRequests: mocks.approve, sendBackRequests: mocks.sendBack,
}))
vi.mock('@/lib/payment-requests/upload', () => ({ uploadRequestFile: mocks.upload, removeRequestUpload: mocks.remove }))

import ClaimHub from './ClaimHub'

const CTX: RequestContext = {
  name: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing',
  salaryAccount: { bank: 'Hong Leong Bank', last4: '4821' },
  departments: [{ id: 'hr', name: 'HR' }], companies: [{ id: 'dc', name: 'Dream Crafter' }], reviewers: null,
}
const req = (over: Record<string, unknown> = {}): PaymentRequest =>
  parseRequest({
    id: '11111111-1111-4111-8111-111111111111', requestNo: 'PRQ-2610-0001', status: 'with_finance', kind: 'claim', mine: true,
    requesterName: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing',
    payToSalary: true, payeeName: 'KHO WEI JIE', payeeBank: 'Hong Leong Bank', payeeAccount: '12345674821', description: 'Claude · Oct',
    total: 453.79, submittedAt: '2026-10-29T02:00:00Z', createdAt: '2026-10-29T01:00:00Z', updatedAt: '2026-10-29T02:00:00Z',
    items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }], shares: [],
    files: [{ id: 'f1', kind: 'receipt', name: 'Receipt-2932.pdf', contentType: 'application/pdf', size: 1200 }],
    ...over,
  }) as PaymentRequest
const DRAFT = req({ id: '22222222-2222-4222-8222-222222222222', requestNo: null, status: 'draft', submittedAt: null, description: 'Jian Ying', total: 325.79,
  items: [{ id: 'i2', description: 'Jian Ying', amount: 325.79 }] })
const SENT_BACK = req({ id: '33333333-3333-4333-8333-333333333333', requestNo: 'PRQ-2610-0002', status: 'rejected', description: 'Canva', total: 250,
  rejectReason: 'The receipt is for September', rejectedByName: 'Finance Manager', rejectedAt: '2026-10-29T05:00:00Z', items: [{ id: 'i3', description: 'Canva', amount: 250 }] })

const draw = async (rows: PaymentRequest[] = [req(), DRAFT, SENT_BACK], over: Partial<{ canCreate: boolean; viewingAs: boolean }> = {}) => {
  render(<ClaimHub rows={rows} canCreate={over.canCreate ?? true} viewingAs={over.viewingAs ?? false} readError={null} />)
  await act(async () => undefined)
}
const window_ = () => screen.getByRole('dialog', { name: /New request|Edit request|Fix and send again/ })

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.open.mockResolvedValue({ ok: true, data: CTX })
})

describe('the page', () => {
  it('says Claim, + New request, the cards and only one’s own requests', async () => {
    await draw()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Claim')
    expect(screen.getByRole('button', { name: '+ New request' })).toBeInTheDocument()
    for (const card of [/^All requests/, /^Draft/, /^With Finance/, /^Rejected/, /^Paid/]) expect(screen.getByRole('button', { name: card })).toBeInTheDocument()
    expect(screen.getByText('Waiting to be paid · 1 request')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Rejected/ }))
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent).join(' '))).toEqual([
      expect.stringContaining('Rejected — fix and send again'),
    ])
  })

  it('viewing as somebody: nothing of the real account’s, nothing to send', async () => {
    await draw([], { viewingAs: true })
    expect(screen.queryByRole('button', { name: '+ New request' })).toBeNull()
    expect(screen.getByText('Viewing as somebody — their requests are theirs to see.')).toBeInTheDocument()
  })
})

describe('the drawer', () => {
  it('a draft: Edit, Submit and Cancel request — Submit sends it as it is', async () => {
    mocks.save.mockResolvedValue({ ok: true, data: { ...DRAFT, status: 'with_finance', requestNo: 'PRQ-2610-0003' } })
    await draw()
    fireEvent.click(screen.getByText('Jian Ying'))
    const drawer = screen.getByRole('dialog', { name: /Draft · Jian Ying/ })
    for (const b of ['Cancel request…', 'Edit', 'Submit']) expect(within(drawer).getByRole('button', { name: b })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Submit' }))
    })
    expect(mocks.save).toHaveBeenCalledWith(DRAFT.id, expect.objectContaining({ kind: 'claim', payTo: { salary: true }, items: [{ description: 'Jian Ying', amount: '325.79' }] }), true)
    expect(mocks.flash).toHaveBeenCalledWith('PRQ-2610-0003 sent to Finance')
  })

  it('one Finance sent back: why, and Fix and send again opens the window on it', async () => {
    await draw()
    fireEvent.click(screen.getByText('Canva'))
    const drawer = screen.getByRole('dialog', { name: /PRQ-2610-0002/ })
    expect(drawer).toHaveTextContent('The receipt is for September')
    expect(within(drawer).queryByRole('button', { name: 'Submit' })).toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Fix and send again' }))
    })
    expect(window_()).toHaveTextContent('Sent back by Finance Manager')
    expect(within(window_()).getByLabelText('Item 1 description')).toHaveValue('Canva')
  })

  it('Cancel request asks first', async () => {
    mocks.cancel.mockResolvedValue({ ok: true, data: { ...req(), status: 'cancelled' } })
    await draw()
    fireEvent.click(screen.getByText('Claude · Oct'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request…' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    const ask = screen.getByRole('dialog', { name: 'Cancel this request?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel request' }))
    })
    expect(mocks.cancel).toHaveBeenCalledWith(req().id)
    expect(mocks.flash).toHaveBeenCalledWith('Request cancelled')
  })
})

describe('New request', () => {
  const open = async () => {
    await draw([])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New request' }))
    })
    return window_()
  }

  it('pops out with nothing chosen: what it is first — the rest opens once it is picked', async () => {
    const w = await open()
    expect(w).toHaveTextContent('KHO WEI JIE · Marketing')
    expect(within(w).getByRole('radio', { name: /I paid — pay me back/ })).not.toBeChecked()
    expect(within(w).getByRole('radio', { name: /Pay a supplier directly/ })).not.toBeChecked()
    expect(within(w).queryByText('2 · What was it for?')).toBeNull()
    expect(within(w).getByRole('button', { name: 'Submit' })).toHaveAttribute('data-off', 'true')
    fireEvent.click(within(w).getByRole('radio', { name: /I paid — pay me back/ }))
    expect(within(w).getByRole('radio', { name: /My salary account/ })).toHaveAccessibleName(/Hong Leong Bank •••• 4821/)
    expect(within(w).getByText('2 · What was it for?')).toBeInTheDocument()
    expect(within(w).getByText('3 · Which pool pays?')).toBeInTheDocument()
    // Each item is its Description and its amount (the user: "确定他们放的那个是description").
    expect(within(w).getByText('Description')).toBeInTheDocument()
    expect(within(w).getByText('Amount (RM)')).toBeInTheDocument()
    expect(within(w).getByLabelText('Item 1 description')).toHaveAttribute('placeholder', 'e.g. Canva team plan · Oct')
  })

  it('a claim, whole: its items, a receipt gone up, the department’s pool — Submit sends it', async () => {
    mocks.upload.mockResolvedValue({ ok: true, file: { path: 'u1/k/Receipt.pdf', name: 'Receipt.pdf', contentType: 'application/pdf', size: 900 } })
    mocks.save.mockResolvedValue({ ok: true, data: req({ id: '44444444-4444-4444-8444-444444444444', requestNo: 'PRQ-2610-0004' }) })
    const w = await open()
    fireEvent.click(within(w).getByRole('radio', { name: /I paid — pay me back/ }))
    fireEvent.click(within(w).getByRole('radio', { name: /My salary account/ }))
    fireEvent.change(within(w).getByLabelText('Item 1 description'), { target: { value: 'Claude · Oct' } })
    fireEvent.change(within(w).getByLabelText('Item 1 amount'), { target: { value: '453.79' } })
    expect(w).toHaveTextContent('Add the receipts or invoices and which pool pays.')
    const input = w.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'Receipt.pdf', { type: 'application/pdf' })] } })
    })
    expect(mocks.upload).toHaveBeenCalled()
    fireEvent.click(within(w).getByRole('radio', { name: /Marketing pays all of it/ }))
    await act(async () => {
      fireEvent.click(within(w).getByRole('button', { name: 'Submit' }))
    })
    expect(mocks.save).toHaveBeenCalledWith(null, {
      kind: 'claim', payTo: { salary: true }, items: [{ description: 'Claude · Oct', amount: '453.79' }], shares: [],
      files: [{ path: 'u1/k/Receipt.pdf', name: 'Receipt.pdf', contentType: 'application/pdf', size: 900 }], removeFiles: [],
    }, true)
    expect(mocks.flash).toHaveBeenCalledWith('PRQ-2610-0004 sent to Finance')
  })

  it('a direct pay asks for the supplier’s name, bank and account; a split, who and how much — the department pays the rest', async () => {
    const w = await open()
    fireEvent.click(within(w).getByRole('radio', { name: /Pay a supplier directly/ }))
    expect(within(w).getByLabelText('Supplier')).toBeInTheDocument()
    fireEvent.change(within(w).getByLabelText('Item 1 amount'), { target: { value: '300' } })
    fireEvent.click(within(w).getByRole('radio', { name: /Split it/ }))
    fireEvent.change(within(w).getByLabelText('Share 1: a department or a company'), { target: { value: 'company' } })
    fireEvent.change(within(w).getByLabelText('Share 1: which'), { target: { value: 'dc' } })
    fireEvent.change(within(w).getByLabelText('Share 1 amount'), { target: { value: '100' } })
    expect(w).toHaveTextContent('Marketing pays RM 200.00')
    expect(w).toHaveTextContent('Add the supplier’s name, the bank, the account number, each item’s words and amount and the receipts or invoices.')
  })

  it('Save as draft keeps what was typed', async () => {
    mocks.save.mockResolvedValue({ ok: true, data: DRAFT })
    const w = await open()
    fireEvent.click(within(w).getByRole('radio', { name: /I paid — pay me back/ }))
    fireEvent.change(within(w).getByLabelText('Item 1 description'), { target: { value: 'Jian Ying' } })
    await act(async () => {
      fireEvent.click(within(w).getByRole('button', { name: 'Save as draft' }))
    })
    expect(mocks.save).toHaveBeenCalledWith(null, expect.objectContaining({ kind: 'claim', items: [{ description: 'Jian Ying', amount: '' }] }), false)
    expect(mocks.flash).toHaveBeenCalledWith('Saved as draft')
  })
})

// PR ③ (2026-10-29 — the mockup's ②): the Marketing Manager's Claim & approve — the team's requests waiting for them,
// all of Marketing's, their own; ticks to approve or reject several at once; the drawer's Approve and Reject…. Since
// PR ④ the boxes are always there and Reject / Approve stand in the table's toolbar, as on Finance's Payment request.
describe('Claim & approve', () => {
  const CHIN = req({
    id: '44444444-4444-4444-8444-444444444444', requestNo: 'PRQ-2610-0003', status: 'pending_approval', mine: false, requesterName: 'CHIN YEE RU',
    payeeName: 'CHIN YEE RU', payeeAccount: '•••• 6602', description: 'KTM Butterworth – KL Sentral', total: 127.8,
    items: [{ id: 'i4', description: 'KTM Butterworth – KL Sentral', amount: 127.8 }], reviewers: ['SIA JOSIAH'], needsApproval: true,
  })
  const JOEY = req({
    id: '55555555-5555-4555-8555-555555555555', requestNo: 'PRQ-2610-0004', status: 'pending_approval', mine: false, requesterName: 'WONG JOEY',
    payeeName: 'WONG JOEY', payeeAccount: '•••• 1180', description: 'Grab · client visit', total: 24.4,
    items: [{ id: 'i5', description: 'Grab · client visit', amount: 24.4 }], reviewers: ['SIA JOSIAH'], needsApproval: true,
  })
  const SENT = req({
    id: '66666666-6666-4666-8666-666666666666', requestNo: 'PRQ-2610-0005', mine: false, requesterName: 'LUM NI KER',
    description: 'Printing', total: 60, items: [{ id: 'i6', description: 'Printing', amount: 60 }], approvedByName: 'SIA JOSIAH',
  })
  const read = (over: Partial<ApprovalRead> = {}): ApprovalRead => ({
    ...(parseApproval({
      departmentName: 'Marketing', canApprove: true, approvers: [{ id: 'u1', name: 'SIA JOSIAH' }, { id: 'u2', name: 'KHO WEI JIE' }], requests: [],
    }) as ApprovalRead),
    requests: [CHIN, JOEY, SENT],
    ...over,
  })
  const drawApprover = async (over: Partial<ApprovalRead> = {}) => {
    render(<ClaimHub rows={[req({ requesterName: 'SIA JOSIAH' })]} canCreate viewingAs={false} readError={null} approval={read(over)} me="SIA JOSIAH" />)
    await act(async () => undefined)
  }
  const listed = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent).join(' '))

  beforeEach(() => window.history.replaceState(null, '', '/claims'))

  it('is Claim & approve: whose requests, who else approves, the team’s waiting first', async () => {
    await drawApprover()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Claim & approve')
    expect(screen.getByText('Marketing’s requests. Your team’s wait here for you or KHO WEI JIE — one approval is enough. Yours go straight to Finance.')).toBeInTheDocument()
    for (const card of [/^To approve/, /^All Marketing/, /^Mine/]) expect(screen.getByRole('button', { name: card })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^To approve/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Waiting for you · 2 requests')).toBeInTheDocument()
    expect(listed()).toEqual([expect.stringContaining('CHIN YEE RU'), expect.stringContaining('WONG JOEY')])
    fireEvent.click(screen.getByRole('button', { name: /^All Marketing/ }))
    expect(listed()).toHaveLength(3)
    expect(listed().join(' ')).toContain('Approved by SIA JOSIAH')
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }))
    expect(listed()).toEqual([expect.stringContaining('Claude · Oct')])
  })

  it('tick, Approve: several at once from the toolbar, sent to Finance — a row still opens its drawer', async () => {
    mocks.approve.mockResolvedValue({ ok: true, data: { approved: 2 } })
    await drawApprover()
    const bar = screen.getByRole('group', { name: 'Several at once' })
    expect(bar).toHaveTextContent('Tick requests to approve or reject several')
    expect(screen.getByRole('button', { name: 'Approve the ticked' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tick CHIN YEE RU' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tick WONG JOEY' }))
    expect(bar).toHaveTextContent('2 selected · RM 152.20')
    fireEvent.click(screen.getByText('WONG JOEY'))
    expect(screen.getByRole('dialog', { name: /PRQ-2610-0004/ })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve the ticked' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith([CHIN.id, JOEY.id])
    expect(mocks.flash).toHaveBeenCalledWith('2 requests approved — with Finance now')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Reject the ticked: one reason for all; on All Marketing one already approved cannot be ticked; Mine has no boxes', async () => {
    mocks.sendBack.mockResolvedValue({ ok: true, data: { sentBack: 2 } })
    await drawApprover()
    fireEvent.click(screen.getByRole('button', { name: /^All Marketing/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tick LUM NI KER' }))
    expect(mocks.flash).toHaveBeenLastCalledWith('Only a request waiting for your approval can be ticked.')
    fireEvent.click(screen.getByRole('button', { name: 'Tick CHIN YEE RU' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tick WONG JOEY' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject the ticked' }))
    const sheet = screen.getByRole('dialog', { name: 'Send 2 requests back?' })
    fireEvent.change(within(sheet).getByLabelText('What to fix'), { target: { value: 'Attach the receipts' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Send back' }))
    })
    expect(mocks.sendBack).toHaveBeenCalledWith([CHIN.id, JOEY.id], 'Attach the receipts')
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }))
    expect(screen.queryByRole('group', { name: 'Several at once' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Tick / })).toBeNull()
  })

  it('Reject…: what to fix, read by whoever sent it', async () => {
    mocks.sendBack.mockResolvedValue({ ok: true, data: { sentBack: 1 } })
    await drawApprover()
    fireEvent.click(screen.getByText('CHIN YEE RU'))
    const drawer = screen.getByRole('dialog', { name: /PRQ-2610-0003/ })
    expect(drawer).toHaveTextContent('Waiting for your approval')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Reject…' }))
    const sheet = screen.getByRole('dialog', { name: 'Send PRQ-2610-0003 back to CHIN YEE RU?' })
    expect(sheet).toHaveTextContent('Tell CHIN YEE RU what to fix — they can submit it again.')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send back to CHIN YEE RU' }))
    expect(mocks.sendBack).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('What to fix'), { target: { value: 'The ticket is for September' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Send back to CHIN YEE RU' }))
    })
    expect(mocks.sendBack).toHaveBeenCalledWith([CHIN.id], 'The ticket is for September')
    expect(mocks.flash).toHaveBeenCalledWith('1 request sent back to fix')
  })

  it('the drawer: Approve — send to Finance for the team’s; one’s own keeps Cancel, never Approve', async () => {
    mocks.approve.mockResolvedValue({ ok: true, data: { approved: 1 } })
    await drawApprover()
    fireEvent.click(screen.getByText('WONG JOEY'))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: /PRQ-2610-0004/ })).getByRole('button', { name: 'Approve — send to Finance' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith([JOEY.id])
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }))
    fireEvent.click(screen.getByText('Claude · Oct'))
    const own = screen.getByRole('dialog', { name: /PRQ-2610-0001/ })
    expect(within(own).queryByRole('button', { name: 'Approve — send to Finance' })).toBeNull()
    expect(within(own).getByRole('button', { name: 'Cancel request…' })).toBeInTheDocument()
  })

  it('one who reads but may not approve: no boxes, no Approve', async () => {
    await drawApprover({ canApprove: false })
    expect(screen.queryByRole('group', { name: 'Several at once' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Tick / })).toBeNull()
    fireEvent.click(screen.getByText('CHIN YEE RU'))
    expect(within(screen.getByRole('dialog', { name: /PRQ-2610-0003/ })).queryByRole('button', { name: 'Approve — send to Finance' })).toBeNull()
  })

  it('a notice’s tap (?open=) opens its request', async () => {
    window.history.replaceState(null, '', `/claims?open=${JOEY.id}`)
    await drawApprover()
    expect(screen.getByRole('dialog', { name: /PRQ-2610-0004/ })).toBeInTheDocument()
  })

  it('the New request window says who approves it first', async () => {
    mocks.open.mockResolvedValue({ ok: true, data: { ...CTX, reviewers: ['SIA JOSIAH'] } })
    await draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New request' }))
    })
    expect(window_()).toHaveTextContent('After you submit: SIA JOSIAH approves it first, then it goes to Finance.')
  })
})
