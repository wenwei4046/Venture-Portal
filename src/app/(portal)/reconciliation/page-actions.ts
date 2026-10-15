'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { fetchReconReport } from '@/lib/recon-report-data'
import { reconReportModel, reconSessionModel, type ReconReportView, type ReconSessionModel } from '@/lib/fin-app/recon-model'
import { readReconSession } from './_lib/recon-read'

/**
 * A month's reconciliation as the Finance phone app's record screen opens it
 * (2026-10-15, part 5c): on a phone that screen IS the session's review page,
 * so it reads what `/reconciliation/[sessionId]` reads, behind its gates —
 * Reconciliation, the page's tabs — and says what this reader may do with it
 * (that page's boxes, as the actions ask them). Answered in words.
 */
export async function openReconSession(id: string): Promise<{ ok: true; record: ReconSessionModel } | { ok: false; reason: string }> {
  const user = await requirePermission('reconciliation')
  if (!opensPage(user.tabs, '/reconciliation/[sessionId]')) return { ok: false, reason: 'Bank Reconciliation is not open to you.' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/reconciliation/[sessionId]') } : user
  const supabase = (await createClient()) as unknown as SupabaseClient
  const read = await readReconSession(supabase, id)
  if (!read) return { ok: false, reason: 'This reconciliation is not there any more.' }
  return { ok: true, record: reconSessionModel(read, { edit: canDo(acting, 'reconciliation', 'edit'), approve: canDo(acting, 'reconciliation', 'approve') }) }
}

/** The month's Reconciliation Report, as its page (and both its files) build it — behind that page's gates. */
export async function openReconReport(id: string): Promise<{ ok: true; report: ReconReportView } | { ok: false; reason: string }> {
  const user = await requirePermission('reconciliation')
  if (!opensPage(user.tabs, '/reconciliation/[sessionId]/report')) return { ok: false, reason: 'The reconciliation report is not open to you.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const report = await fetchReconReport(supabase, id)
  if (!report) return { ok: false, reason: 'This reconciliation is not there any more.' }
  return { ok: true, report: reconReportModel(report) }
}
