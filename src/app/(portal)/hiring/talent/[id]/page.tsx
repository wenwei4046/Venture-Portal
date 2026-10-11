import { notFound } from 'next/navigation'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadHiringBoard } from '@/lib/hiring/board'
import TalentPage from '../../_components/TalentPage'

export const dynamic = 'force-dynamic'

/** A talent's own page (README §13, portal-36). */
export default async function TalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/hiring/talent/[id]')
  const user = await requirePermission('hiring')
  const { id } = await params
  const read = await loadHiringBoard()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  const talent = read.board.talents.find(t => t.id === id)
  if (!talent) notFound()
  return <TalentPage board={read.board} talent={talent} can={{ create: canDo(user, 'hiring', 'create'), edit: canDo(user, 'hiring', 'edit') }} />
}
