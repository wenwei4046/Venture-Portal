'use server'

import { requireActionOn, requirePermission } from '@/lib/auth'
import {
  approveCreditNote,
  approveInvoice,
  approveInvoicesForPeriod,
  copyInvoice,
  createManualInvoice,
  createMultiLineInvoice,
  deleteCreditNote,
  deleteDraftInvoice,
  fetchDirectorCtcByCompany,
  fetchStaffAllocationByCompany,
  settleInvoicesConsolidated,
  updateDraftInvoiceFull,
  updateIssuedInvoiceFull,
  voidCreditNote,
  voidIssuedInvoices,
  type BillableToKind,
  type CreateInvoiceMode,
  type DirectorCtcRow,
  type InvoiceLineInput,
  type StaffAllocationCompanyRow,
} from '../billing/actions'

// Invoice's hub steps, in words (2026-10-14, the Finance revamp v2 — D10). The
// hub's drawer, its bulk bar and its credit notes call Service Billing's own
// actions — every rule of them, their gates included — through these, which
// hand back a sentence instead of throwing: in production Next.js reduces a
// thrown Server Action's message to a digest, so a refusal ("This invoice has
// a receipt — it cannot be voided") would reach the reader as "An error
// occurred". Each asks its own gate first, the gate of the action it runs.

export type HubResult<T = null> = { ok: true; value: T } | { ok: false; reason: string }

const isRedirect = (err: unknown) => {
  const digest = (err as { digest?: string })?.digest
  return (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) || (err instanceof Error && err.message.includes('NEXT_REDIRECT'))
}

async function attempt<T>(run: () => Promise<T>): Promise<HubResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, reason: err instanceof Error && err.message ? err.message : 'That did not go through. Try again.' }
  }
}

const withId = (key: string, id: string) => {
  const fd = new FormData()
  fd.set(key, id)
  return fd
}

/** Approve & issue a draft — it posts to the GL. */
export async function hubApproveInvoice(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'billing', 'edit')
  return attempt(async () => {
    await approveInvoice(withId('id', id))
    return null
  })
}

/** Approve every draft of the month at once. */
export async function hubApproveMonth(period: string): Promise<HubResult<number>> {
  await requireActionOn('/invoices/[id]', 'billing', 'edit')
  return attempt(async () => (await approveInvoicesForPeriod(withId('period_month', period))).issued)
}

/** Delete a draft — nothing has posted yet. */
export async function hubDeleteDraft(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'billing', 'edit')
  return attempt(async () => {
    await deleteDraftInvoice(withId('id', id))
    return null
  })
}

/** Void issued invoices nothing has touched (no receipt, no credit note), with a reason. */
export async function hubVoidInvoices(ids: string[], reason: string): Promise<HubResult<string[]>> {
  await requireActionOn('/invoices/[id]', 'billing', 'void')
  return attempt(async () => (await voidIssuedInvoices({ ids, reason })).voided)
}

/** One receipt for one payer's invoices — or, for a single invoice, part of what it owes. */
export async function hubSettleInvoices(payload: {
  invoiceIds: string[]
  bankAccountId: string
  paymentDate: string
  partialAmount?: number
}): Promise<HubResult<{ voucherNo: string; settledCount: number; total: number; isPartial: boolean }>> {
  await requireActionOn('/invoices/[id]', 'billing', 'create')
  return attempt(async () => {
    const res = await settleInvoicesConsolidated(payload)
    return { voucherNo: res.voucherNo, settledCount: res.settledCount, total: res.total, isPartial: res.isPartial }
  })
}

/**
 * Copy an invoice as a new draft in this month. Service Billing's copy ends by
 * sending the reader to its list; from the hub the reader stays where they
 * are — its redirect is the copy done, and the hub says so (and opens this
 * month when another is on show).
 */
export async function hubCopyInvoice(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'billing', 'create')
  return attempt(async () => {
    try {
      await copyInvoice(withId('invoice_id', id))
    } catch (err) {
      if (!isRedirect(err)) throw err
    }
    return null
  })
}

/** Approve a draft credit note — it posts and takes the amount off what the invoice owes. */
export async function hubApproveCreditNote(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'treasury', 'approve')
  return attempt(async () => {
    await approveCreditNote(withId('id', id))
    return null
  })
}

/** Void an approved credit note — the invoice owes it again. */
export async function hubVoidCreditNote(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'billing', 'void')
  return attempt(async () => {
    await voidCreditNote(withId('id', id))
    return null
  })
}

/** Delete a draft credit note. */
export async function hubDeleteCreditNote(id: string): Promise<HubResult> {
  await requireActionOn('/invoices/[id]', 'billing', 'edit')
  return attempt(async () => {
    await deleteCreditNote(withId('id', id))
    return null
  })
}

// ── The invoice dialogs (2026-10-14, D10's inv-form) ──

/** Who an invoice bills: a company, a department's pool, or a name — someone else's with how to reach them. */
export interface HubInvoiceParty {
  billKind: BillableToKind
  companyId?: string
  deptId?: string
  name?: string
  address?: string
  phone?: string
  email?: string
}

/** The header every invoice of the dialogs carries. */
interface HubInvoiceHead {
  mode: string
  /** "2026-10". */
  period: string
  invoiceDate: string
  dueDate: string
  description: string
  reference: string
}

const partyOf = (p: HubInvoiceParty) => ({
  billableType: p.billKind,
  companyId: p.billKind === 'subsidiary' ? p.companyId : undefined,
  departmentId: p.billKind === 'dept_pool' ? p.deptId : undefined,
  freetextName: p.billKind === 'director' || p.billKind === 'freetext' ? p.name?.trim() : undefined,
  freetextAddress: p.billKind === 'freetext' ? p.address?.trim() : undefined,
  freetextPhone: p.billKind === 'freetext' ? p.phone?.trim() : undefined,
  freetextEmail: p.billKind === 'freetext' ? p.email?.trim() : undefined,
})

/** Create invoice: one draft — a party, a billing mode, a category, an amount. Its number back. */
export async function hubCreateInvoice(payload: HubInvoiceParty & HubInvoiceHead & { category: string; amount: number }): Promise<HubResult<string>> {
  await requireActionOn('/invoices/[id]', 'billing', 'create')
  return attempt(async () => {
    const fd = new FormData()
    fd.set('billable_to_type', payload.billKind)
    if (payload.billKind === 'subsidiary') fd.set('company_id', payload.companyId ?? '')
    if (payload.billKind === 'dept_pool') fd.set('billable_to_department_id', payload.deptId ?? '')
    if (payload.billKind === 'director' || payload.billKind === 'freetext') fd.set('billable_to_freetext_name', payload.name?.trim() ?? '')
    if (payload.billKind === 'freetext') {
      fd.set('billable_to_freetext_address', payload.address?.trim() ?? '')
      fd.set('billable_to_freetext_phone', payload.phone?.trim() ?? '')
      fd.set('billable_to_freetext_email', payload.email?.trim() ?? '')
    }
    fd.set('billing_mode', payload.mode)
    fd.set('category_code', payload.category)
    fd.set('period_month', `${payload.period}-01`)
    fd.set('invoice_date', payload.invoiceDate)
    fd.set('due_date', payload.dueDate)
    fd.set('amount', payload.amount.toFixed(2))
    fd.set('description', payload.description.trim())
    fd.set('reference_no', payload.reference.trim())
    return (await createManualInvoice(fd)).invoice_no
  })
}

/** A draft with lines: Multi-line invoice, or a director's CTC itemised the way HR keyed it. Its number back. */
export async function hubCreateLinesInvoice(payload: HubInvoiceParty & HubInvoiceHead & { lines: InvoiceLineInput[] }): Promise<HubResult<string | null>> {
  await requireActionOn('/statements', 'billing', 'create')
  return attempt(async () => {
    const created = await createMultiLineInvoice({
      ...partyOf(payload),
      billingMode: payload.mode as CreateInvoiceMode,
      period: payload.period,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate,
      referenceNo: payload.reference,
      headerDescription: payload.description,
      lines: payload.lines,
    })
    return created.invoice_no
  })
}

/**
 * Edit: a draft is rewritten whole (nothing has posted); an issued or paid one
 * keeps its number and its entry is corrected in place, with the reason on the
 * audit trail — Service Billing's two edits, each with its own rules.
 */
export async function hubUpdateInvoice(
  payload: HubInvoiceParty & HubInvoiceHead & { id: string; lines: InvoiceLineInput[]; issued: boolean; reason?: string },
): Promise<HubResult<string | null>> {
  await requireActionOn('/invoices/[id]', 'billing', 'edit')
  return attempt(async () => {
    const body = {
      id: payload.id,
      ...partyOf(payload),
      billingMode: payload.mode as CreateInvoiceMode,
      period: payload.period,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate,
      referenceNo: payload.reference,
      headerDescription: payload.description,
      lines: payload.lines,
    }
    if (payload.issued) return (await updateIssuedInvoiceFull({ ...body, reason: payload.reason ?? '' })).entryNo
    await updateDraftInvoiceFull(body)
    return null
  })
}

/** HR's figures a recharge bills, per company: a shared-services department's staff, or the directors' CTC. */
export async function hubHrFigures(
  month: string,
  mode: string,
): Promise<HubResult<{ staff: StaffAllocationCompanyRow[]; directors: DirectorCtcRow[] }>> {
  await requirePermission('billing', 'hr_costing')
  return attempt(async () => {
    const period = `${month}-01`
    if (mode === 'director_attribution') return { staff: [], directors: await fetchDirectorCtcByCompany(period) }
    return { staff: await fetchStaffAllocationByCompany(period, mode as CreateInvoiceMode), directors: [] }
  })
}
