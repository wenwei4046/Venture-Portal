import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadConfig, loadLedger, loadRequests } from '@/lib/attendance/server'
import RequestsView from '../_components/RequestsView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Requests (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/requests')
  await requirePermission('attendance')
  const [config, requests, ledger] = await Promise.all([loadConfig(), loadRequests(), loadLedger(Number(officeToday().slice(0, 4)))])
  if (!config.ok || !requests.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Requests" />
        <div className="sheet-danger">{!config.ok ? config.reason : !requests.ok ? requests.reason : ''}</div>
      </HvPage>
    )
  }
  return <RequestsView config={config.data} requests={requests.data} ledger={ledger.ok ? ledger.data : null} />
}
