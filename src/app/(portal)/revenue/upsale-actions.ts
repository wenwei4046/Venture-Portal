'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { parseUpsaleInput } from '@/lib/commission/upsales'

/**
 * Upsales HR records by hand (2026-09-24): an amount a customer added to an
 * earlier order, paid at the salesperson's own rate in the month it is recorded
 * under and counted toward the upline's override. The rules live in
 * `lib/commission/upsales.ts`; the table (`comm_upsales`) refuses a month whose
 * run has paid (23RUN) — the check here is so the person typing hears it in
 * words first.
 */

/** What the form sends, as typed. */
export interface UpsaleForm {
  staffId: string
  /** 'upsale' or 'drop' (2026-09-26). */
  kind: string
  /** Typed positive; the kind gives it its sign. */
  amount: string
  soldOn: string
  fairEventId: string
  originalRef: string
  note: string
}

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
    throw new Error(`The ${period.slice(0, 7)} run has paid. Reopen it before changing its upsales.`)
  }
}

/**
 * Only somebody on this sub-department's ladder is paid by its run — an upsale
 * recorded for anybody else would sit in the table paying nobody.
 */
async function assertMember(supabase: SupabaseClient, subDepartmentId: string, staffId: string): Promise<void> {
  const { data: scheme, error: schemeError } = await supabase
    .from('comm_schemes')
    .select('id')
    .eq('sub_department_id', subDepartmentId)
    .eq('is_active', true)
    .is('effective_to', null)
    .maybeSingle()
  if (schemeError) throw new Error(`Could not read the scheme: ${schemeError.message}`)
  if (!scheme) throw new Error('This sub-department has no active commission scheme.')

  const { data: member, error } = await supabase
    .from('comm_hierarchy')
    .select('staff_id')
    .eq('scheme_id', (scheme as { id: string }).id)
    .eq('staff_id', staffId)
    .is('effective_to', null)
    .limit(1)
  if (error) throw new Error(`Could not read the team: ${error.message}`)
  if (!member || member.length === 0) {
    throw new Error('That person is not on this sub-department’s team, so its run would pay them nothing.')
  }
}

export async function recordUpsale(subDepartmentId: string, period: string, form: UpsaleForm): Promise<void> {
  await requirePermission('revenue')
  assertPeriod(period)
  const input = parseUpsaleInput(form)
  const supabase = await client()

  await assertMonthOpen(supabase, subDepartmentId, period)
  await assertMember(supabase, subDepartmentId, input.staffId)

  const { error } = await supabase.from('comm_upsales').insert({
    sub_department_id: subDepartmentId,
    period_month: period,
    staff_id: input.staffId,
    kind: input.kind,
    amount: input.amount,
    sold_on: input.soldOn,
    fair_event_id: input.fairEventId,
    original_ref: input.originalRef,
    note: input.note,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

export async function updateUpsale(upsaleId: string, form: UpsaleForm): Promise<void> {
  await requirePermission('revenue')
  const input = parseUpsaleInput(form)
  const supabase = await client()

  const { data: row, error: readError } = await supabase
    .from('comm_upsales')
    .select('sub_department_id, period_month, source')
    .eq('id', upsaleId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) throw new Error('That entry is no longer there.')
  const { sub_department_id: subDepartmentId, period_month: period, source } = row as {
    sub_department_id: string
    period_month: string
    source: string
  }
  if (source === 'erp') {
    throw new Error('A change the ERP found is confirmed or dismissed as it stands — record a correction by hand instead.')
  }

  await assertMonthOpen(supabase, subDepartmentId, period)
  await assertMember(supabase, subDepartmentId, input.staffId)

  const { error } = await supabase
    .from('comm_upsales')
    .update({
      staff_id: input.staffId,
      kind: input.kind,
      amount: input.amount,
      sold_on: input.soldOn,
      fair_event_id: input.fairEventId,
      original_ref: input.originalRef,
      note: input.note,
    })
    .eq('id', upsaleId)
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

export async function deleteUpsale(upsaleId: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = await client()

  const { data: row, error: readError } = await supabase
    .from('comm_upsales')
    .select('sub_department_id, period_month, source')
    .eq('id', upsaleId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) return
  const { sub_department_id: subDepartmentId, period_month: period, source } = row as {
    sub_department_id: string
    period_month: string
    source: string
  }
  if (source === 'erp') {
    // Deleted, it would stop counting as settled and come back on the bill's
    // next save — or never, if the ERP never saves it again.
    throw new Error('A change the ERP found is put back to waiting, not deleted.')
  }
  await assertMonthOpen(supabase, subDepartmentId, period)

  const { error } = await supabase.from('comm_upsales').delete().eq('id', upsaleId)
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

/**
 * Undo a "Pay in …": the change the ERP found goes back to waiting, to be
 * paid in another month or dismissed. Refused once a run has paid it.
 */
export async function reopenErpAdjustment(adjustmentId: string): Promise<void> {
  await requirePermission('revenue')
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
  const user = await requirePermission('revenue')
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
  const user = await requirePermission('revenue')
  const supabase = await client()

  const { error } = await supabase
    .from('comm_upsales')
    .update({ status: 'dismissed', decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', adjustmentId)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}
