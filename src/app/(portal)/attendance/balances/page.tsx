import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadConfig, loadLedger } from '@/lib/attendance/server'
import BalancesView from '../_components/BalancesView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Leave balances (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/balances')
  await requirePermission('attendance')
  const [config, ledger] = await Promise.all([loadConfig(), loadLedger(Number(officeToday().slice(0, 4)))])
  const fail = !config.ok ? config.reason : !ledger.ok ? ledger.reason : null
  if (fail || !config.ok || !ledger.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Leave balances" />
        <div className="sheet-danger">{fail}</div>
      </HvPage>
    )
  }
  return <BalancesView config={config.data} ledger={ledger.data} />
}
