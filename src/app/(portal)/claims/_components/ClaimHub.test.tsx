import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { parseRequest, type PaymentRequest, type RequestContext } from '@/lib/payment-requests/model'

// Claim (2026-10-29, PR ② — the agreed design's staff page): one's own requests in Payment voucher's hub; the drawer's
// Edit / Submit / Cancel request; the New request window — a pop-out, nothing chosen until picked, the receipts going
// up as they are picked, Submit only once it is whole.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), flash: vi.fn(), open: vi.fn(), save: vi.fn(), cancel: vi.fn(), openFile: vi.fn(), upload: vi.fn(), remove: vi.fn(),
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
vi.mock('@/lib/payment-requests/actions', () => ({ openNewRequest: mocks.open, saveRequest: mocks.save, cancelRequest: mocks.cancel, openRequestFile: mocks.openFile }))
vi.mock('@/lib/payment-requests/upload', () => ({ uploadRequestFile: mocks.upload, removeRequestUpload: mocks.remove }))

import ClaimHub from './ClaimHub'

const CTX: RequestContext = {
  name: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing',
  salaryAccount: { bank: 'Hong Leong Bank', last4: '4821' },
  departments: [{ id: 'hr', name: 'HR' }], companies: [{ id: 'dc', name: 'Dream Crafter' }],
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
