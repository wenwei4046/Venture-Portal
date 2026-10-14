import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard, loadLedger } from '@/lib/attendance/server'
import TodayView from '../_components/TodayView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Today (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/today')
  await requirePermission('attendance')
  const today = officeToday()
  const [read, ledger] = await Promise.all([loadBoard(today), loadLedger(Number(today.slice(0, 4)))])
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Today" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <TodayView {...read.data} ledger={ledger.ok ? ledger.data : null} />
}
