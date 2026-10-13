import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { EMPTY_BANK } from '@/lib/hiring/bank'
import { loadHiringBoard, loadTalentBank } from '@/lib/hiring/board'
import { startRead } from '@/lib/start-read'
import TalentBankView from '../_components/TalentBankView'

export const dynamic = 'force-dynamic'

/**
 * Hiring › Talent Bank (2026-10-11, HR revamp round 2 — README §13): good
 * candidates kept on file — since 2026-10-12 a Drive: company › department ›
 * people, and folders HR makes (mig 20261013030000). Hiring · View reads it;
 * Create adds a folder, a talent or a file, Edit renames, moves and removes.
 * `?in=` opens a place.
 */
export default async function TalentBankPage({ searchParams }: { searchParams: Promise<{ in?: string }> }) {
  await requirePage('/hiring/talent')
  const user = await requirePermission('hiring')
  const boardRead = startRead(loadHiringBoard())
  const bankRead = startRead(loadTalentBank())
  const [read, bank, { in: initialAt }] = await Promise.all([boardRead, bankRead, searchParams])
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return (
    <TalentBankView
      board={read.board}
      bank={bank.ok ? bank.bank : EMPTY_BANK}
      bankError={bank.ok ? null : bank.reason}
      can={{ create: canDo(user, 'hiring', 'create'), edit: canDo(user, 'hiring', 'edit') }}
      initialAt={typeof initialAt === 'string' ? initialAt : undefined}
    />
  )
}
