// Pure helpers for consolidated invoice settlement. No Supabase/server
// imports so both the server action and the client list can use them.

export interface SettleableInvoice {
  id: string
  status: string
  billable_to_type: string | null
  company_id: string | null
  billable_to_freetext_name: string | null
  total_amount: number | string
}

/** Stable key identifying the payer. Subsidiary invoices key off company_id;
 *  director/freetext invoices key off the freetext payee name. */
export function payeeKey(inv: SettleableInvoice): string {
  if (inv.company_id) return `company:${inv.company_id}`
  return `freetext:${inv.billable_to_freetext_name ?? ''}`
}

export type ConsolidationCheck =
  | { ok: true; payeeKey: string; total: number }
  | { ok: false; error: string }

/** A consolidated receipt may only cover issued, non-inter-billing invoices
 *  of a SINGLE payer. Returns the shared payee key + rounded total on success. */
export function validateConsolidation(invoices: SettleableInvoice[]): ConsolidationCheck {
  if (invoices.length === 0) return { ok: false, error: 'No invoices selected' }
  for (const i of invoices) {
    if (i.status !== 'issued') {
      return { ok: false, error: `Invoice ${i.id} is ${i.status}, expected issued` }
    }
    if (i.billable_to_type === 'dept_pool') {
      return { ok: false, error: 'Inter-billing (dept_pool) invoices must be settled individually' }
    }
    if (!i.company_id && !i.billable_to_freetext_name) {
      return { ok: false, error: `Invoice ${i.id} has no identifiable payee` }
    }
  }
  const keys = new Set(invoices.map(payeeKey))
  if (keys.size > 1) {
    return { ok: false, error: '一张收据只能结同一家公司的单，请只勾选同一家公司的发票' }
  }
  // Sum in integer cents to avoid floating-point drift, then convert back.
  let totalCents = 0
  for (const i of invoices) {
    const cents = Math.round(Number(i.total_amount) * 100)
    if (Number.isNaN(cents)) {
      return { ok: false, error: `Invoice ${i.id} has an invalid total_amount` }
    }
    totalCents += cents
  }
  return { ok: true, payeeKey: [...keys][0], total: totalCents / 100 }
}
