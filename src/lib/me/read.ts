import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { myDocumentsFromRow, type MyDocuments } from '@/lib/documentation/personal'
import { meDataOf, meOrgOf, meRecordOf, meTeamOf, meTodayOf, payslipsOf } from './parse'
import type { MeData, MeOrg, MePayslip, MeRecord, MeTeam, MeToday, Read } from './types'

/**
 * Me's reads, straight from the browser (2026-10-17): each is a SECURITY DEFINER reader granted to `authenticated`
 * that answers for `auth.uid()`'s own People record only (mig 20261017100000), so the browser's session is exactly as
 * trustworthy for it as the server's. Not Server Actions: Next runs those one at a time on the router, and a read
 * fired as Me opens would hold up a navigation or the punch behind it (lib/page-view.ts, speed.md). Writes are
 * Server Actions (lib/me/actions.ts).
 */

const db = () => createClient() as unknown as SupabaseClient

function answer<T>(res: { data: unknown; error: PostgrestError | null }, parse: (raw: unknown) => T | null, what: string): Read<T> {
  const fail = `${what} could not be read. Please try again.`
  if (res.error) return { ok: false, reason: res.error.code === '42501' && res.error.message ? res.error.message : fail }
  const out = parse(res.data)
  return out == null ? { ok: false, reason: fail } : { ok: true, data: out }
}

const failed = <T>(what: string): Read<T> => ({ ok: false, reason: `${what} could not be read. Please try again.` })

/** Just today: the top bar's button, the Finance app's Me card. */
export async function readToday(): Promise<Read<MeToday>> {
  try { return answer(await db().rpc('att_me_today'), meTodayOf, 'Today') } catch { return failed('Today') }
}

/** One's own month (this one when `month` is null), requests, leave and settings. */
export async function readMe(month: string | null = null): Promise<Read<MeData>> {
  try { return answer(await db().rpc('att_me', { p_month: month }), meDataOf, 'Your attendance') } catch { return failed('Your attendance') }
}

export async function readTeam(): Promise<Read<MeTeam>> {
  try { return answer(await db().rpc('att_my_team'), raw => meTeamOf(raw), 'Your team') } catch { return failed('Your team') }
}

export async function readOrg(): Promise<Read<MeOrg>> {
  try { return answer(await db().rpc('att_my_org'), raw => meOrgOf(raw), 'The hierarchy') } catch { return failed('The hierarchy') }
}

/** One's People record — `record: null` for a login no People record names. */
export async function readRecord(): Promise<Read<{ record: MeRecord | null }>> {
  try { return answer(await db().rpc('my_record'), raw => ({ record: meRecordOf(raw) }), 'Your record') } catch { return failed('Your record') }
}

export async function readPayslips(): Promise<Read<MePayslip[]>> {
  try { return answer(await db().rpc('my_payslips'), raw => payslipsOf(raw), 'Your payslips') } catch { return failed('Your payslips') }
}

export async function readDocuments(): Promise<Read<MyDocuments>> {
  try { return answer(await db().rpc('my_documents'), myDocumentsFromRow, 'Your documents') } catch { return failed('Your documents') }
}

/** One's own photo (profile/<login>/…), through a link that works for an hour — the bucket's own-folder read. */
export async function photoLink(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const { data } = await db().storage.from('attendance').createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

/** The signed-in login's id: the folder its uploads go into. */
export async function myLoginId(): Promise<string | null> {
  try {
    const { data } = await db().auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

/**
 * A file up into one's own folder of the private `attendance` bucket (punch/<login>/…, request/<login>/…,
 * profile/<login>/…) — the bucket's upload policy takes only one's own folder; the Server Action that names it asks
 * the database whether it arrived.
 */
export async function uploadOwn(folder: 'punch' | 'request' | 'profile', file: Blob, name: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const uid = await myLoginId()
  if (!uid) return { ok: false, reason: 'Your session has ended. Sign in again.' }
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'
  const path = `${folder}/${uid}/${crypto.randomUUID()}-${safe}`
  try {
    const { error } = await db().storage.from('attendance').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) {
      const msg = String((error as { message?: unknown }).message ?? '')
      return { ok: false, reason: msg.startsWith('Read-only') ? msg : 'The file could not go up. Please try again.' }
    }
  } catch {
    return { ok: false, reason: 'The file could not go up. Please try again.' }
  }
  return { ok: true, path }
}
