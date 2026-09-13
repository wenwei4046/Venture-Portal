'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
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
  const user = await requirePermission('revenue')
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

/** Forget the key. The ERP's deliveries answer 401 from here on; nothing already received changes. */
export async function unlinkErpKey(subDepartmentId: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  const { error } = await supabase.from('erp_links').delete().eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not unlink: ${error.message}`)
  await dropFeedKey(subDepartmentId)

  revalidatePath('/revenue', 'layout')
}
