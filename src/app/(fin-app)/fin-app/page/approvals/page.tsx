import dayjs from 'dayjs'
import { requireApprovalQueue, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { approvalHubModel, decidedRows } from '@/lib/fin-app/approval-model'
import { readApprovalQueue, readDecidedSince } from '@/app/(portal)/approvals/_lib/queue-read'
import { openApprovalRequest } from '@/app/(portal)/approvals/page-actions'
import ApprovalsApp from '@/components/fin-app/ApprovalsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/approvals` — Daily › Approvals in the Finance phone app
 * (2026-10-15, part 5): the queue's own page asked first (its tabs, then
 * whoever may see the queue or decide in it), the desktop queue's reads
 * (`readApprovalQueue`), the last 30 days' decisions (the desktop card's
 * figure, as a list), and — a link or a refresh landing on a request
 * (`?id=`) — that request read with the page, so nothing is asked after the
 * navigation (speed.md).
 */
export default async function FinAppApprovals({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/approvals')
  const user = await requireApprovalQueue()
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const since = dayjs().subtract(30, 'day').toISOString()
  const [queue, decided, read] = await Promise.all([
    readApprovalQueue(supabase, user),
    readDecidedSince(supabase, since),
    id ? openApprovalRequest(id) : Promise.resolve(null),
  ])
  const hub = approvalHubModel({
    queue: queue.queue,
    summary: queue.summary,
    undecidable: queue.undecidable,
    executives: queue.executives,
    decided: decidedRows(decided.rows, { amountOf: decided.amountOf, nameOf: decided.nameOf }),
  })
  return <ApprovalsApp hub={hub} search={search} record={read && read.ok ? read.record : null} refused={read && !read.ok ? read.reason : null} />
}
