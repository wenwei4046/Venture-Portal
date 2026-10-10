import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadHiringBoard } from '@/lib/hiring/board'
import HiringRequestsView from '../_components/HiringRequestsView'

export const dynamic = 'force-dynamic'

/**
 * Hiring › Requests (2026-10-11, HR revamp round 2 — README §11): the review
 * inbox, every request, and Form settings. Hiring · View opens it; each button
 * asks its own cell (Create files a request, Approve decides one, Edit changes
 * the form).
 */
export default async function HiringRequestsPage() {
  await requirePage('/hiring/requests')
  const user = await requirePermission('hiring')
  const read = await loadHiringBoard()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Requests" title="Hiring requests" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return (
    <HiringRequestsView
      board={read.board}
      can={{ create: canDo(user, 'hiring', 'create'), edit: canDo(user, 'hiring', 'edit'), approve: canDo(user, 'hiring', 'approve') }}
    />
  )
}
