import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadCampaigns, loadLeadConfig } from '@/lib/leads/server'
import CampaignsView from '../_components/CampaignsView'

export const dynamic = 'force-dynamic'

/** Lead View › Campaigns (2026-10-16): a brand's message to many customers, as Meta allows. View reads it; Manage sends. */
export default async function Page() {
  await requirePage('/leads/campaigns')
  const user = await requirePermission('leads')
  const [config, campaigns] = await Promise.all([loadLeadConfig(), loadCampaigns()])
  if (!config.ok || !campaigns.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Campaigns" />
        <div className="sheet-danger">{!config.ok ? config.reason : !campaigns.ok ? campaigns.reason : null}</div>
      </HvPage>
    )
  }
  return <CampaignsView campaigns={campaigns.data} brands={config.data.brands} canManage={canDo(user, 'leads', 'manage')} />
}
