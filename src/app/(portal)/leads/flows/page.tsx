import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadFlows, loadLeadConfig } from '@/lib/leads/server'
import FlowsView from '../_components/FlowsView'

export const dynamic = 'force-dynamic'

/** Lead View › Flows (2026-10-16, phase 2): the button flows. Lead View · View reads it; Manage edits. */
export default async function Page() {
  await requirePage('/leads/flows')
  const user = await requirePermission('leads')
  const [config, flows] = await Promise.all([loadLeadConfig(), loadFlows()])
  if (!config.ok || !flows.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Flows" />
        <div className="sheet-danger">{!config.ok ? config.reason : !flows.ok ? flows.reason : null}</div>
      </HvPage>
    )
  }
  return <FlowsView flows={flows.data} brands={config.data.brands} canManage={canDo(user, 'leads', 'manage')} />
}
