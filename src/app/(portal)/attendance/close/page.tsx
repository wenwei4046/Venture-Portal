import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard } from '@/lib/attendance/server'
import CloseView from '../_components/CloseView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Month close (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/close')
  await requirePermission('attendance')
  const read = await loadBoard(officeToday())
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Month close" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <CloseView {...read.data} />
}
