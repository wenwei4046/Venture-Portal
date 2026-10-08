'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { ERP_SYNC_SECRET_MIN_LENGTH } from '@/lib/erp-sync/auth'
import { keyHint } from '@/lib/erp-sync/format'
import { dropFeedKey, putFeedKey } from '@/lib/erp-sync/feed-key'
import { assertErpSubDepartment } from './_lib/erp-link'

/**
 * The ERP's feed key, from the Comm Cal page: paste it, forget it.
 *
 * The ERP's Venture Portal Feed page generates the key and sends every changed
 * sales order with it; pasting it here is what lets the receiver accept those
 * deliveries. There is nothing to "test" from this side — the ERP's own Test
 * connection button calls the receiver's health endpoint with the key, and
 * the ERP live feed panel below shows the first delivery when it lands.
 *
 * erp_links postdates database.types.ts — untyped-client convention.
 */

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** The link form: the key → Vault, and a row saying who pasted it. */
export async function linkErpKey(fd: FormData): Promise<void> {
  const user = await requireAction('revenue', 'manage')
  const subDepartmentId = String(fd.get('sub_department_id') ?? '').trim()
  const key = String(fd.get('api_key') ?? '').trim()
  if (!subDepartmentId) throw new Error('No sub-department')
  if (key.length < ERP_SYNC_SECRET_MIN_LENGTH) {
    throw new Error(`Paste the whole key — the ERP's is longer than ${ERP_SYNC_SECRET_MIN_LENGTH} characters`)
  }

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  await putFeedKey(subDepartmentId, key)

  const now = new Date().toISOString()
  const { error } = await supabase.from('erp_links').upsert(
    {
      sub_department_id: subDepartmentId,
      key_hint: keyHint(key),
      linked_by: user.id,
      linked_by_name: user.name,
      linked_at: now,
      updated_at: now,
    },
    { onConflict: 'sub_department_id' },
  )
  if (error) throw new Error(`The key was stored but the link could not be saved: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}

/**
 * The feed window: the earliest order date the portal will keep.
 *
 * The ERP back-fills its whole history when a feed is switched on and keeps
 * pushing edits to documents from years the portal has no use for. Its own
 * `vp.since` is meant to stop that; this is the portal's half, so a month that
 * was deleted here stays deleted whatever the ERP is configured to send.
 * Deliveries from before it are answered 200 `skipped` — a successful delivery
 * the portal declined to keep, so the ERP's outbox never wedges.
 *
 * erp_feed_settings postdates database.types.ts — untyped-client convention.
 */
export async function setErpFeedWindow(fd: FormData): Promise<void> {
  const user = await requireAction('revenue', 'manage')
  const subDepartmentId = String(fd.get('sub_department_id') ?? '').trim()
  if (!subDepartmentId) throw new Error('No sub-department')

  const raw = String(fd.get('min_order_date') ?? '').trim()
  if (raw !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('Give the date as YYYY-MM-DD, or leave it empty to accept everything')
  }

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  const { error } = await supabase.from('erp_feed_settings').upsert(
    {
      sub_department_id: subDepartmentId,
      min_order_date: raw === '' ? null : raw,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      updated_by_name: user.name,
    },
    { onConflict: 'sub_department_id' },
  )
  if (error) throw new Error(`Could not save the feed window: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}

/** Forget the key. The ERP's deliveries answer 401 from here on; nothing already received changes. */
export async function unlinkErpKey(subDepartmentId: string): Promise<void> {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  const { error } = await supabase.from('erp_links').delete().eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not unlink: ${error.message}`)
  await dropFeedKey(subDepartmentId)

  revalidatePath('/revenue', 'layout')
}
