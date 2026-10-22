import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadAds, loadFlows, loadLeadConfig, loadReplyRules } from '@/lib/leads/server'
import type { ReplyRules } from '@/lib/leads/template'
import RulesView from '../_components/RulesView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Reply rules (2026-10-23, redesign v2 step 4; mig 20261023100000). Lead View · View reads it; its Edit box
 * (Lead View · Manage) saves. Before the migration is applied every page answers with Customer Service and nothing saves.
 */
export default async function Page() {
  await requirePage('/leads/rules')
  const user = await requirePermission('leads')
  const [config, rules, ads, flows] = await Promise.all([loadLeadConfig(), loadReplyRules(), loadAds(), loadFlows()])
  if (!config.ok || (!rules.ok && rules.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Reply rules" />
        <div className="sheet-danger">{!config.ok ? config.reason : !rules.ok ? rules.reason : null}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands
  const fallback: ReplyRules = {
    ads: [],
    pages: brands.flatMap(b => (['messenger', 'instagram'] as const).map(channel => ({ brandId: b.id, channel, work: 'cs', after: 'cs' }))),
  }
  return (
    <RulesView rules={rules.ok ? rules.data : fallback} ready={rules.ok} ads={ads.ok ? ads.data : []} brands={brands}
      templates={flows.ok ? flows.data.map(f => ({ id: f.id, name: f.name })) : []} canEdit={canDo(user, 'leads', 'manage')} />
  )
}
