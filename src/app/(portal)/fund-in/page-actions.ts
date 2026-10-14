'use server'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { opensPage } from '@/lib/page-tabs'
import { loadSourcePage, type SourcePageModel } from './[id]/_lib/source-page'

/**
 * A fund source as the Finance phone app's record screen opens it
 * (2026-10-15 — M14): on a phone that screen IS the fund source's page, so it
 * reads what the full page reads (`loadSourcePage` — the schedule, the
 * repayments, the terms over time, the settings and notes, Record repayment's
 * lists, the trail and the audit log, what this reader may do), behind the
 * same gates: Treasury, and the fund source page's tabs. Answered in words,
 * never thrown.
 */
export async function openSourcePage(id: string): Promise<{ ok: true; page: SourcePageModel } | { ok: false; reason: string }> {
  const user = await requirePermission('treasury')
  if (!opensPage(user.tabs, '/fund-in/[id]')) return { ok: false, reason: 'Fund IN is not open to you.' }
  const supabase = await createClient()
  const page = await loadSourcePage(supabase, user, id)
  if (!page) return { ok: false, reason: 'This fund source is not there any more.' }
  return { ok: true, page }
}
