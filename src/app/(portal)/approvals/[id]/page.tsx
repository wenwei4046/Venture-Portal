import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { canSeeApprovals } from '@/lib/approval-domains'
import { createClient } from '@/lib/supabase/server'
import { approvalRecordModel } from '@/lib/fin-app/approval-model'
import ApprovalFullPage from './_components/ApprovalFullPage'
import { readApprovalRequest } from '../_lib/request-read'

// A request's own page (2026-10-17): drawn as Finance's records are (D06 — `ApprovalFullPage`), from the record the
// Approvals drawer and the phone app read (`approvalRecordModel`), decided with their decisions. Who may open it and
// who may decide it are as before: the request's read says (`_lib/request-read`).

interface Props {
  params: Promise<{ id: string }>
}

export default async function ApprovalDetailPage({ params }: Props) {
  const user = await requireAuth()
  const { id } = await params
  const supabase = await createClient()

  // The request, who raised it, who may decide it, its loan or voucher and the
  // bank's balance (`_lib/request-read` — the Finance phone app's read too).
  const read = await readApprovalRequest(supabase, user, id)
  if (!read.found) notFound()

  const back = canSeeApprovals(user) ? { href: '/approvals', label: 'Approvals' } : { href: '/dashboard', label: 'Overview' }
  return <ApprovalFullPage r={approvalRecordModel(read)} back={back} />
}
