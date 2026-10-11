'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'

/**
 * Drops and upsells the ERP finds on settled bills (2026-09-26): each waits in
 * `comm_upsales` until somebody pays it into a month or lets the ERP's figure
 * stand. It is paid at the salesperson's own rate and moves their upline's
 * override the same way (`lib/commission/upsales.ts`).
 *
 * HR typed them in by hand from 2026-09-24 until 2026-09-27, when the form went
 * (user: 所有的 order 都只会从 ERP 那边抽过来，这边不需要自己调动 — the only
 * thing adjusted in the portal is whether a bill counts at all). The rows it
 * wrote stay, and still count in their month. The table refuses a month whose
 * run has paid (23RUN) — the check here is so the person answering hears it in
 * words first.
 */

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    throw new Error('Period must be the first of a month, e.g. 2026-08-01')
  }
}

async function assertMonthOpen(supabase: SupabaseClient, subDepartmentId: string, period: string): Promise<void> {
  const { data: locked, error } = await supabase.rpc('commission_order_period_locked', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
  })
  if (error) throw new Error(`Could not check the commission run: ${error.message}`)
  if (locked) {
    throw new Error(`The ${period.slice(0, 7)} month is in payroll, so its drops and upsells cannot change.`)
  }
}

/**
 * Undo a "Pay in …": the change the ERP found goes back to waiting, to be
 * paid in another month or dismissed. Refused once a run has paid it.
 */
export async function reopenErpAdjustment(adjustmentId: string): Promise<void> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  const supabase = await client()

  const { data: row, error: readError } = await supabase
    .from('comm_upsales')
    .select('sub_department_id, period_month, status, source, erp_doc_no, decided_at')
    .eq('id', adjustmentId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) throw new Error('That change is no longer there.')
  const {
    sub_department_id: subDepartmentId, period_month: period, status, source, erp_doc_no: docNo, decided_at: decidedAt,
  } = row as {
    sub_department_id: string
    period_month: string
    status: string
    source: string
    erp_doc_no: string | null
    decided_at: string | null
  }
  if (source !== 'erp' || !docNo) throw new Error('Only a change the ERP found goes back to waiting.')
  if (status !== 'confirmed') throw new Error('That change is not being paid.')

  // Every later answer on the bill was measured from this one: taking it back
  // underneath them would move what they meant.
  const { data: later, error: laterError } = await supabase
    .from('comm_upsales')
    .select('id')
    .eq('sub_department_id', subDepartmentId)
    .eq('erp_doc_no', docNo)
    .in('status', ['confirmed', 'dismissed'])
    .neq('id', adjustmentId)
    .gt('decided_at', decidedAt ?? '1970-01-01T00:00:00Z')
    .limit(1)
  if (laterError) throw new Error(laterError.message)
  if (later && later.length > 0) {
    throw new Error('A later change on this bill has been answered since — only the latest answer can be undone.')
  }

  await assertMonthOpen(supabase, subDepartmentId, period)

  const { error } = await supabase
    .from('comm_upsales')
    .update({ status: 'pending', decided_by: null, decided_at: null })
    .eq('id', adjustmentId)
    .eq('status', 'confirmed')
  if (error) {
    // uq_comm_upsales_pending_erp_doc: one open question per document.
    if (error.code === '23505') {
      throw new Error('The ERP has changed this bill again since — answer the change waiting at the top of the month first.')
    }
    throw new Error(error.message)
  }

  revalidatePath('/revenue', 'layout')
}

/**
 * A drop or upsell the ERP revealed on a settled bill (2026-09-26): pay it in
 * the month HR is working on. It was found in whatever month the ERP saved the
 * document; it is paid in the month somebody says yes.
 */
export async function confirmErpAdjustment(adjustmentId: string, period: string): Promise<void> {
  const user = await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  assertPeriod(period)
  const supabase = await client()

  const { data: row, error: readError } = await supabase
    .from('comm_upsales')
    .select('sub_department_id, status')
    .eq('id', adjustmentId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) throw new Error('That change is no longer waiting — the ERP may have put it back.')
  const { sub_department_id: subDepartmentId, status } = row as { sub_department_id: string; status: string }
  if (status !== 'pending') throw new Error('That change has already been answered.')

  // A month settled by hand, before the portal pays, takes no run: paid into
  // it, the change would never be paid at all (2026-09-27).
  const { data: cutover, error: cutoverError } = await supabase
    .from('comm_cutovers')
    .select('first_paid_month')
    .eq('sub_department_id', subDepartmentId)
    .maybeSingle()
  if (cutoverError) throw new Error(`Could not read when the portal starts paying: ${cutoverError.message}`)
  const firstPaid = (cutover as { first_paid_month: string } | null)?.first_paid_month ?? null
  if (firstPaid && period < firstPaid) {
    throw new Error(`${period.slice(0, 7)} was settled by hand and takes no run — pay this in ${firstPaid.slice(0, 7)} or later.`)
  }

  await assertMonthOpen(supabase, subDepartmentId, period)

  const { error } = await supabase
    .from('comm_upsales')
    .update({ status: 'confirmed', period_month: period, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', adjustmentId)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

/**
 * Not a drop or upsell after all — a correction, a typo in the ERP. The ERP's
 * figure is let stand: saving the document again asks nothing, and the next
 * real change is measured from it.
 */
export async function dismissErpAdjustment(adjustmentId: string): Promise<void> {
  const user = await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  const supabase = await client()

  const { error } = await supabase
    .from('comm_upsales')
    .update({ status: 'dismissed', decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', adjustmentId)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}
