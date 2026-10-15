'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { baRecordModel, type BaRecordModel } from '@/lib/fin-app/ba-model'
import { readBaFacility } from './_lib/ba-read'

/**
 * A financing as the Finance phone app's record screen opens it (2026-10-15,
 * part 5c): on a phone that screen IS the financing's page, so it reads what
 * `/ba/[id]` reads, behind its gates — the treasury, the page's tabs — and says
 * what this reader may do with it (that page's boxes, as the actions ask them).
 * Answered in words.
 */
export async function openBaFinancing(id: string): Promise<{ ok: true; record: BaRecordModel } | { ok: false; reason: string }> {
  const user = await requirePermission('treasury')
  if (!opensPage(user.tabs, '/ba/[id]')) return { ok: false, reason: 'Invoice Financing is not open to you.' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/ba/[id]') } : user
  const supabase = (await createClient()) as unknown as SupabaseClient
  const facility = await readBaFacility(supabase, id)
  if (!facility) return { ok: false, reason: 'This financing is not there any more.' }
  return {
    ok: true,
    record: baRecordModel(facility, officeToday(), {
      create: canDo(acting, 'treasury', 'create'),
      edit: canDo(acting, 'treasury', 'edit'),
      void: canDo(acting, 'treasury', 'void'),
    }),
  }
}
