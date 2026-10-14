'use server'

import { requireActionOn } from '@/lib/auth'
import {
  approveCreditNote,
  approveInvoice,
  approveInvoicesForPeriod,
  copyInvoice,
  deleteCreditNote,
  deleteDraftInvoice,
  settleInvoicesConsolidated,
  voidCreditNote,
  voidIssuedInvoices,
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
