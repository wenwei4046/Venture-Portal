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
    .select('sub_department_id, period_month')
    .eq('id', upsaleId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) throw new Error('That upsale is no longer there.')
  const { sub_department_id: subDepartmentId, period_month: period } = row as {
    sub_department_id: string
    period_month: string
  }

  await assertMonthOpen(supabase, subDepartmentId, period)
  await assertMember(supabase, subDepartmentId, input.staffId)

  const { error } = await supabase
    .from('comm_upsales')
    .update({
      staff_id: input.staffId,
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
    .select('sub_department_id, period_month')
    .eq('id', upsaleId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!row) return
  const { sub_department_id: subDepartmentId, period_month: period } = row as {
    sub_department_id: string
    period_month: string
  }
  await assertMonthOpen(supabase, subDepartmentId, period)

  const { error } = await supabase.from('comm_upsales').delete().eq('id', upsaleId)
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}
