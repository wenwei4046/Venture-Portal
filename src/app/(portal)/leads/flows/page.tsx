import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadAutoCategories, loadFlows, loadLeadConfig } from '@/lib/leads/server'
import AutomationsView from '../_components/AutomationsView'

export const dynamic = 'force-dynamic'

/** Lead View › Automations (2026-10-16): categories, templates and their forms. Lead View · View reads it; Manage edits. */
export default async function Page() {
  await requirePage('/leads/flows')
  const user = await requirePermission('leads')
  const [config, flows, categories] = await Promise.all([loadLeadConfig(), loadFlows(), loadAutoCategories()])
  if (!config.ok || !flows.ok || !categories.ok) {
    const reason = !config.ok ? config.reason : !flows.ok ? flows.reason : !categories.ok ? categories.reason : null
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Automations" />
        <div className="sheet-danger">{reason}</div>
      </HvPage>
    )
  }
  return <AutomationsView flows={flows.data} categories={categories.data} brands={config.data.brands} canManage={canDo(user, 'leads', 'manage')} />
}
