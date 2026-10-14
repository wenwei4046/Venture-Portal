import { officeMonth, officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canDecide } from '@/lib/approval-domains'
import { canAccessReports } from '@/lib/roles'
import { opensPath } from '@/lib/page-tabs'
import { createClient } from '@/lib/supabase/server'
import { OUT_CARDS, type FundCardKey } from '@/lib/fund-hub'
import { HeadButton } from '@/components/finv/Hub'
import FundHub from '@/components/treasury/FundHub'
import ExportCSVButton from './_components/ExportCSVButton'
import { loadLoanHub } from './_lib/loan-hub'
import { cancelPendingLoan } from './actions'

// Fund OUT (2026-10-15, the Finance revamp v2 — D12 of `.design/fin-r2/handoff`):
// the design's hub for every reader of it — the head (Create fund out, Loan
// aging; Export CSV ours), *Fund out · {Month YYYY}* (what was disbursed this
// office month), the cards the user chose (2026-10-14: All, Active, Overdue,
// Pending approval, Repaid, Cancelled — the loans' own status; Overdue read
// live, an instalment past its day unpaid), the list beside them, a loan's
// drawer on a press. A loan's own page (/fund-out/[id]) keeps its schedule,
// its repayments and the rest of what it always did.

interface Props {
  searchParams: Promise<{ status?: string }>
}

// The old tabs' words still land on their card (the Overview's Overdue alert, a kept link).
const OLD: Readonly<Record<string, FundCardKey>> = { fully_repaid: 'repaid' }

export default async function FundOutPage({ searchParams }: Props) {
  await requirePage('/fund-out')
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const { status } = await searchParams
  const today = officeToday()

  const loans = await loadLoanHub(supabase, today)
  // A pending loan's request is decided by whoever holds Treasury's Approve (or the queue's), never its own raiser unless the Principal.
  const records = loans.map((r) => ({ ...r, decidable: !!r.approval && canDecide(user, ['new_loan'], r.approval.submittedBy ? [r.approval.submittedBy] : []) }))

  const wanted = OLD[status ?? ''] ?? status ?? 'all'
  const initialCard = (OUT_CARDS as ReadonlyArray<string>).includes(wanted) ? (wanted as FundCardKey) : 'all'
  // Recording a loan raises one (Treasury · Create); the CSV is an export; amending a booked loan is Treasury · Approve.
  const canRaise = canDo(user, 'treasury', 'create')

  return (
    <FundHub
      side="out"
      records={records}
      month={officeMonth()}
      today={today}
      initialCard={initialCard}
      canSetDefault={canRaise}
      can={{ edit: canDo(user, 'treasury', 'edit'), void: canDo(user, 'treasury', 'void'), amend: canDo(user, 'treasury', 'approve') }}
      onWithdraw={cancelPendingLoan}
      head={
        <>
          {canRaise ? (
            <HeadButton primary href="/fund-out/new">
              Create fund out
            </HeadButton>
          ) : null}
          {canAccessReports(user) && opensPath(user.tabs, '/reports/loan-aging') ? <HeadButton href="/reports/loan-aging">Loan aging</HeadButton> : null}
          {canDo(user, 'treasury', 'export') ? <ExportCSVButton /> : null}
        </>
      }
    />
  )
}
