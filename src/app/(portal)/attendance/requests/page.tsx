import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard } from '@/lib/attendance/server'
import RequestsView from '../_components/RequestsView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Requests (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/requests')
  await requirePermission('attendance')
  const read = await loadBoard(officeToday())
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Requests" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <RequestsView {...read.data} />
}
