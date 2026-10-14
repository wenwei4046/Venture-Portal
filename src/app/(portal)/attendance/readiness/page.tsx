import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard } from '@/lib/attendance/server'
import ReadinessView from '../_components/ReadinessView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Readiness (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/readiness')
  await requirePermission('attendance')
  const read = await loadBoard(officeToday())
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Readiness" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <ReadinessView {...read.data} />
}
