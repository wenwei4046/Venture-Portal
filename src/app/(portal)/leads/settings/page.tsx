import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadLeadConfig } from '@/lib/leads/server'
import SettingsView from '../_components/SettingsView'

export const dynamic = 'force-dynamic'

/** Lead View › Settings (2026-10-16): brands, their salespeople, the test enquiry. Lead View · View reads it; Manage edits. */
export default async function Page() {
  await requirePage('/leads/settings')
  const user = await requirePermission('leads')
  const config = await loadLeadConfig()
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Settings" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  return <SettingsView config={config.data} canManage={canDo(user, 'leads', 'manage')} canTest={canDo(user, 'leads', 'create')} />
}
