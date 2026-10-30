'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sellerAnswerFromRow, sellerChecksFromRow, type SellerAnswer } from '@/lib/commission/seller-checks'
import { billsClosedReason, staffClosedReason } from './_lib/salesperson-closes'

/**
 * Comm Cal › the month › Whose sale (2026-10-31 — the user: "要能够分开哪些是真正他自己开的单，哪些是他只是帮人家处理的单"): HR
 * answers a bill the feed held because its paper is on another salesperson's order — their own sale counts it, not theirs
 * keeps it out in HR's name, saying whose it was. The rule is the database's (`revenue_answer_seller_check`, mig
 * 20261031030000), under the caller's own session: Revenue · Edit, on this page's tab. A refusal is RETURNED —
 * production hands the browser only a digest of what an action throws.
 */
export type SellerCheckDecision = { ok: true; answer: SellerAnswer } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The function's own refusals (not open to you, nothing to answer, a month whose run has paid) and the exclusions'. */
const SAID = new Set(['22023', '42501', '23RUN', '23EXC'])

interface BillRow {
  staff_id: string | null
  period_month: string
  cancelled: boolean
  sales_import_batches: { sub_department_id: string } | { sub_department_id: string }[] | null
}

export async function answerSellerCheck(orderId: string, theirs: boolean, note: string | null): Promise<SellerCheckDecision> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false, reason: 'That bill is not there.' }
  if (typeof theirs !== 'boolean') return { ok: false, reason: 'Their own sale, or not theirs?' }
  const said = typeof note === 'string' ? note.trim() : ''
  if (said.length > 500) return { ok: false, reason: 'Keep the note to 500 characters.' }
  const supabase = (await createClient()) as unknown as SupabaseClient

  // A closed month cannot move under anybody: taking the bill out changes what its holders were closed on; counting a
  // held bill gives its salesperson a bill their close does not hold.
  const closed = await billsClosedReason(supabase, [orderId])
  if (closed) return { ok: false, reason: closed }
  if (theirs) {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('staff_id, period_month, cancelled, sales_import_batches!inner (sub_department_id)')
      .eq('id', orderId)
      .maybeSingle()
    if (error) throw new Error(`Could not read the bill: ${error.message}`)
    const bill = data as unknown as BillRow | null
    const batch = Array.isArray(bill?.sales_import_batches) ? bill.sales_import_batches[0] : bill?.sales_import_batches
    if (bill?.cancelled && bill.staff_id && batch) {
      const reason = await staffClosedReason(supabase, bill.staff_id, batch.sub_department_id, bill.period_month)
      if (reason) return { ok: false, reason }
    }
  }

  const { data, error } = await supabase.rpc('revenue_answer_seller_check', { p_order_id: orderId, p_theirs: theirs, p_note: said || null })
  if (error) {
    if ((error.code && SAID.has(error.code)) || error.message?.startsWith('Read-only')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  // The bill's sales count (or stop counting) on every board: the month, the salesperson's ledger, the Revenue app.
  revalidatePath('/revenue', 'layout')
  revalidatePath('/member')
  const answer = sellerAnswerFromRow(data)
  return answer ? { ok: true, answer } : { ok: false, reason: 'It was saved — refresh the page to see it.' }
}


/**
 * A bill the ERP gave to another salesperson after the portal had it (2026-10-31 — the user: "do 1"; mig
 * 20261031040000): keep = back to whom it was (Move a bill to another salesperson, pinned), not keep = where the ERP put
 * it (an earlier keep's pin taken off). `revenue_answer_seller_move`, under the caller's own session: Revenue · Edit on
 * this page's tab. A closed month refuses it as it refuses every move: the bill's holders', and the month of whoever it
 * goes to.
 */
export async function answerSellerMove(orderId: string, keep: boolean, note: string | null): Promise<SellerCheckDecision> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false, reason: 'That bill is not there.' }
  if (typeof keep !== 'boolean') return { ok: false, reason: 'Keep it where it was, or where the ERP put it?' }
  const said = typeof note === 'string' ? note.trim() : ''
  if (said.length > 500) return { ok: false, reason: 'Keep the note to 500 characters.' }
  const supabase = (await createClient()) as unknown as SupabaseClient

  const closed = await billsClosedReason(supabase, [orderId])
  if (closed) return { ok: false, reason: closed }
  const { data: bill, error: billError } = await supabase
    .from('sales_orders')
    .select('staff_id, period_month, cancelled, sales_import_batches!inner (sub_department_id)')
    .eq('id', orderId)
    .maybeSingle()
  if (billError) throw new Error(`Could not read the bill: ${billError.message}`)
  const row = bill as unknown as BillRow | null
  const batch = Array.isArray(row?.sales_import_batches) ? row.sales_import_batches[0] : row?.sales_import_batches
  if (row && batch) {
    // Whom it goes to, as the database asked it — never the browser's word.
    const { data: checks, error: checksError } = await supabase.rpc('revenue_seller_checks', {
      p_sub_department: batch.sub_department_id, p_period: row.period_month,
    })
    if (checksError) throw new Error(`Could not read the move: ${checksError.message}`)
    const asked = sellerChecksFromRow(checks).find(c => c.orderId === orderId && c.kind === 'erp_moved')
    const goesTo = keep ? asked?.move?.from.staffId : asked?.move?.to.staffId
    if (goesTo && goesTo !== row.staff_id) {
      const reason = await staffClosedReason(supabase, goesTo, batch.sub_department_id, row.period_month)
      if (reason) return { ok: false, reason }
    }
  }

  const { data, error } = await supabase.rpc('revenue_answer_seller_move', { p_order_id: orderId, p_keep: keep, p_note: said || null })
  if (error) {
    if ((error.code && SAID.has(error.code)) || error.message?.startsWith('Read-only')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  revalidatePath('/revenue', 'layout')
  revalidatePath('/member')
  const answer = sellerAnswerFromRow(data)
  return answer ? { ok: true, answer } : { ok: false, reason: 'It was saved — refresh the page to see it.' }
}
