'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { registerOf } from './engine'
import { attendanceFacts, otHoursOf } from './payroll'
import { sendToPayroll, type PayrollSend } from './payroll-write'
import { loadBoard, loadMonth, loadRequests } from './server'

/**
 * HR › Attendance's writes (2026-10-15). Each stands behind the Attendance
 * cell it is (mig 20261015030000) and calls one of the module's own functions
 * (mig 20261015030200), which asks again. Refusals come back as
 * `{ ok: false, reason }`: a thrown message reaches production's browser only
 * as a digest.
 */

export type AttOutcome<T = unknown> = { ok: true; data: T } | { ok: false; reason: string }

const NO_ACCESS = 'Attendance needs the right permission for that.'

function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return error.message || NO_ACCESS
  if (error.code === 'P0001' || error.code === '22023' || error.code === '23505' || error.code === '23514') {
    return error.code === '23505' ? 'That already exists.' : error.code === '23514' ? 'Something is not in the right shape.' : error.message
  }
  return fallback
}

async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<AttOutcome<T>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: refusal(error, fallback) }
  revalidatePath('/attendance', 'layout')
  revalidatePath('/dashboard')
  return { ok: true, data: data as T }
}

// ── Records (and Today's calendar) ──────────────────────────────────────────

/** People × days to one status; a leave code books leave from Records. */
export async function setDays(staff: string[], from: string, to: string, code: string, inTime: string, outTime: string, note: string) {
  await requireActionOn(['/attendance/records', '/attendance/today'], 'attendance', 'edit')
  return call<{ cells: number }>('att_set_days', { p_staff: staff, p_from: from, p_to: to, p_code: code, p_in: inTime, p_out: outTime, p_note: note },
    'The days could not be changed.')
}

/** Back to what the punches say. */
export async function clearDays(staff: string[], from: string, to: string, note: string) {
  await requireActionOn(['/attendance/records', '/attendance/today'], 'attendance', 'edit')
  return call<{ cells: number }>('att_clear_days', { p_staff: staff, p_from: from, p_to: to, p_note: note }, 'The days could not be changed.')
}

/** A whole day for everyone (H, CH, SO, WD), or back to normal (code null). */
export async function setDayOverride(from: string, to: string, code: string | null, name: string) {
  await requireActionOn('/attendance/records', 'attendance', 'edit')
  return call<{ days: number }>('att_set_day_override', { p_from: from, p_to: to, p_code: code, p_name: name }, 'The day could not be changed.')
}

export async function invalidatePunch(id: string, reason: string) {
  await requireActionOn(['/attendance/records', '/attendance/today'], 'attendance', 'edit')
  return call('att_invalidate_punch', { p_id: id, p_reason: reason }, 'The punch could not be marked invalid.')
}

// ── Requests ────────────────────────────────────────────────────────────────

export interface NewRequest {
  staffId: string
  kind: 'leave' | 'ot' | 'correction' | 'profile'
  leaveCode?: string | null
  from?: string | null
  to?: string | null
  days?: number | null
  hours?: number | null
  detail?: Record<string, unknown>
  reason: string
}

/** HR sends a request on somebody's behalf (it takes its route). */
export async function createRequestOnBehalf(r: NewRequest) {
  await requireActionOn('/attendance/requests', 'attendance', 'create')
  return call<{ id: string; ref: string }>('att_create_request', {
    p_staff: r.staffId, p_kind: r.kind, p_leave_code: r.leaveCode ?? null, p_from: r.from ?? null, p_to: r.to ?? null,
    p_days: r.days ?? null, p_hours: r.hours ?? null, p_detail: r.detail ?? {}, p_reason: r.reason, p_booked: false,
  }, 'The request could not be sent.')
}

/** Decide the waiting step (HR's, or the upline's on their behalf). */
export async function decideRequest(id: string, approve: boolean, note: string) {
  await requireActionOn('/attendance/requests', 'attendance', 'approve')
  return call<{ id: string; ref: string; status: string }>('att_decide', { p_request: id, p_approve: approve, p_note: note }, 'The request could not be decided.')
}

// ── Leave balances ──────────────────────────────────────────────────────────

/** Leave balances › Use leave: booked by HR, approved on the spot, deducted straight away. */
export async function bookLeave(staffId: string, code: string, from: string, to: string, days: number, reason: string) {
  await requireActionOn('/attendance/balances', 'attendance', 'create')
  return call<{ id: string; ref: string }>('att_create_request', {
    p_staff: staffId, p_kind: 'leave', p_leave_code: code, p_from: from, p_to: to, p_days: days, p_hours: null, p_detail: {}, p_reason: reason, p_booked: true,
  }, 'The leave could not be booked.')
}

/** An opening balance or an adjustment (+/−), with its reason. */
export async function addLedger(staffId: string, code: string, year: number, kind: 'opening' | 'adjust', days: number, note: string, detail: Record<string, unknown> = {}) {
  await requireActionOn('/attendance/balances', 'attendance', 'edit')
  return call<{ id: string; ref: string }>('att_ledger_add', { p_staff: staffId, p_code: code, p_year: year, p_kind: kind, p_days: days, p_note: note, p_detail: detail },
    'The balance could not be changed.')
}

// ── Month close ─────────────────────────────────────────────────────────────

export async function decideDay(staffId: string, day: string, decision: 'Unpaid' | 'Excused' | 'Corrected' | null) {
  await requireActionOn('/attendance/close', 'attendance', 'edit')
  return call('att_decide_day', { p_staff: staffId, p_day: day, p_decision: decision }, 'The day could not be decided.')
}

/**
 * Close a month (2026-10-15): the register and what payroll is sent are worked
 * out HERE, from the facts as they stand (never from the page's copy); the
 * month is frozen; then each HQ person's overtime and unpaid days go onto the
 * month's payroll — when the closer may edit payroll (lib/attendance/payroll-write.ts).
 */
export async function closeMonth(month: string): Promise<AttOutcome<{ month: string; people: number; payroll: PayrollSend }>> {
  await requireActionOn('/attendance/close', 'attendance', 'edit')
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, reason: 'The month could not be closed.' }
  const [board, requests] = await Promise.all([loadBoard(month), loadRequests()])
  if (!board.ok) return board
  if (!requests.ok) return requests
  const { config, month: facts } = board.data
  const ctx = { config, month: facts, today: config.today, now: config.now }
  let paid: ReturnType<typeof attendanceFacts>
  try {
    paid = attendanceFacts(ctx, requests.data)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'The month could not be closed.' }
  }
  const closed = await call<{ month: string; people: number }>('att_close_month', { p_month: month, p_register: registerOf(ctx, otHoursOf(ctx, requests.data)) },
    'The month could not be closed.')
  if (!closed.ok) return closed
  // The month is frozen now: whatever payroll answers, the close stands and says so.
  const after = await loadMonth(month)
  const closedAt = after.ok ? after.data.close?.closedAt ?? null : null
  let payroll: PayrollSend = { allowed: true, written: 0, left: [], failed: true }
  if (closedAt) {
    try {
      payroll = await sendToPayroll(month, closedAt, paid)
    } catch {
      // The rows could not be read; Reopen and Close again sends them.
    }
  }
  if (payroll.written) revalidatePath('/hr-costing/payroll', 'layout')
  return { ok: true, data: { ...closed.data, payroll } }
}

export async function reopenMonth(month: string, reason: string) {
  await requireActionOn('/attendance/close', 'attendance', 'edit')
  return call('att_reopen_month', { p_month: month, p_reason: reason }, 'The month could not be reopened.')
}

// ── Settings ────────────────────────────────────────────────────────────────

export type SettingKind = 'schedule' | 'location' | 'holiday' | 'assignment' | 'leave' | 'ot' | 'policy' | 'route'

export async function saveSetting(kind: SettingKind, id: string | null, row: Record<string, unknown>) {
  await requireActionOn('/attendance/settings', 'attendance', 'edit')
  return call<{ id: string; label: string }>('att_save_setting', { p_kind: kind, p_id: id, p_row: row }, 'The setting could not be saved.')
}

export async function deleteSetting(kind: Exclude<SettingKind, 'ot' | 'policy'>, id: string) {
  await requireActionOn('/attendance/settings', 'attendance', 'edit')
  return call<{ id: string; label: string }>('att_delete_setting', { p_kind: kind, p_id: id }, 'The setting could not be deleted.')
}

/** Requests › Approval routes: one route's Upline only / HR only / Upline → HR, from its own tab. */
export async function saveRoute(id: string, row: Record<string, unknown>) {
  await requireActionOn('/attendance/requests', 'attendance', 'edit')
  return call<{ id: string; label: string }>('att_save_setting', { p_kind: 'route', p_id: id, p_row: row }, 'The route could not be saved.')
}
