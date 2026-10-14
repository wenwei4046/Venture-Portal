import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard, loadLedger } from '@/lib/attendance/server'
import RecordsView from '../_components/RecordsView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Records (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePage('/attendance/records')
  await requirePermission('attendance')
  const { m } = await searchParams
  // ‹ › walk the months (`?m=YYYY-MM`); anything else is the office month.
  const today = officeToday()
  const day = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` : today
  const [read, ledger] = await Promise.all([loadBoard(day), loadLedger(Number(day.slice(0, 4)))])
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Records" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <RecordsView {...read.data} ledger={ledger.ok ? ledger.data : null} />
}
