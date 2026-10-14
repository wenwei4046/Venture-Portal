import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadConfig, loadLedger } from '@/lib/attendance/server'
import { officeToday } from '@/lib/office-time'
import ReadinessView from '../_components/ReadinessView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Readiness (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it; nothing on it writes. */
export default async function Page() {
  await requirePage('/attendance/readiness')
  await requirePermission('attendance')
  const today = officeToday()
  const [config, ledger] = await Promise.all([loadConfig(), loadLedger(Number(today.slice(0, 4)))])
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Readiness" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  return <ReadinessView config={config.data} ledger={ledger.ok ? ledger.data : null} today={config.data.today} />
}
