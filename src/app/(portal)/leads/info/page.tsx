import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { DEFAULT_INFO } from '@/lib/leads/info'
import { NOT_SET_UP, loadCampaigns, loadFlows, loadInfo, loadLeadConfig } from '@/lib/leads/server'
import InfoView from '../_components/InfoView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › General info (2026-10-22, redesign v2 step 3; mig 20261022230000). Lead View · View reads it; its Edit
 * box (Lead View · Manage) saves. Before the migration is applied it shows the seeded categories and cannot save.
 */
export default async function Page() {
  await requirePage('/leads/info')
  const user = await requirePermission('leads')
  const [config, info, flows, campaigns] = await Promise.all([loadLeadConfig(), loadInfo(), loadFlows(), loadCampaigns()])
  const ready = info.ok
  if (!config.ok || (!info.ok && info.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="General info" />
        <div className="sheet-danger">{!config.ok ? config.reason : !info.ok ? info.reason : null}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands
  // USED BY's choices: each brand's AI Agent, the reply templates, the Inbox, the campaigns.
  const uses = [
    { label: 'AI AGENT', opts: brands.map(b => `AI Agent · ${b.name}`) },
    { label: 'REPLY TEMPLATES', opts: flows.ok ? flows.data.map(f => `Template “${f.name}”`) : [] },
    { label: 'INBOX', opts: ['Inbox · CS replies'] },
    { label: 'CAMPAIGNS', opts: campaigns.ok ? campaigns.data.map(c => `Campaign “${c.name}”`) : [] },
  ].filter(g => g.opts.length > 0)
  return (
    <InfoView info={info.ok ? info.data : DEFAULT_INFO} ready={ready} brands={brands} today={officeToday()} uses={uses}
      canEdit={canDo(user, 'leads', 'manage')} />
  )
}
