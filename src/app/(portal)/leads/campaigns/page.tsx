import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadCampaigns, loadConsent, loadLeadConfig } from '@/lib/leads/server'
import CampaignsView from '../_components/CampaignsView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Campaigns (2026-10-16; v2 2026-10-23, the redesign handoff — mig 20261023400000 adds the "did not buy"
 * filters, Bought and the consent counts). View reads it; Manage saves, schedules and sends.
 */
export default async function Page() {
  await requirePage('/leads/campaigns')
  const user = await requirePermission('leads')
  const [config, campaigns, consent] = await Promise.all([loadLeadConfig(), loadCampaigns(), loadConsent()])
  if (!config.ok || !campaigns.ok || (!consent.ok && consent.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Campaigns" />
        <div className="sheet-danger">{!config.ok ? config.reason : !campaigns.ok ? campaigns.reason : !consent.ok ? consent.reason : null}</div>
      </HvPage>
    )
  }
  return (
    <CampaignsView campaigns={campaigns.data} brands={config.data.brands} consent={consent.ok ? consent.data : []} ready={consent.ok}
      canManage={canDo(user, 'leads', 'manage')} />
  )
}
