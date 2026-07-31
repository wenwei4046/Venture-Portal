// Live amounts for the approval queue.
//
// `approval_requests.amount` is a SNAPSHOT taken when the request was
// submitted. Nothing refreshes it afterwards — updatePaymentVoucher (and the
// other edit paths) update the target row and its detail lines, then leave the
// approval row alone. So the moment Finance edits an already-submitted voucher,
// the queue and the detail page disagree: user hit this on
// HV-PV-202607-0179 (queue said RM 100,000, detail said RM 90,000, and the
// posting used 90,000).
//
// Approval posts from the TARGET row, never from the snapshot, so the detail
// figure is the truthful one. Rather than teach every edit path to keep the
// snapshot in sync — one forgotten path and the bug is back — the queue reads
// straight through to the target. The snapshot survives only as a fallback for
// rows whose target can't be read (deleted, or hidden by RLS).
//
// Where the live figure lives, per reference_table:
//   payment_vouchers → amount      fund_sources → amount      loans → principal
// `dept_pools` requests never carry an amount at all, so they just keep null.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ApprovalAmountRow {
  id: string
  amount: number | string | null
  reference_id: string | null
  reference_table: string | null
}

const AMOUNT_COLUMN: Record<string, string> = {
  payment_vouchers: 'amount',
  fund_sources: 'amount',
  loans: 'principal',
}

const toNumber = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

/**
 * Resolve each approval row's amount from the row it points at.
 * Returns approval_requests.id → live amount (falling back to the snapshot).
 * One query per distinct target table, not one per row.
 */
export async function resolveLiveApprovalAmounts(
  supabase: SupabaseClient,
  rows: ApprovalAmountRow[],
): Promise<Map<string, number | null>> {
  const resolved = new Map<string, number | null>(
    rows.map((r) => [r.id, toNumber(r.amount)]),
  )

  const idsByTable = new Map<string, Set<string>>()
  for (const r of rows) {
    const table = r.reference_table ?? ''
    if (!r.reference_id || !AMOUNT_COLUMN[table]) continue
    if (!idsByTable.has(table)) idsByTable.set(table, new Set())
    idsByTable.get(table)!.add(r.reference_id)
  }
  if (idsByTable.size === 0) return resolved

  await Promise.all(
    Array.from(idsByTable, async ([table, ids]) => {
      const column = AMOUNT_COLUMN[table]
      // Table + column are chosen from AMOUNT_COLUMN, never from user input,
      // but they're dynamic — so the typed client can't parse the select list
      // and we hand-type the result instead.
      const { data } = (await supabase
        .from(table)
        .select(`id, ${column}`)
        .in('id', Array.from(ids))) as unknown as {
        data: Array<Record<string, unknown>> | null
      }

      const live = new Map<string, number | null>(
        (data ?? []).map((t) => [String(t.id), toNumber(t[column])]),
      )
      for (const r of rows) {
        if (r.reference_table !== table || !r.reference_id) continue
        // Target missing → keep the snapshot rather than blanking the row.
        if (live.has(r.reference_id)) resolved.set(r.id, live.get(r.reference_id)!)
      }
    }),
  )

  return resolved
}
