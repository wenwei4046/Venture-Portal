import { officeMonth, officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canDecide } from '@/lib/approval-domains'
import { createClient } from '@/lib/supabase/server'
import { IN_CARDS, type FundCardKey } from '@/lib/fund-hub'
import FundInHub from './_components/FundInHub'
import { loadSourceHub } from './_lib/source-hub'

// Fund IN (2026-10-15, the Finance revamp v2 — D12 of `.design/fin-r2/handoff`,
// read for Fund IN): the design's hub for every reader of it — *Record fund
// in* (its dialog on the page), *Fund in · {Month YYYY}* (what came in this
// office month), the cards the user chose (2026-10-14: All, each source type —
// Subsidiary, Director saving, Director loan, Dept pool, Outsource — and
// Pending approval), the list beside them, a fund source's drawer on a press.
// Its own page (/fund-in/[id]) keeps its schedule, its repayments and the rest
// of what it always did.

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function FundInPage({ searchParams }: Props) {
  await requirePage('/fund-in')
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const { status } = await searchParams

  const sources = await loadSourceHub(supabase)
  // A pending source's request is decided by whoever holds Treasury's Approve (or the queue's), never its own raiser unless the Principal.
  const records = sources.map((r) => ({ ...r, decidable: !!r.approval && canDecide(user, ['new_fund_source'], r.approval.submittedBy ? [r.approval.submittedBy] : []) }))

  const initialCard = (IN_CARDS as ReadonlyArray<string>).includes(status ?? '') ? (status as FundCardKey) : 'all'
  // Recording a fund source raises one (Treasury · Create); Edit edits, Withdraw voids, amending a booked one is Treasury · Approve.
  const canRaise = canDo(user, 'treasury', 'create')

  return (
    <FundInHub
      records={records}
      month={officeMonth()}
      today={officeToday()}
      initialCard={initialCard}
      canSetDefault={canRaise}
      can={{ edit: canDo(user, 'treasury', 'edit'), void: canDo(user, 'treasury', 'void'), amend: canDo(user, 'treasury', 'approve') }}
      canCreate={canRaise}
    />
  )
}
