import { notFound } from 'next/navigation'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadHiringBoard } from '@/lib/hiring/board'
import RequestPage from '../../_components/RequestPage'

export const dynamic = 'force-dynamic'

/** A hiring request's own page (README §11, portal-31). */
export default async function HiringRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/hiring/requests/[id]')
  const user = await requirePermission('hiring')
  const { id } = await params
  const read = await loadHiringBoard()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Requests" title="Hiring requests" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  const request = read.board.requests.find(r => r.id === decodeURIComponent(id))
  if (!request) notFound()
  return (
    <RequestPage
      board={read.board}
      request={request}
      can={{ create: canDo(user, 'hiring', 'create'), edit: canDo(user, 'hiring', 'edit'), approve: canDo(user, 'hiring', 'approve') }}
      talentPage={false}
    />
  )
}
