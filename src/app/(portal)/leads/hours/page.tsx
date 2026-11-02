import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { DEFAULT_HOURS } from '@/lib/leads/info'
import { NOT_SET_UP, loadAgents, loadHours, loadLeave } from '@/lib/leads/server'
import HoursView from '../_components/HoursView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Working hours (2026-10-22 Business hours, mig 20261022230000; v2 2026-11-02 — On Leave, mig
 * 20261102110000). Lead View · View reads it; its Edit box (Lead View · Manage) saves. Before a migration is applied
 * its part shows the defaults and cannot save.
 */
export default async function Page() {
  await requirePage('/leads/hours')
  const user = await requirePermission('leads')
  const [hours, leave, agents] = await Promise.all([loadHours(), loadLeave(), loadAgents()])
  if (!hours.ok && hours.reason !== NOT_SET_UP) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Working hours" />
        <div className="sheet-danger">{hours.reason}</div>
      </HvPage>
    )
  }
  return (
    <HoursView hours={hours.ok ? hours.data : DEFAULT_HOURS} leave={leave.ok ? leave.data : []} agents={agents.ok ? agents.data : []}
      ready={hours.ok} leaveReady={leave.ok} today={officeToday()} canEdit={canDo(user, 'leads', 'manage')} />
  )
}
