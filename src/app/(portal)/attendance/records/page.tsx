import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard } from '@/lib/attendance/server'
import RecordsView from '../_components/RecordsView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Records (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/records')
  await requirePermission('attendance')
  const read = await loadBoard(officeToday())
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Records" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <RecordsView {...read.data} />
}
