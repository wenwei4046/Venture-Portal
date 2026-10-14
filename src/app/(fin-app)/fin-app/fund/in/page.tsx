import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canDecide } from '@/lib/approval-domains'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { loadSourceHub } from '@/app/(portal)/fund-in/_lib/source-hub'
import { openSourcePage } from '@/app/(portal)/fund-in/page-actions'
import FundApp from '@/components/fin-app/FundApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/fund/in` — Fund › Fund in in the Finance phone app (2026-10-15,
 * M14): Fund IN's own page asked first (its tabs, Treasury), the desktop
 * hub's read (`loadSourceHub`, a pending source decidable as the hub decides
 * it), each button asking what its action asks, and — a link or a refresh
 * landing on a fund source (`?id=`) — its page read with it.
 */
export default async function FinAppFundIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/fund-in')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [sources, read] = await Promise.all([loadSourceHub(supabase), id ? openSourcePage(id) : Promise.resolve(null)])
  // A pending source's request is decided by whoever holds Treasury's Approve (or the queue's), never its own raiser unless the Principal.
  const records = sources.map((r) => ({ ...r, decidable: !!r.approval && canDecide(user, ['new_fund_source'], r.approval.submittedBy ? [r.approval.submittedBy] : []) }))
  return (
    <FundApp
      side="in"
      records={records}
      month={officeMonth()}
      today={officeToday()}
      search={search}
      can={{
        create: canDo(user, 'treasury', 'create'),
        edit: canDo(user, 'treasury', 'edit'),
        void: canDo(user, 'treasury', 'void'),
        amend: canDo(user, 'treasury', 'approve'),
      }}
      page={read && read.ok ? { side: 'in', source: read.page } : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
