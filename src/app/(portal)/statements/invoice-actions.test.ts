import { beforeEach, describe, expect, it, vi } from 'vitest'

// Invoice's hub steps, in words (2026-10-14, the Finance revamp v2 — D10): the
// hub calls Service Billing's own actions through these, each asking its own
// gate first and handing a refusal back as a sentence — production reduces a
// thrown Server Action's message to a digest.

const mocks = vi.hoisted(() => ({
  requireActionOn: vi.fn(),
  approveInvoice: vi.fn(),
  approveInvoicesForPeriod: vi.fn(),
  deleteDraftInvoice: vi.fn(),
  voidIssuedInvoices: vi.fn(),
  settleInvoicesConsolidated: vi.fn(),
  copyInvoice: vi.fn(),
  approveCreditNote: vi.fn(),
  voidCreditNote: vi.fn(),
  deleteCreditNote: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('../billing/actions', () => ({
  approveInvoice: mocks.approveInvoice,
  approveInvoicesForPeriod: mocks.approveInvoicesForPeriod,
  deleteDraftInvoice: mocks.deleteDraftInvoice,
  voidIssuedInvoices: mocks.voidIssuedInvoices,
  settleInvoicesConsolidated: mocks.settleInvoicesConsolidated,
  copyInvoice: mocks.copyInvoice,
  approveCreditNote: mocks.approveCreditNote,
  voidCreditNote: mocks.voidCreditNote,
  deleteCreditNote: mocks.deleteCreditNote,
}))

import {
  hubApproveCreditNote,
  hubApproveInvoice,
  hubApproveMonth,
  hubCopyInvoice,
  hubDeleteCreditNote,
  hubDeleteDraft,
  hubSettleInvoices,
  hubVoidCreditNote,
  hubVoidInvoices,
} from './invoice-actions'

const redirectError = () => Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/billing;307;' })
const sent = (fn: ReturnType<typeof vi.fn>) => Object.fromEntries((fn.mock.calls[0][0] as FormData).entries())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'u1' })
})

describe('each step asks its gate, then runs Service Billing’s action', () => {
  it('approve & issue: Billing · Edit, the invoice’s id', async () => {
    expect(await hubApproveInvoice('i1')).toEqual({ ok: true, value: null })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'edit')
    expect(sent(mocks.approveInvoice)).toEqual({ id: 'i1' })
  })

  it('approve the month’s drafts: how many were issued', async () => {
    mocks.approveInvoicesForPeriod.mockResolvedValue({ issued: 3, period: '2026-10-01' })
    expect(await hubApproveMonth('2026-10-01')).toEqual({ ok: true, value: 3 })
    expect(sent(mocks.approveInvoicesForPeriod)).toEqual({ period_month: '2026-10-01' })
  })

  it('void: Billing · Void, the ids and the reason, what was voided', async () => {
    mocks.voidIssuedInvoices.mockResolvedValue({ voided: ['HV-INV-202610-0013'] })
    expect(await hubVoidInvoices(['i1'], 'reissued')).toEqual({ ok: true, value: ['HV-INV-202610-0013'] })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'void')
    expect(mocks.voidIssuedInvoices).toHaveBeenCalledWith({ ids: ['i1'], reason: 'reissued' })
  })

  it('settle: Billing · Create, one receipt, part of it for one invoice', async () => {
    mocks.settleInvoicesConsolidated.mockResolvedValue({ voucherId: 'v', voucherNo: 'HV-OR-202610-0031', settledCount: 1, total: 500, isPartial: true })
    const res = await hubSettleInvoices({ invoiceIds: ['i1'], bankAccountId: 'b1', paymentDate: '2026-10-14', partialAmount: 500 })
    expect(res).toEqual({ ok: true, value: { voucherNo: 'HV-OR-202610-0031', settledCount: 1, total: 500, isPartial: true } })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'create')
  })

  it('credit notes: approving is Treasury · Approve, voiding Billing · Void, deleting Billing · Edit', async () => {
    await hubApproveCreditNote('cn1')
    expect(mocks.requireActionOn).toHaveBeenLastCalledWith('/invoices/[id]', 'treasury', 'approve')
    await hubVoidCreditNote('cn1')
    expect(mocks.requireActionOn).toHaveBeenLastCalledWith('/invoices/[id]', 'billing', 'void')
    await hubDeleteCreditNote('cn1')
    expect(mocks.requireActionOn).toHaveBeenLastCalledWith('/invoices/[id]', 'billing', 'edit')
    expect(sent(mocks.approveCreditNote)).toEqual({ id: 'cn1' })
  })
})

describe('in words, not a throw', () => {
  it('a refusal comes back as its sentence', async () => {
    mocks.deleteDraftInvoice.mockRejectedValue(new Error('Only drafts can be deleted'))
    expect(await hubDeleteDraft('i1')).toEqual({ ok: false, reason: 'Only drafts can be deleted' })
  })

  it('a copy’s redirect is the copy done — the reader stays on the hub', async () => {
    mocks.copyInvoice.mockRejectedValue(redirectError())
    expect(await hubCopyInvoice('i1')).toEqual({ ok: true, value: null })
    expect(sent(mocks.copyInvoice)).toEqual({ invoice_id: 'i1' })
  })

  it('any other step’s redirect still goes through', async () => {
    mocks.approveInvoice.mockRejectedValue(redirectError())
    await expect(hubApproveInvoice('i1')).rejects.toThrow('NEXT_REDIRECT')
  })
})
