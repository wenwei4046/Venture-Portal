import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadHiringBoard } from '@/lib/hiring/board'
import TalentBankView from '../_components/TalentBankView'

export const dynamic = 'force-dynamic'

/**
 * Hiring › Talent Bank (2026-10-11, HR revamp round 2 — README §13): good
 * candidates kept on file. Hiring · View reads it; Create adds a talent,
 * Edit removes one.
 */
export default async function TalentBankPage() {
  await requirePage('/hiring/talent')
  const user = await requirePermission('hiring')
  const read = await loadHiringBoard()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <TalentBankView board={read.board} can={{ create: canDo(user, 'hiring', 'create'), edit: canDo(user, 'hiring', 'edit') }} />
}
