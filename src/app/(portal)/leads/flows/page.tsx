import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { NOT_SET_UP, loadAds, loadFlows, loadInfo, loadLeadConfig, loadLibrary, loadReplyRules } from '@/lib/leads/server'
import type { ReplyRules, ReplyTemplate, TemplateStep } from '@/lib/leads/template'
import TemplatesView from '../_components/TemplatesView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Reply templates (2026-10-16 Automations; the canvas since 2026-10-23, redesign v2 step 4 — mig
 * 20261023100000). Lead View · View reads it; its Edit box (Lead View · Manage) saves. ?t= opens a template. Before
 * the migration is applied the canvas can be tried with today's flows but not saved.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requirePage('/leads/flows')
  const user = await requirePermission('leads')
  const { t } = await searchParams
  const [config, flows, rules, ads, library, info] = await Promise.all([loadLeadConfig(), loadFlows(), loadReplyRules(), loadAds(), loadLibrary(), loadInfo()])
  if (!config.ok || !flows.ok || (!rules.ok && rules.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Reply templates" />
        <div className="sheet-danger">{!config.ok ? config.reason : !flows.ok ? flows.reason : !rules.ok ? rules.reason : null}</div>
      </HvPage>
    )
  }
  // The reader answers description and endMsg only once the migration is applied.
  const ready = rules.ok
  const templates: ReplyTemplate[] = flows.data.map(f => {
    const extra = f as unknown as { description?: string; endMsg?: string }
    return {
      id: f.id, name: f.name, description: extra.description ?? '', endMsg: extra.endMsg ?? '', steps: f.steps as unknown as TemplateStep[],
      brandId: f.brandId, triggerKind: f.triggerKind, triggerValue: f.triggerValue, active: f.active, updatedAt: f.updatedAt,
    }
  })
  const emptyRules: ReplyRules = { ads: [], pages: [] }
  return (
    <TemplatesView
      templates={templates}
      rules={rules.ok ? rules.data : emptyRules}
      ads={ads.ok ? ads.data.map(a => ({ adId: a.adId, name: a.name || a.headline })) : []}
      brands={config.data.brands.map(b => ({ id: b.id, name: b.name }))}
      library={library.ok ? library.data : []}
      info={info.ok ? info.data : null}
      today={officeToday()}
      ready={ready}
      initialId={t ?? null}
      canEdit={canDo(user, 'leads', 'manage')}
    />
  )
}
