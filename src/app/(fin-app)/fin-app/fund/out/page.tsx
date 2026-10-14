import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canDecide } from '@/lib/approval-domains'
import { canAccessReports } from '@/lib/roles'
import { opensPath } from '@/lib/page-tabs'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { loadLoanHub } from '@/app/(portal)/fund-out/_lib/loan-hub'
import { openLoanPage } from '@/app/(portal)/fund-out/page-actions'
import FundApp from '@/components/fin-app/FundApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/fund/out` — Fund › Fund out in the Finance phone app (2026-10-15,
 * M13): Fund OUT's own page asked first (its tabs, Treasury), the desktop
 * hub's read (`loadLoanHub`, a pending loan decidable as the hub decides it),
 * each button asking what its action asks, and — a link or a refresh landing
 * on a loan (`?id=`) — its page read with it, so nothing is asked after the
 * navigation (speed.md).
 */
export default async function FinAppFundOut({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/fund-out')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const today = officeToday()
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [loans, read] = await Promise.all([loadLoanHub(supabase, today), id ? openLoanPage(id) : Promise.resolve(null)])
  // A pending loan's request is decided by whoever holds Treasury's Approve (or the queue's), never its own raiser unless the Principal.
  const records = loans.map((r) => ({ ...r, decidable: !!r.approval && canDecide(user, ['new_loan'], r.approval.submittedBy ? [r.approval.submittedBy] : []) }))
  return (
    <FundApp
      side="out"
      records={records}
      month={officeMonth()}
      today={today}
      search={search}
      can={{
        create: canDo(user, 'treasury', 'create'),
        edit: canDo(user, 'treasury', 'edit'),
        void: canDo(user, 'treasury', 'void'),
        amend: canDo(user, 'treasury', 'approve'),
        loanAging: canAccessReports(user) && opensPath(user.tabs, '/reports/loan-aging'),
        export: canDo(user, 'treasury', 'export'),
      }}
      page={read && read.ok ? { side: 'out', loan: read.page } : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
