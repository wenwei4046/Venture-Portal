import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { closeMonthOf } from '@/lib/attendance/close'
import { monthDays, trackedPeople } from '@/lib/attendance/engine'
import { payrollMarksFor } from '@/lib/attendance/payroll-write'
import { loadBoard, loadRequests } from '@/lib/attendance/server'
import CloseView from '../_components/CloseView'

export const dynamic = 'force-dynamic'

/**
 * HR › Attendance › Month close (2026-10-15, the handoff "Attendance Prototype Design"): the office's month, or
 * `?m=YYYY-MM`. Attendance · View reads it; deciding days, closing and reopening ask Attendance · Edit. Once
 * closed, a reader of HR Costing also sees where each HQ person's payroll stands (lib/attendance/payroll-write.ts).
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
  const { config, month: facts } = board.data
  const closedAt = facts.close?.status === 'closed' ? facts.close.closedAt : null
  const people = trackedPeople({ config, month: facts, today: config.today, now: config.now }, monthDays(month))
  const payroll = closedAt ? await payrollMarksFor(month, closedAt, people.map(p => ({ staffId: p.id, name: p.name }))) : null
  return <CloseView config={config} month={facts} requests={requests.data} today={config.today} now={config.now} payroll={payroll} />
}
