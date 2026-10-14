import type { SupabaseClient } from '@supabase/supabase-js'
import { canDo } from '@/lib/permission-actions'
import { listsPayrollByPerson } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { officeMonth } from '@/lib/office-time'
import { startRead } from '@/lib/start-read'
import type { User } from '@/types'

// The Finance view's Overview (2026-10-14, the Finance revamp v2 — D01): one
// line of what waits — "3 vouchers waiting for approval · 11 invoices
// outstanding · 3 allocations to bill." — and the same figures as the quick
// actions' badges. Each part is read only for whoever opens its page, and
// counts what that page lists: Payments' Draft and Pending tabs (read by
// department — the Finance view — they list no payroll voucher, 2026-10-14),
// the issued invoices still owed, and this month's allocations not yet billed.

export interface FinanceOverviewCounts {
  /** Payment vouchers waiting for the Principal (Payments' Pending approval tab). */
  pending: number | null
  /** Payment vouchers still drafts. */
  draft: number | null
  /** Issued invoices not yet paid. */
  outstanding: number | null
  /** This month's allocations not on a live invoice yet (the Billing Allocator's To bill). */
  toBill: number | null
}

type VoucherRow = { status: string; reference_type: string | null }
type TxnRow = { billed_ref: string | null }
type AllocInvoiceRow = { reference_no: string | null }

export async function loadFinanceOverviewCounts(supabase: SupabaseClient, user: User): Promise<FinanceOverviewCounts> {
  const treasury = canDo(user, 'treasury', 'view')
  const billing = canDo(user, 'billing', 'view')
  const month = officeMonth()
  const ref = `ALC-${month.replace('-', '')}`

  const vouchersRead = treasury
    ? startRead(
        supabase
          .from('payment_vouchers')
          .select('status, reference_type')
          .eq('direction', 'debit')
          .in('status', ['draft', 'pending_approval']),
      )
    : null
  const invoicesRead = billing
    ? startRead(supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'issued'))
    : null
  const txnsRead = billing ? startRead(supabase.from('alloc_txns').select('billed_ref').eq('period_month', `${month}-01`)) : null
  const allocInvoicesRead = billing
    ? startRead(supabase.from('invoices').select('reference_no').like('reference_no', `${ref}%`).neq('status', 'voided'))
    : null

  let pending: number | null = null
  let draft: number | null = null
  if (vouchersRead) {
    const { data, error } = await vouchersRead
    if (!error) {
      // Read by department, payroll lives in its own tab (finance-view.md › PAYROLL LIVES IN ITS OWN TAB).
      const listed = ((data ?? []) as VoucherRow[]).filter((v) => listsPayrollByPerson(user) || !isPayrollReference(v.reference_type))
      pending = listed.filter((v) => v.status === 'pending_approval').length
      draft = listed.filter((v) => v.status === 'draft').length
    }
  }

  let outstanding: number | null = null
  if (invoicesRead) {
    const { count, error } = await invoicesRead
    if (!error) outstanding = count ?? 0
  }

  let toBill: number | null = null
  if (txnsRead && allocInvoicesRead) {
    const [{ data: txns, error: txnError }, { data: invoices, error: invoiceError }] = await Promise.all([txnsRead, allocInvoicesRead])
    if (!txnError && !invoiceError) {
      // A txn is billed while ITS batch still has live invoices (the allocator page's rule).
      const live = new Set(((invoices ?? []) as AllocInvoiceRow[]).map((i) => i.reference_no ?? ''))
      toBill = ((txns ?? []) as TxnRow[]).filter((t) => !t.billed_ref || !live.has(t.billed_ref)).length
    }
  }

  return { pending, draft, outstanding, toBill }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The Overview's line (D01): what waits, part by part, for the parts this viewer reads. */
export function financeSummary(c: FinanceOverviewCounts): string {
  const parts = [
    c.pending === null ? null : `${plural(c.pending, 'voucher', 'vouchers')} waiting for approval`,
    c.outstanding === null ? null : `${plural(c.outstanding, 'invoice', 'invoices')} outstanding`,
    c.toBill === null ? null : `${plural(c.toBill, 'allocation', 'allocations')} to bill`,
  ].filter((p): p is string => p !== null)
  return parts.length ? `${parts.join(' · ')}.` : ''
}
