import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { closeMonthOf } from '@/lib/attendance/close'
import { loadBoard, loadRequests } from '@/lib/attendance/server'
import CloseView from '../_components/CloseView'

export const dynamic = 'force-dynamic'

/**
 * HR › Attendance › Month close (2026-10-15, the handoff "Attendance Prototype Design"): the office's month, or
 * `?m=YYYY-MM`. Attendance · View reads it; deciding days, closing and reopening ask Attendance · Edit.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePage('/attendance/close')
  await requirePermission('attendance')
  const today = officeToday()
  const month = closeMonthOf(today, (await searchParams).m)
  const [board, requests] = await Promise.all([loadBoard(month), loadRequests()])
  const failed = !board.ok ? board.reason : !requests.ok ? requests.reason : null
  if (failed || !board.ok || !requests.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Month close" />
        <div className="sheet-danger">{failed}</div>
      </HvPage>
    )
  }
  return <CloseView config={board.data.config} month={board.data.month} requests={requests.data} today={board.data.config.today} now={board.data.config.now} />
}
