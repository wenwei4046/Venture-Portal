'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { safeReason } from '@/lib/hierarchy-writes'

export interface EmployeeOutcome { ok: boolean; note: string | null }

function field(data: FormData, name: string): string {
  const value = data.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function controlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest)
}

async function write(args: {
  p_action: 'move' | 'remove' | 'terminate'
  p_staff_id: string
  p_source_scheme_id: string
  p_destination_kind?: string
  p_destination_id?: string
  p_title_id?: string | null
  p_resignation_date?: string
}): Promise<EmployeeOutcome> {
  try {
    const supabase = (await createClient()) as unknown as SupabaseClient
    const { error } = await supabase.rpc('employee_chart_lifecycle', args)
    if (error) return { ok: false, note: error.code === '23EMP' ? error.message : safeReason(error) }
    revalidatePath('/team', 'layout')
    revalidatePath('/revenue', 'layout')
    revalidatePath('/hr-costing', 'layout')
    revalidatePath('/member', 'layout')
    return { ok: true, note: null }
  } catch (error) {
    if (controlFlow(error)) throw error
    console.error('[employee-chart-lifecycle]', error)
    return { ok: false, note: 'Could not save this employee change. Please try again.' }
  }
}

/** Move is one database transaction: a failed destination cannot remove the source. */
export async function moveEmployee(data: FormData): Promise<EmployeeOutcome> {
  await requirePermission('revenue')
  const destinationKind = field(data, 'destination_kind')
  // requirePermission(a, b) means OR; company changes require BOTH permissions.
  if (destinationKind === 'department') await requirePermission('team')
  const staffId = field(data, 'staff_id')
  const sourceSchemeId = field(data, 'source_scheme_id')
  const destinationId = field(data, 'destination_id')
  const titleId = field(data, 'title_id')
  if (!staffId || !sourceSchemeId || !destinationId || !['department', 'subdepartment'].includes(destinationKind)) {
    return { ok: false, note: 'Choose the employee, their current department and a destination.' }
  }
  if (destinationKind === 'department' && !titleId) return { ok: false, note: 'Choose their title in the receiving department.' }
  return write({ p_action: 'move', p_staff_id: staffId, p_source_scheme_id: sourceSchemeId,
    p_destination_kind: destinationKind, p_destination_id: destinationId, p_title_id: titleId || null })
}

/** A department removal keeps employment and every other membership intact. */
export async function removeEmployeeMembership(data: FormData): Promise<EmployeeOutcome> {
  await requirePermission('revenue')
  const staffId = field(data, 'staff_id')
  const sourceSchemeId = field(data, 'source_scheme_id')
  if (!staffId || !sourceSchemeId) return { ok: false, note: 'Choose the employee and the membership to remove.' }
  return write({ p_action: 'remove', p_staff_id: staffId, p_source_scheme_id: sourceSchemeId })
}

/** Record a completed employment exit without deleting payroll or commission history. */
export async function terminateEmployee(data: FormData): Promise<EmployeeOutcome> {
  await requirePermission('revenue')
  await requirePermission('team')
  const staffId = field(data, 'staff_id')
  const sourceSchemeId = field(data, 'source_scheme_id')
  const date = field(data, 'resignation_date')
  const parsed = new Date(`${date}T00:00:00Z`)
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (!staffId || !sourceSchemeId) return { ok: false, note: 'Choose the employee to terminate.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) {
    return { ok: false, note: 'Choose a valid last working day on or before today.' }
  }
  return write({ p_action: 'terminate', p_staff_id: staffId, p_source_scheme_id: sourceSchemeId, p_resignation_date: date })
}
