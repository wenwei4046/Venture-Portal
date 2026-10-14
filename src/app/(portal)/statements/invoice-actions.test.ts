import { beforeEach, describe, expect, it, vi } from 'vitest'

// Invoice's hub steps, in words (2026-10-14, the Finance revamp v2 — D10): the
// hub calls Service Billing's own actions through these, each asking its own
// gate first and handing a refusal back as a sentence — production reduces a
// thrown Server Action's message to a digest.

const mocks = vi.hoisted(() => ({
  requireActionOn: vi.fn(),
  requirePermission: vi.fn(),
  createManualInvoice: vi.fn(),
  createMultiLineInvoice: vi.fn(),
  updateDraftInvoiceFull: vi.fn(),
  updateIssuedInvoiceFull: vi.fn(),
  fetchStaffAllocationByCompany: vi.fn(),
  fetchDirectorCtcByCompany: vi.fn(),
  createCreditNote: vi.fn(),
  reassignInvoiceGlAccount: vi.fn(),
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
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn, requirePermission: mocks.requirePermission }))
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
  createManualInvoice: mocks.createManualInvoice,
  createMultiLineInvoice: mocks.createMultiLineInvoice,
  updateDraftInvoiceFull: mocks.updateDraftInvoiceFull,
  updateIssuedInvoiceFull: mocks.updateIssuedInvoiceFull,
  fetchStaffAllocationByCompany: mocks.fetchStaffAllocationByCompany,
  fetchDirectorCtcByCompany: mocks.fetchDirectorCtcByCompany,
  createCreditNote: mocks.createCreditNote,
  reassignInvoiceGlAccount: mocks.reassignInvoiceGlAccount,
}))

import {
  hubApproveCreditNote,
  hubApproveInvoice,
  hubApproveMonth,
  hubChangeAccount,
  hubCopyInvoice,
  hubCreateCreditNote,
  hubCreateInvoice,
  hubCreateLinesInvoice,
  hubHrFigures,
  hubUpdateInvoice,
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

  it('a copy answers the draft it made — the full page opens it, the hub stays', async () => {
    mocks.copyInvoice.mockResolvedValue({ id: 'i9', no: 'HV-INV-202610-0099' })
    expect(await hubCopyInvoice('i1')).toEqual({ ok: true, value: { id: 'i9', no: 'HV-INV-202610-0099' } })
    expect(sent(mocks.copyInvoice)).toEqual({ invoice_id: 'i1' })
  })

  it('any other step’s redirect still goes through', async () => {
    mocks.approveInvoice.mockRejectedValue(redirectError())
    await expect(hubApproveInvoice('i1')).rejects.toThrow('NEXT_REDIRECT')
  })
})

// The invoice dialogs' writes (2026-10-14, D10's inv-form): Service Billing's
// own create / edit, each behind its gate, its number or its refusal back.
describe('the invoice dialogs', () => {
  const head = { mode: 'venture_attribution', period: '2026-09', invoiceDate: '2026-09-30', dueDate: '2026-11-13', description: 'Office rental — Sep', reference: 'PO-881' }

  it('Create invoice: Billing · Create, the form the old dialog sent, its number back', async () => {
    mocks.createManualInvoice.mockResolvedValue({ invoice_no: 'HV-INV-202609-0061' })
    const res = await hubCreateInvoice({ billKind: 'freetext', name: ' Rygis Private Gym ', address: '12 Jalan Ipoh', phone: '012', email: 'a@b.my', ...head, category: '9091', amount: 780.25 })
    expect(res).toEqual({ ok: true, value: 'HV-INV-202609-0061' })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'create')
    expect(sent(mocks.createManualInvoice)).toEqual({
      billable_to_type: 'freetext',
      billable_to_freetext_name: 'Rygis Private Gym',
      billable_to_freetext_address: '12 Jalan Ipoh',
      billable_to_freetext_phone: '012',
      billable_to_freetext_email: 'a@b.my',
      billing_mode: 'venture_attribution',
      category_code: '9091',
      period_month: '2026-09-01',
      invoice_date: '2026-09-30',
      due_date: '2026-11-13',
      amount: '780.25',
      description: 'Office rental — Sep',
      reference_no: 'PO-881',
    })
  })

  it('a company is billed by its id only', async () => {
    mocks.createManualInvoice.mockResolvedValue({ invoice_no: 'HV-INV-202609-0062' })
    await hubCreateInvoice({ billKind: 'subsidiary', companyId: 'co-hc', ...head, category: '9091', amount: 10 })
    const fd = sent(mocks.createManualInvoice)
    expect(fd.company_id).toBe('co-hc')
    expect(fd.billable_to_freetext_name).toBeUndefined()
  })

  it('lines: the multi-line create (its gate names the hub), its number back', async () => {
    mocks.createMultiLineInvoice.mockResolvedValue({ id: 'i9', invoice_no: 'HV-INV-202609-0063' })
    const lines = [{ description: 'Salary', amount: 100, categoryCode: '5050' }]
    expect(await hubCreateLinesInvoice({ billKind: 'dept_pool', deptId: 'd-mkt', ...head, lines })).toEqual({ ok: true, value: 'HV-INV-202609-0063' })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/statements', 'billing', 'create')
    expect(mocks.createMultiLineInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        billableType: 'dept_pool',
        departmentId: 'd-mkt',
        companyId: undefined,
        billingMode: 'venture_attribution',
        period: '2026-09',
        referenceNo: 'PO-881',
        headerDescription: 'Office rental — Sep',
        lines,
      }),
    )
  })

  it('edit: a draft rewritten whole; an issued one with its reason, the corrected entry back', async () => {
    const base = { id: 'i1', billKind: 'subsidiary' as const, companyId: 'co-hc', ...head, lines: [{ description: '', amount: 5, categoryCode: '' }] }
    expect(await hubUpdateInvoice({ ...base, issued: false })).toEqual({ ok: true, value: null })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'edit')
    expect(mocks.updateDraftInvoiceFull).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', companyId: 'co-hc', billingMode: 'venture_attribution' }))
    mocks.updateIssuedInvoiceFull.mockResolvedValue({ entryNo: 'JE-202609-0901' })
    expect(await hubUpdateInvoice({ ...base, issued: true, reason: 'wrong month' })).toEqual({ ok: true, value: 'JE-202609-0901' })
    expect(mocks.updateIssuedInvoiceFull).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', reason: 'wrong month' }))
  })

  it('HR’s figures: Billing or HR Costing may read them; a director recharge reads the CTC, a staff one the allocation', async () => {
    mocks.fetchDirectorCtcByCompany.mockResolvedValue([{ companyId: 'co-hc', totalCtc: 1 }])
    mocks.fetchStaffAllocationByCompany.mockResolvedValue([{ companyId: 'co-conts', amount: 2 }])
    expect(await hubHrFigures('2026-09', 'director_attribution')).toEqual({ ok: true, value: { staff: [], directors: [{ companyId: 'co-hc', totalCtc: 1 }] } })
    expect(mocks.requirePermission).toHaveBeenCalledWith('billing', 'hr_costing')
    expect(mocks.fetchDirectorCtcByCompany).toHaveBeenCalledWith('2026-09-01')
    expect(await hubHrFigures('2026-09', 'finance_attribution')).toEqual({ ok: true, value: { staff: [{ companyId: 'co-conts', amount: 2 }], directors: [] } })
    expect(mocks.fetchStaffAllocationByCompany).toHaveBeenCalledWith('2026-09-01', 'finance_attribution')
  })

  it('a refusal is its sentence', async () => {
    mocks.createManualInvoice.mockRejectedValue(new Error('Period 2026-09 is closed'))
    expect(await hubCreateInvoice({ billKind: 'subsidiary', companyId: 'co-hc', ...head, category: '9091', amount: 10 })).toEqual({ ok: false, reason: 'Period 2026-09 is closed' })
  })
})

// The credit note and Change account (2026-10-14): Service Billing's own, in words.
describe('the credit note and the account', () => {
  it('a credit note: Billing · Create, the form the old dialog sent, its number back', async () => {
    mocks.createCreditNote.mockResolvedValue({ id: 'cn9', credit_note_no: 'HV-CN-202610-0003' })
    const res = await hubCreateCreditNote({ invoiceId: 'hc1', mode: 'hr_attribution', category: '5020', amount: 200, reason: ' Overbilled ' })
    expect(res).toEqual({ ok: true, value: 'HV-CN-202610-0003' })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'create')
    expect(sent(mocks.createCreditNote)).toEqual({ invoice_id: 'hc1', amount: '200.00', reason: 'Overbilled', billing_mode: 'hr_attribution', category_code: '5020' })
  })

  it('change account: Billing · Edit, the accounts as one list; its refusal is its sentence', async () => {
    mocks.reassignInvoiceGlAccount.mockResolvedValue({ changed: 2, oldAccount: '3051, 3056' })
    expect(await hubChangeAccount({ invoiceId: 'i40', from: ['3051', '3056'], to: '5011', reason: 'wrong account' })).toEqual({ ok: true, value: { changed: 2, from: '3051, 3056' } })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/invoices/[id]', 'billing', 'edit')
    expect(sent(mocks.reassignInvoiceGlAccount)).toEqual({ id: 'i40', old_account: '3051,3056', new_account: '5011', reason: 'wrong account' })
    mocks.reassignInvoiceGlAccount.mockResolvedValue({ error: 'The period 2026-09 is closed' })
    expect(await hubChangeAccount({ invoiceId: 'i40', from: [], to: '5011', reason: 'x' })).toEqual({ ok: false, reason: 'The period 2026-09 is closed' })
  })
})
