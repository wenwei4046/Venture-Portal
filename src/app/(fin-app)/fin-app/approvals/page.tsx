import dayjs from 'dayjs'
import { redirect } from 'next/navigation'
import { requireApprovalQueue, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { approvalHubModel, decidedRows } from '@/lib/fin-app/approval-model'
import { hasApprovalsTab } from '@/lib/fin-app/server'
import { readApprovalQueue, readDecidedSince } from '@/app/(portal)/approvals/_lib/queue-read'
import { openApprovalRequest } from '@/app/(portal)/approvals/page-actions'
import ApprovalsApp from '@/components/fin-app/ApprovalsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/approvals` — the Principal's own Approvals TAB in the Finance phone
 * app (2026-10-17 — the user: "the mobile use the same view with finance app …
 * just add on then tab for approval tab"): Daily › Approvals' own screen
 * (`/fin-app/page/approvals`, the same reads and gates) as a tab's root, the
 * tab bar under its hub; its lists and requests pushed over it. A reader with
 * no such tab (Finance's view) is sent to the page.
 */
export default async function FinAppApprovalsTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/approvals')
  const user = await requireApprovalQueue()
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  if (!hasApprovalsTab(user)) redirect(`/fin-app/page/approvals${search ? `?${search}` : ''}`)
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
  return <ApprovalsApp tab hub={hub} search={search} record={read && read.ok ? read.record : null} refused={read && !read.ok ? read.reason : null} />
}
