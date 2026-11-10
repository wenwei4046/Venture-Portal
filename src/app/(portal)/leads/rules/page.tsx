import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadAdPosts, loadAds, loadChangesOf, loadFlows, loadLeadConfig, loadOutlets, loadPages, loadReplyRules } from '@/lib/leads/server'
import { managedPages } from '@/lib/leads/pages-server'
import { routeRows, ruleLog, type LeadPage } from '@/lib/leads/pages'
import type { ReplyRules, ReplyTemplate, TemplateStep } from '@/lib/leads/template'
import RulesView from '../_components/RulesView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Reply rules (2026-10-23, mig 20261023100000; v2 2026-11-02). Lead View · View reads it; its Edit box
 * (Lead View · Manage) saves. The page rows follow Settings › Pages (receiving pages, mig 20261102110000 — before it,
 * the brands' Page and Instagram ids). Before the rules' migration every page answers with Customer Service.
 */
export default async function Page() {
  await requirePage('/leads/rules')
  const user = await requirePermission('leads')
  const [config, rules, ads, flows, pages, managed, changes, posts, outletsRead] = await Promise.all([
    loadLeadConfig(), loadReplyRules(), loadAds(), loadFlows(), loadPages(), managedPages(), loadChangesOf(['lead_reply_pages', 'lead_reply_rules', 'lead_ad_outlets']), loadAdPosts(), loadOutlets(),
  ])
  const outlets = outletsRead.ok ? outletsRead.data : []
  if (!config.ok || (!rules.ok && rules.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Reply rules" />
        <div className="sheet-danger">{!config.ok ? config.reason : !rules.ok ? rules.reason : null}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands
  const pageList: LeadPage[] = pages.ok ? pages.data : brands.flatMap(b => [
    ...(b.fbPageId ? [{ id: `fb-${b.id}`, brandId: b.id, channel: 'messenger' as const, externalId: b.fbPageId, pageId: null, name: '', paused: false, connectedByName: '', connectedAt: '' }] : []),
    ...(b.igAccountId ? [{ id: `ig-${b.id}`, brandId: b.id, channel: 'instagram' as const, externalId: b.igAccountId, pageId: b.fbPageId, name: '', paused: false, connectedByName: '', connectedAt: '' }] : []),
  ])
  const rows = routeRows(brands, pageList, managed)
  const fallback: ReplyRules = { ads: [], pages: rows.flatMap(r => r.channels.map(channel => ({ brandId: r.brandId, channel, work: 'cs', after: 'cs' }))) }
  const templates: ReplyTemplate[] = flows.ok ? flows.data.map(f => {
    const extra = f as unknown as { description?: string; endMsg?: string }
    return {
      id: f.id, name: f.name, description: extra.description ?? '', endMsg: extra.endMsg ?? '', steps: f.steps as unknown as TemplateStep[],
      brandId: f.brandId, triggerKind: f.triggerKind, triggerValue: f.triggerValue, active: f.active, updatedAt: f.updatedAt,
    }
  }) : []
  // Each ad's own post and picture (before mig 20261102250000, none: the arrow is not drawn).
  const postOf = new Map((posts.ok ? posts.data : []).map(p => [p.adId, p]))
  const adList = (ads.ok ? ads.data : []).map(a => ({ ...a, ...(postOf.has(a.adId) ? { postUrl: postOf.get(a.adId)!.postUrl, picture: postOf.get(a.adId)!.picture, video: postOf.get(a.adId)!.video } : {}) }))
  const log = changes.ok ? ruleLog(changes.data, {
    brand: id => brands.find(b => b.id === id)?.name ?? 'A brand',
    ad: id => { const a = adList.find(x => x.adId === id); return a ? (a.name || a.headline || `Ad ${id}`) : `Ad ${id}` },
    templates,
    outlet: id => outlets.find(o => o.id === id)?.name ?? 'An outlet',
  }) : []
  return (
    <RulesView rules={rules.ok ? rules.data : fallback} ready={rules.ok} rows={rows} ads={adList} brands={brands.map(b => ({ id: b.id, name: b.name }))}
      templates={templates} log={log} canEdit={canDo(user, 'leads', 'manage')} outlets={outlets} />
  )
}
