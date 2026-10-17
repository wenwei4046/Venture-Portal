'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { getAccountUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pushSoon } from '@/lib/push/outbox'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { viewingAsSomebody } from '@/lib/view-as-person'

/**
 * Me's writes (2026-10-17): one's own punch, one's own requests, one's own photo, and an upline's decision on what
 * waits at their own step. No permission cell is asked — what is one's own is one's own, as a password or a memo is
 * (lib/account/actions.ts) — and each database function asks again who the caller is (`att_my_staff_id()`): a punch
 * and a request are filed for the caller's People record only, another person's needs Attendance · Create, a step is
 * decided only by its upline (or by HR with Attendance · Approve). Never while viewing as somebody. Refusals come back
 * as `{ ok: false, reason }`: a thrown message reaches production's browser only as a digest.
 */

export type MeAct<T = Record<string, never>> = { ok: true; data: T } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function refusal(error: PostgrestError, fallback: string): string {
  if (['42501', '22023', 'P0001'].includes(error.code ?? '') && error.message) return error.message
  if (error.code === '23514') return 'Something is not in the right shape.'
  return fallback
}

/** Signed in, active, not viewing as somebody — then the database function, under the caller's own session. */
async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<MeAct<T>> {
  const user = await getAccountUser()
  if (!user?.is_active) return { ok: false, reason: 'Sign in with an active work account.' }
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (!['42501', '22023', 'P0001', '23514'].includes(error.code ?? '')) console.error('[me] refused', JSON.stringify({ fn, code: error.code ?? null }))
    return { ok: false, reason: refusal(error, fallback) }
  }
  // HR's Attendance pages list what changed.
  revalidatePath('/attendance', 'layout')
  return { ok: true, data: (data ?? {}) as T }
}

export interface PunchInput {
  dir: 'in' | 'out'
  lat: number | null
  lng: number | null
  accuracy: number | null
  device: string
  /** punch/<login>/… — filed by the browser first. */
  photoPath: string | null
  reason: string
  /** A phone (the app) or a computer (the portal's top bar): HR sees "From a computer". */
  source: 'app' | 'web'
}

/** Clock in or out (att_punch: the server's time, the nearest fence, the work day). */
export async function mePunch(p: PunchInput): Promise<MeAct<{ id: string; day: string; inside: boolean | null; distance: number | null }>> {
  if (p.dir !== 'in' && p.dir !== 'out') return { ok: false, reason: 'IN or OUT.' }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return call('att_punch', {
    p_direction: p.dir,
    p_lat: num(p.lat),
    p_lng: num(p.lng),
    p_accuracy: num(p.accuracy) == null ? null : Math.round(Number(p.accuracy)),
    p_device: typeof p.device === 'string' ? p.device.slice(0, 120) : '',
    p_photo_path: typeof p.photoPath === 'string' && p.photoPath ? p.photoPath : null,
    p_reason: typeof p.reason === 'string' ? p.reason.slice(0, 200) : '',
    p_source: p.source === 'web' ? 'web' : 'app',
  }, 'The punch did not go in. Please try again.')
}

/** "Before your first punch" — read. */
export async function meAckNotice(): Promise<MeAct> {
  return call('att_punch_notice_ack', {}, 'Please try again.')
}

export interface RequestInput {
  staffId: string
  kind: 'leave' | 'ot' | 'correction' | 'manpower' | 'profile'
  leaveCode?: string | null
  from?: string | null
  to?: string | null
  days?: number | null
  hours?: number | null
  detail?: Record<string, unknown>
  reason: string
}

/** One's own request: leave, overtime, a punch correction, extra manpower, a profile change — it takes its route. */
export async function meSendRequest(r: RequestInput): Promise<MeAct<{ id: string; ref: string }>> {
  if (!UUID.test(r.staffId ?? '')) return { ok: false, reason: 'Your staff record could not be found.' }
  if (!['leave', 'ot', 'correction', 'manpower', 'profile'].includes(r.kind)) return { ok: false, reason: 'Unknown request kind.' }
  if ((r.from && !DATE.test(r.from)) || (r.to && !DATE.test(r.to))) return { ok: false, reason: 'The dates could not be read.' }
  const detail = r.detail && typeof r.detail === 'object' && !Array.isArray(r.detail) ? r.detail : {}
  return call('att_create_request', {
    p_staff: r.staffId, p_kind: r.kind, p_leave_code: r.leaveCode ?? null, p_from: r.from ?? null, p_to: r.to ?? r.from ?? null,
    p_days: typeof r.days === 'number' ? r.days : null, p_hours: typeof r.hours === 'number' ? r.hours : null,
    p_detail: detail, p_reason: typeof r.reason === 'string' ? r.reason.trim().slice(0, 500) : '', p_booked: false,
  }, 'The request could not be sent. Please try again.')
}

/** The medical certificate, filed with the request it belongs to (request/<login>/…). */
export async function meAttach(requestId: string, path: string, name: string): Promise<MeAct> {
  if (!UUID.test(requestId ?? '')) return { ok: false, reason: 'That request is not there.' }
  return call('att_request_attach', { p_request: requestId, p_path: path, p_name: typeof name === 'string' ? name.slice(0, 200) : '' }, 'The file was not filed. Please try again.')
}

/** Withdraw one's own request while it waits. */
export async function meCancel(requestId: string): Promise<MeAct> {
  if (!UUID.test(requestId ?? '')) return { ok: false, reason: 'That request is not there.' }
  return call('att_cancel_request', { p_request: requestId, p_note: '' }, 'The request could not be withdrawn. Please try again.')
}

/** An upline's decision on what waits at their own step (a note is needed to reject). */
export async function meDecide(requestId: string, approve: boolean, note: string): Promise<MeAct<{ status: string }>> {
  if (!UUID.test(requestId ?? '')) return { ok: false, reason: 'That request is not there.' }
  const res = await call<{ status: string }>('att_decide', { p_request: requestId, p_approve: approve === true, p_note: typeof note === 'string' ? note.trim().slice(0, 500) : '' },
    'The request could not be decided. Please try again.')
  // Decided (mig 20261017120000): the database told its person; their phone hears once the answer has gone back.
  if (res.ok && res.data.status !== 'pending') pushSoon()
  return res
}

/** One's photo (the avatar's camera badge): profile/<login>/…, filed by the browser first. */
export async function mePhoto(path: string): Promise<MeAct<{ path: string }>> {
  if (typeof path !== 'string' || !path.startsWith('profile/')) return { ok: false, reason: 'The photo was not filed — choose it again.' }
  return call('my_photo_set', { p_path: path }, 'The photo was not saved. Please try again.')
}
