'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { opensPage } from '@/lib/page-tabs'
import { loadAllocationPage } from './[id]/_lib/allocation-page'
import type { PageAllocation } from './[id]/_components/AllocationPage'

/**
 * An allocation as the Finance phone app's record screen opens it
 * (2026-10-15 — M12): on a phone that screen IS the allocation's page, so it
 * reads what the full page reads (`loadAllocationPage` — who made it, its
 * audit log), behind the same gates: Billing, and the Billing Allocator's
 * tabs. Answered in words, never thrown.
 */
export async function openAllocationPage(id: string): Promise<{ ok: true; page: PageAllocation } | { ok: false; reason: string }> {
  const user = await requirePermission('billing')
  if (!opensPage(user.tabs, '/billing-allocator/[id]')) return { ok: false, reason: 'The Billing Allocator is not open to you.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const page = await loadAllocationPage(supabase, id)
  if (!page) return { ok: false, reason: 'This allocation is not there any more.' }
  return { ok: true, page }
}
