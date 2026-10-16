import type { SupabaseClient } from '@supabase/supabase-js'
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

async function rpc<T>(fn: string, args: Record<string, unknown>, parse: (raw: unknown) => T | null, what: string): Promise<Read<T>> {
  try {
    const { data, error } = await db().rpc(fn, args)
    if (error) return { ok: false, reason: error.code === '42501' && error.message ? error.message : `${what} could not be read. Please try again.` }
    const out = parse(data)
    return out == null ? { ok: false, reason: `${what} could not be read. Please try again.` } : { ok: true, data: out }
  } catch {
    return { ok: false, reason: `${what} could not be read. Please try again.` }
  }
}

/** Just today: the top bar's button, the Finance app's Me card. */
export const readToday = () => rpc<MeToday>('att_me_today', {}, meTodayOf, 'Today')

/** One's own month (this one when `month` is null), requests, leave and settings. */
export const readMe = (month: string | null = null) => rpc<MeData>('att_me', { p_month: month }, meDataOf, 'Your attendance')

export const readTeam = () => rpc<MeTeam>('att_my_team', {}, raw => meTeamOf(raw), 'Your team')

export const readOrg = () => rpc<MeOrg>('att_my_org', {}, raw => meOrgOf(raw), 'The hierarchy')

/** One's People record — `record: null` for a login no People record names. */
export const readRecord = () => rpc<{ record: MeRecord | null }>('my_record', {}, raw => ({ record: meRecordOf(raw) }), 'Your record')

export const readPayslips = () => rpc<MePayslip[]>('my_payslips', {}, raw => payslipsOf(raw), 'Your payslips')

export const readDocuments = () => rpc<MyDocuments>('my_documents', {}, myDocumentsFromRow, 'Your documents')

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
  const { error } = await db().storage.from('attendance').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: msg.startsWith('Read-only') ? msg : 'The file could not go up. Please try again.' }
  }
  return { ok: true, path }
}
