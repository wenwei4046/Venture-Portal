'use server'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { opensPage } from '@/lib/page-tabs'
import { loadLoanPage, type LoanPageModel } from './[id]/_lib/loan-page'

/**
 * A loan as the Finance phone app's record screen opens it (2026-10-15 —
 * M13): on a phone that screen IS the loan's page, so it reads what the full
 * page reads (`loadLoanPage` — the schedule, the repayments, the terms over
 * time, the settings, the trail and the audit log, what this reader may do),
 * behind the same gates: Treasury, and the loan page's tabs. Answered in
 * words, never thrown — production reduces a thrown message to a digest.
 */
export async function openLoanPage(id: string): Promise<{ ok: true; page: LoanPageModel } | { ok: false; reason: string }> {
  const user = await requirePermission('treasury')
  if (!opensPage(user.tabs, '/fund-out/[id]')) return { ok: false, reason: 'Fund OUT is not open to you.' }
  const supabase = await createClient()
  const page = await loadLoanPage(supabase, user, id)
  if (!page) return { ok: false, reason: 'This loan is not there any more.' }
  return { ok: true, page }
}
