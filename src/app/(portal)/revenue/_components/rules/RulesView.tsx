'use client'

import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { HvPage } from '@/components/hrv/kit'
import {
  groupedRulesTabs,
  resolveRulesTab,
  visibleRulesTabs,
  type RulesTab,
} from '@/lib/commission/rules-tabs'
import { BrandsAndBands, DirectorPay, ItemGroups, OpenBillRates, TitleLadder } from '../config/RulesTables'
import KpiItemsSection from '../config/KpiItemsSection'
import PromotionCriteria from '../config/PromotionCriteria'
import type { CommissionSettingsData } from '../config/types'
import CapacityPanel, { type CapacityInitial } from './CapacityPanel'
import RanksPanel from './RanksPanel'
import SchemePanel from './SchemePanel'
import { SectionTop } from './SectionTop'
import s from './rules.module.css'

/**
 * One sub-department's Rules page (2026-10-10, the HR revamp, variant A): a
 * grouped side list — Pay structure · Item rules · Headcount · Policy — and
 * the open section beside it, under its 20px title (its one line went on
 * 2026-10-12, with the list's note on item rules). Scheme
 * rules, Ranks and Capacity are the prototype's own; every other section is
 * the table it always was ("same content as today").
 *
 * What the list shows is still `lib/commission/rules-tabs.ts`: an item rule
 * only while the Scheme-rules switch that reads it is on (user 2026-09-11),
 * KPI items while anything is recorded there too. The section is `?tab=`,
 * pushed with the browser's own history, so Back steps through them.
 *
 * KPI items edits a list in a draft, so it stays mounted, hidden, while
 * another section is read. Capacity's figures come with the page (null = the
 * viewer may not manage the member back office, and the section is left out).
 */
export default function RulesView({
  data,
  subDept,
  holders,
  canManage,
  capacity,
  head,
}: {
  data: CommissionSettingsData
  subDept: { id: string; name: string; slug: string }
  /** Rules › Ranks' "Held by": rank id → the names paid from it today. */
  holders: Record<string, string[]>
  /** Revenue · Manage — what every write on this page asks. */
  canManage: boolean
  /** Rules › Capacity's figures, read with the page; null = the viewer may not manage member requests. */
  capacity: CapacityInitial | null
  head: ReactNode
}) {
  const searchParams = useSearchParams()
  const scheme = data.scheme
  const tabs = scheme
    ? visibleRulesTabs(scheme, {
        itemGroups: data.itemGroups.length,
        promotionRules: data.promotionRules.length,
        directors: data.directors.length,
        kpiItems: data.kpiItems.length,
        kpiThresholds: data.kpiThresholds.length,
      }).filter(t => t.key !== 'capacity' || capacity !== null)
    : []
  const tab: RulesTab = resolveRulesTab(searchParams.get('tab'), tabs)
  const showsKpi = tabs.some(t => t.key === 'kpi')

  function goTo(key: RulesTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    window.history.pushState(null, '', `?${params.toString()}`)
  }

  const titled = (key: RulesTab, body: ReactNode) => (
    <>
      <SectionTop title={tabs.find(t => t.key === key)?.label ?? key} />
      {body}
    </>
  )

  if (!scheme) {
    return (
      <HvPage>
        {head}
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">{subDept.name} has no scheme yet.</p>
        </div>
      </HvPage>
    )
  }

  return (
    <HvPage>
      {head}
      <div className={s.layout}>
        <nav className={s.nav} aria-label="Rules sections">
          {groupedRulesTabs(tabs).map(g => (
            <div key={g.label} role="group" aria-label={g.label} className={s.navGroupWrap}>
              <div className={s.navGroup} aria-hidden="true">
                {g.label}
              </div>
              {g.items.map(it => (
                <button
                  key={it.key}
                  type="button"
                  className={s.navItem}
                  aria-current={it.key === tab ? 'page' : undefined}
                  onClick={() => goTo(it.key)}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          {tab === 'scheme' ? (
            <SchemePanel scheme={scheme} canManage={canManage} />
          ) : tab === 'ranks' ? (
            <RanksPanel data={data} scheme={scheme} holders={holders} canManage={canManage} />
          ) : tab === 'ladder' ? (
            titled('ladder', <TitleLadder data={data} scheme={scheme} onRanks={() => goTo('ranks')} />)
          ) : tab === 'directors' ? (
            titled('directors', <DirectorPay data={data} scheme={scheme} subName={subDept.name} onLadder={() => goTo('ladder')} />)
          ) : tab === 'groups' ? (
            titled('groups', <ItemGroups data={data} scheme={scheme} />)
          ) : tab === 'open-bill' ? (
            titled('open-bill', <OpenBillRates data={data} />)
          ) : tab === 'brands' ? (
            titled('brands', <BrandsAndBands data={data} scheme={scheme} />)
          ) : tab === 'capacity' && capacity ? (
            <CapacityPanel subDepartmentId={subDept.id} subName={subDept.name} subSlug={subDept.slug} initial={capacity} />
          ) : tab === 'promotion' ? (
            titled('promotion', <PromotionCriteria ranks={data.ranks} rules={data.promotionRules} bands={data.marginBands} />)
          ) : null}

          {showsKpi ? (
            <div hidden={tab !== 'kpi'}>
              {titled('kpi', <KpiItemsSection data={data} scheme={scheme} subName={subDept.name} onSchemeRules={() => goTo('scheme')} />)}
            </div>
          ) : null}
        </div>
      </div>
    </HvPage>
  )
}
