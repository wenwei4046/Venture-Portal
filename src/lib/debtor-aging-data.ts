// Partial payments (user 2026-08-11): an issued invoice's outstanding is its
// total minus every non-voided receipt linked via payment_vouchers.invoice_id.
// Shared by the Debtor Aging page and its export so both always agree.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'

export async function fetchPaidByInvoice(
  supabase: SupabaseClient,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const paid = new Map<string, number>()
  if (invoiceIds.length === 0) return paid
  const rows = (await fetchAllRows((lo, hi) =>
    supabase
      .from('payment_vouchers')
      .select('invoice_id, amount')
      .in('invoice_id', invoiceIds)
      .eq('direction', 'credit')
      .neq('status', 'voided')
      .order('id')
      .range(lo, hi),
  )) as Array<{ invoice_id: string | null; amount: number }>
  for (const r of rows) {
    if (!r.invoice_id) continue
    paid.set(
      r.invoice_id,
      Math.round(((paid.get(r.invoice_id) ?? 0) + Number(r.amount)) * 100) / 100,
    )
  }
  return paid
}
