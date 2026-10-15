'use server'

import { requireApprovalQueue } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { approvalRecordModel, type ApprovalRecordModel } from '@/lib/fin-app/approval-model'
import { readApprovalRequest } from './_lib/request-read'

/**
 * A request as the Finance phone app's Approvals opens it (2026-10-15, part 5):
 * on a phone that screen IS the request's page, so it reads what `/approvals/[id]`
 * reads (`readApprovalRequest` — the request, who sent it, who may decide it, its
 * loan or its voucher and the bank's balance), behind the queue's gates: whoever
 * may see the queue or decide in it, with a page of Approvals' tabs open, its
 * decisions narrowed by that page's boxes. Answered in words, never thrown —
 * production reduces a thrown message to a digest.
 */
export async function openApprovalRequest(id: string): Promise<{ ok: true; record: ApprovalRecordModel } | { ok: false; reason: string }> {
  const user = await requireApprovalQueue()
  if (!opensPage(user.tabs, '/approvals')) return { ok: false, reason: 'Approvals is not open to you.' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/approvals') } : user
  const supabase = await createClient()
  const read = await readApprovalRequest(supabase, acting, id)
  if (!read.found) return { ok: false, reason: 'This request is not there any more — or it is not yours to see.' }
  return { ok: true, record: approvalRecordModel(read) }
}
