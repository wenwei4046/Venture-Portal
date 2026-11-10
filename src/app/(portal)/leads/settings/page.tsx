import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadAds, loadFlows, loadLeadConfig, loadOutlets, loadPages, loadReplyRules, loadStaffDirectory, loadTeam } from '@/lib/leads/server'
import { managedPages } from '@/lib/leads/pages-server'
import type { LeadPage } from '@/lib/leads/pages'
import SettingsView from '../_components/SettingsView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Settings (2026-10-16; v2 2026-11-02, mig 20261102110000): the Pages and Instagram accounts that come
 * into the Inbox, the brands, and — kept — the ads and the test enquiry. Lead View · View reads it; Manage edits.
 * Before the migration is applied the pages are read off the brands (as the ingest still finds them) and do not save.
 */
export default async function Page() {
  await requirePage('/leads/settings')
  const user = await requirePermission('leads')
  const canManage = canDo(user, 'leads', 'manage')
  const [config, pages, rules, flows, ads, managed, team, directory, outlets] = await Promise.all([
    loadLeadConfig(), loadPages(), loadReplyRules(), loadFlows(), loadAds(), managedPages(), loadTeam(),
    canManage ? loadStaffDirectory() : Promise.resolve(null), loadOutlets(),
  ])
  if (!config.ok || (!pages.ok && pages.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Settings" />
        <div className="sheet-danger">{!config.ok ? config.reason : !pages.ok ? pages.reason : null}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands
  const fromBrands: LeadPage[] = brands.flatMap(b => [
    ...(b.fbPageId ? [{ id: `fb-${b.id}`, brandId: b.id, channel: 'messenger' as const, externalId: b.fbPageId, pageId: null, name: '', paused: false, connectedByName: '', connectedAt: '' }] : []),
    ...(b.igAccountId ? [{ id: `ig-${b.id}`, brandId: b.id, channel: 'instagram' as const, externalId: b.igAccountId, pageId: b.fbPageId, name: '', paused: false, connectedByName: '', connectedAt: '' }] : []),
  ])
  return (
    <SettingsView
      brands={brands}
      pages={pages.ok ? pages.data : fromBrands}
      ready={pages.ok}
      managed={managed}
      rules={rules.ok ? rules.data : null}
      templates={flows.ok ? flows.data.map(f => ({ id: f.id, name: f.name })) : []}
      ads={ads.ok ? ads.data : null}
      canManage={canManage}
      canTest={canDo(user, 'leads', 'create')}
      team={team.ok ? team.data : null}
      directory={directory?.ok ? directory.data : null}
      outlets={outlets.ok ? outlets.data : []}
      outletsReady={outlets.ok}
    />
  )
}
