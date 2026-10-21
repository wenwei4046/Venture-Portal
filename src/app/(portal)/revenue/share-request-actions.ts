'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pushSoon } from '@/lib/push/outbox'
import { shareRequestFromRow, type ShareRequest } from '@/lib/member/share-requests'

/**
 * Comm Cal › the month › Requests (2026-10-21 — the user: "在 Double claims 旁边加一个 Requests … HR 按 Approve 之后，
 * 那张单就会自动 share"): HR approves a share request every colleague it names has accepted — the shares are written as
 * Share this bill writes them, and the bill's sales, KPI items and commission are split from then on — or rejects it,
 * saying why. The rule is the database's (`revenue_share_request_decide`, mig 20261021150100), under the caller's own
 * session: Revenue · Edit, on this page's tab. A refusal is RETURNED — production hands the browser only a digest of what
 * an action throws.
 */
export type ShareDecision = { ok: true; request: ShareRequest } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The function's own refusals (closed, not open to you, a reason missing, the bill moved) and the share table's. */
const SAID = new Set(['22023', '42501', '23RUN', '23SHR'])

export async function decideShareRequest(id: string, approve: boolean, note: string | null): Promise<ShareDecision> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'That share request is not there.' }
  if (typeof approve !== 'boolean') return { ok: false, reason: 'Approve or reject.' }
  const said = typeof note === 'string' ? note.trim() : ''
  if (said.length > 500) return { ok: false, reason: 'Keep the note to 500 characters.' }
  if (!approve && !said) return { ok: false, reason: 'Say why it is rejected — the salespeople read it.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('revenue_share_request_decide', { p_request: id, p_approve: approve, p_note: said || null })
  if (error) {
    if ((error.code && SAID.has(error.code)) || error.message?.startsWith('Read-only')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  const request = shareRequestFromRow(data)
  revalidatePath('/revenue', 'layout')
  revalidatePath('/member')
  pushSoon()
  return request ? { ok: true, request } : { ok: false, reason: 'It was saved — refresh the page to see it.' }
}
