import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { DEFAULT_HOURS } from '@/lib/leads/info'
import { NOT_SET_UP, loadHours } from '@/lib/leads/server'
import HoursView from '../_components/HoursView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Business hours (2026-10-22, redesign v2 step 3; mig 20261022230000). Lead View · View reads it; its Edit
 * box (Lead View · Manage) saves. Before the migration is applied it shows the default week and cannot save.
 */
export default async function Page() {
  await requirePage('/leads/hours')
  const user = await requirePermission('leads')
  const hours = await loadHours()
  if (!hours.ok && hours.reason !== NOT_SET_UP) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Business hours" />
        <div className="sheet-danger">{hours.reason}</div>
      </HvPage>
    )
  }
  return <HoursView hours={hours.ok ? hours.data : DEFAULT_HOURS} ready={hours.ok} today={officeToday()} canEdit={canDo(user, 'leads', 'manage')} />
}
