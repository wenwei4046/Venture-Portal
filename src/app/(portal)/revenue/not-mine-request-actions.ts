'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pushSoon } from '@/lib/push/outbox'
import { notMineRequestFromRow, type NotMineRequest } from '@/lib/member/not-mine-requests'

/**
 * Comm Cal › the month › Requests — Not my order (2026-11-14 — the user: a salesperson writes a request "not my order"
 * from the Revenue app, "and then HR approve。这样它就会直接变成是完完全全 don't count 的形式"): HR approves — the bill is
 * taken out exactly as *Don't count this bill* takes it out, in HR's name — or rejects it, saying why. The rule is the
 * database's (`revenue_not_mine_decide`, mig 20261114210000), under the caller's own session: Revenue · Edit, on this
 * page's tab. A refusal is RETURNED — production hands the browser only a digest of what an action throws.
 */
export type NotMineDecision = { ok: true; request: NotMineRequest } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The function's own refusals (decided, not open to you, a reason missing, the bill moved) and Don't count's (a paid month, out already). */
const SAID = new Set(['22023', '42501', '23RUN', '23EXC'])

export async function decideNotMineRequest(id: string, approve: boolean, note: string | null): Promise<NotMineDecision> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, reason: 'That request is not there.' }
  if (typeof approve !== 'boolean') return { ok: false, reason: 'Approve or reject.' }
  const said = typeof note === 'string' ? note.trim() : ''
  if (said.length > 500) return { ok: false, reason: 'Keep the note to 500 characters.' }
  if (!approve && !said) return { ok: false, reason: 'Say why it is rejected — the salesperson reads it.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('revenue_not_mine_decide', { p_request: id, p_approve: approve, p_note: said || null })
  if (error) {
    if ((error.code && SAID.has(error.code)) || error.message?.startsWith('Read-only')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  const request = notMineRequestFromRow(data)
  revalidatePath('/revenue', 'layout')
  revalidatePath('/member')
  pushSoon()
  return request ? { ok: true, request } : { ok: false, reason: 'It was saved — refresh the page to see it.' }
}
