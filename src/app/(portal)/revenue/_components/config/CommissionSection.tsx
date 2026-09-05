'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { rankLetters } from '@/lib/commission/ranks'
import {
  deleteKpiItem,
  deleteKpiThreshold,
  deleteMarginBand,
  updateOpenBillRule,
  updateScheme,
  upsertBrand,
  upsertItemGroup,
  upsertKpiItem,
  upsertKpiThreshold,
  upsertMarginBand,
  upsertRank,
} from '../../config-actions'
import NewSubDepartmentForm from './NewSubDepartmentForm'
import PromotionCriteria from './PromotionCriteria'
import {
  ActionButton,
  ActionForm,
  Choice,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  SectionHead,
  Tick,
  toPct,
} from '@/components/RowForm'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { CommissionSettingsData, SchemeRow } from './types'

/**
 * The brand picker's "+ Add brand" chip. Lowercase on purpose: saved codes are
 * uppercased, so no brand can ever collide with it.
 */
const NEW_BRAND = '+new'

/**
 * The Rules page's eight tabs — one per section, in ladder order. The key is
 * what `?tab=` carries, so a link can open the page on the ladder.
 */
export type RulesTab =
  | 'scheme'
  | 'ladder'
  | 'groups'
  | 'kpi'
  | 'thresholds'
  | 'open-bill'
  | 'brands'
  | 'promotion'

const RULES_TABS: Array<TabItem & { key: RulesTab }> = [
  { key: 'scheme', label: 'Scheme rules' },
  { key: 'ladder', label: 'Title ladder' },
  { key: 'groups', label: 'Item groups' },
  { key: 'kpi', label: 'KPI items' },
  { key: 'thresholds', label: 'KPI threshold ladder' },
  { key: 'open-bill', label: 'Open Bill rates' },
  { key: 'brands', label: 'Brands & margin bands' },
  { key: 'promotion', label: 'Promotion criteria' },
]

export function isRulesTab(s: string | null | undefined): s is RulesTab {
  return !!s && RULES_TABS.some(t => t.key === s)
}

/**
 * One sub-department's Rules page.
 *
 * Every rule on one URL, as the user asked on 2026-08-31 ("把规则、setting、
 * threshold 等等全部放在同一个 Tab 里") — and, since 2026-09-05, one SECTION on
 * screen at a time: the eight sections became a tab rail on the header's rule
 * ("我要把下面那些分析的 1、2、3、4 全部变成一个 tab tab tab"). Nine tables end
 * to end were a scroll, not a page. The tab is `?tab=`, pushed with the
 * browser's own history so switching costs nothing and Back steps through
 * them; Next syncs `useSearchParams` from it.
 *
 * Which sub-department is the ROUTE's answer, not a picker's (2026-09-01) —
 * `/revenue/fair/rules` loads Fair's scheme and nothing else, so there is no
 * way to edit one sub-department's ladder while another's name is on screen.
 * Generating a new sub-department still starts here, from the header's
 * action, because a new one usually starts as a copy of the ruleset you are
 * looking at.
 *
 * The salespeople are not here any more: they are Staff Hierarchy's Team tab
 * (2026-09-05), beside the chart that moves them.
 */
export default function CommissionSection({
  data,
  subDept,
}: {
  data: CommissionSettingsData
  subDept: { name: string; slug: string }
}) {
  const searchParams = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: RulesTab = isRulesTab(raw) ? raw : 'scheme'
  const [showNewSub, setShowNewSub] = useState(false)

  const scheme = data.scheme

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    window.history.pushState(null, '', `?${params.toString()}`)
  }

  return (
    <div>
      <div className={scheme ? 'page-head tabbed' : 'page-head'}>
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Rules</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            What {subDept.name} pays, and to whom. <em>Every figure a run produces comes from
            here.</em>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewSub(v => !v)}
          className="text-sm text-accent hover:text-accent-hover font-serif italic whitespace-nowrap sm:mb-3"
        >
          {showNewSub ? 'Cancel' : '+ Generate new sub-department'}
        </button>
      </div>

      {scheme ? <SlidingTabs items={RULES_TABS} active={tab} onTabChange={goTo} variant="control" /> : null}

      {showNewSub ? (
        <section className="mb-12">
          <SectionHead title="New sub-department" count={`${data.subDepartments.length} SO FAR`} />
          <Hint>
            Each sub-department calculates differently, so every rule on this page belongs to{' '}
            <em>{subDept.name}</em> alone — the sidebar is what switches between them. A new
            sub-department can <em>follow</em> an existing one&apos;s rules — every rank, item group,
            KPI item, threshold, Open Bill rate, brand and margin band is copied — or start blank for
            a ruleset of its own.
          </Hint>
          <NewSubDepartmentForm data={data} onDone={() => setShowNewSub(false)} />
        </section>
      ) : null}

      {!scheme ? (
        <Hint>{subDept.name} has no scheme yet.</Hint>
      ) : tab === 'scheme' ? (
        <SchemeRules scheme={scheme} />
      ) : tab === 'ladder' ? (
        <TitleLadder data={data} scheme={scheme} />
      ) : tab === 'groups' ? (
        <ItemGroups data={data} scheme={scheme} />
      ) : tab === 'kpi' ? (
        <KpiItems data={data} scheme={scheme} />
      ) : tab === 'thresholds' ? (
        <KpiThresholds data={data} scheme={scheme} />
      ) : tab === 'open-bill' ? (
        <OpenBillRates data={data} />
      ) : tab === 'brands' ? (
        <BrandsAndBands data={data} scheme={scheme} />
      ) : (
        <PromotionCriteria ranks={data.ranks} rules={data.promotionRules} bands={data.marginBands} />
      )}
    </div>
  )
}

// ─── I. Scheme rules ─────────────────────────────────────────────────────────

function SchemeRules({ scheme }: { scheme: SchemeRow }) {
  return (
    <section>
      <SectionHead title="I. Scheme rules" />
      <Hint>
        Which components this sub-department pays at all. Switching one off makes the engine
        skip it entirely, so a sub-department that only pays a flat percentage of revenue
        reuses the same engine rather than getting a bespoke one.
      </Hint>
      <ActionForm action={updateScheme}>
        {({ pending }) => (
          <div className="border border-hairline rounded-md bg-surface overflow-hidden">
            <Hidden name="scheme_id" value={scheme.id} />
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th className="w-24">On</th>
                  <th>Setting</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Product revenue commission</td>
                  <td><Tick name="enable_product_revenue" defaultChecked={scheme.enable_product_revenue} /></td>
                  <td className="text-muted font-serif italic text-xs">
                    the salesperson&apos;s rate × their commissionable revenue
                  </td>
                </tr>
                <tr>
                  <td>KPI item allowance</td>
                  <td><Tick name="enable_kpi" defaultChecked={scheme.enable_kpi} /></td>
                  <td className="text-muted font-serif italic text-xs">
                    flat RM per unit; that item&apos;s revenue leaves the commission base
                  </td>
                </tr>
                <tr>
                  <td>Open Bill bonus</td>
                  <td><Tick name="enable_open_bill" defaultChecked={scheme.enable_open_bill} /></td>
                  <td>
                    <select
                      name="open_bill_basis"
                      defaultValue={scheme.open_bill_basis}
                      aria-label="Open Bill basis"
                      className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
                    >
                      <option value="uplift_on_commission">uplift on that bill&apos;s commission</option>
                      <option value="pct_of_revenue">% of that bill&apos;s revenue</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>Hierarchy override</td>
                  <td><Tick name="enable_override" defaultChecked={scheme.enable_override} /></td>
                  <td className="font-sans text-xs text-graphite">
                    <label className="inline-flex items-center gap-2">
                      <Tick name="override_includes_kpi" defaultChecked={scheme.override_includes_kpi} ariaLabel="override includes KPI revenue" />
                      include KPI revenue in the override base
                    </label>
                  </td>
                </tr>
                <tr>
                  <td>Below-margin penalty</td>
                  <td><Tick name="enable_margin_penalty" defaultChecked={scheme.enable_margin_penalty} /></td>
                  <td className="text-muted font-serif italic text-xs">
                    per bill — also cuts every upline&apos;s override on it
                  </td>
                </tr>
                <tr>
                  <td>Monthly margin incentive</td>
                  <td><Tick name="enable_margin_incentive" defaultChecked={scheme.enable_margin_incentive} /></td>
                  <td className="text-muted font-serif italic text-xs">
                    every brand sold must clear the tier
                  </td>
                </tr>
                <tr>
                  <td>Deposit gate</td>
                  <td><Tick name="deposit_gate_on" defaultChecked={scheme.deposit_threshold_pct !== null} /></td>
                  <td className="font-sans text-xs text-graphite">
                    <Field name="deposit_threshold_pct" type="number" step="0.01" width="w-20" defaultValue={toPct(scheme.deposit_threshold_pct)} ariaLabel="deposit threshold percent" />
                    <span className="ml-2">% of the order total before any of it pays</span>
                  </td>
                </tr>
                <tr>
                  <td>Default rate mode</td>
                  <td className="text-muted font-serif italic text-xs">—</td>
                  <td>
                    <select
                      name="default_rate_mode"
                      defaultValue={scheme.default_rate_mode}
                      aria-label="Default rate mode"
                      className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
                    >
                      <option value="variable">Scheme target — recomputed monthly</option>
                      <option value="fixed">Manual — whatever rank they are moved to</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-hairline">
              <SaveButton pending={pending} label="Save scheme rules" />
            </div>
          </div>
        )}
      </ActionForm>
    </section>
  )
}

// ─── II. Title ladder ────────────────────────────────────────────────────────

/**
 * The ladder. A rank is its rate: the Rank column is not typed in, it is the
 * letter each rung wears counted from the top (SS, A, B, C …), and it moves
 * when a rung is added above or a rate is changed (`lib/commission/ranks.ts`).
 */
function TitleLadder({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  const letters = rankLetters(
    data.ranks.map(r => ({ id: r.id, productRate: Number(r.product_rate), sortOrder: r.sort_order })),
  )

  return (
    <section>
      <SectionHead title="II. Title ladder" count={`${data.ranks.length} RANKS`} />
      <Hint>
        Each rung belongs to a <strong>title</strong> from People → Roles, and pays a{' '}
        <strong>rank</strong>. A rank is its rate: the rungs are lettered from the top —{' '}
        <em>SS</em> for the highest rate, then <em>A</em>, <em>B</em>, <em>C</em> … — so a Team
        Leader on Rank A at 9% who misses target is still a Team Leader, paid Rank B at 8%. The
        rank is what a month pays; the title is what a person keeps — the month somebody is paid
        a rung above the title they hold, their title is raised to it and <em>never lowered</em>.
        Whether a title may recruit follows the title. The ladder is climbed{' '}
        <strong>one rung at a time</strong>, and a rung carries at most one gate: a{' '}
        <strong>group-sales target</strong> is monthly — a <em>scheme-target</em> salesperson is
        paid that rung in a month that clears it and drops back in one that does not; a{' '}
        <strong>personal-sales streak</strong> (so much, so many months running) is earned —
        passing it raises the title for good and later months climb from there. Leave both blank
        for a rung nobody can reach on volume alone.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Title</th>
              <th className="w-28">Rank</th>
              <th className="right">Rate %</th>
              <th className="w-24">Can recruit</th>
              <th className="right">Group sales target</th>
              <th className="right">Personal sales streak</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.ranks.map(r => (
              <RowForm key={r.id} action={upsertRank}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={r.id} />
                      <Hidden name="scheme_id" value={scheme.id} />
                      <TitleChoice titles={data.titles} current={r.title_id} ariaLabel={`${r.rank_key} title`} />
                    </td>
                    <td>
                      <span className="chip whitespace-nowrap" title={r.rank_key}>
                        RANK {letters.get(r.id)}
                      </span>
                    </td>
                    <td className="num">
                      <Field name="product_rate" type="number" step="0.01" width="w-20" defaultValue={toPct(r.product_rate)} ariaLabel={`${r.rank_key} rate`} />
                    </td>
                    <td><Tick name="can_recruit" defaultChecked={r.can_recruit} ariaLabel={`${r.rank_key} can recruit`} /></td>
                    <td className="num">
                      <Field name="group_sales_threshold" type="number" step="1" width="w-28" defaultValue={r.group_sales_threshold ?? ''} placeholder="—" ariaLabel={`${r.rank_key} group sales target`} />
                    </td>
                    <td className="num whitespace-nowrap">
                      <Field name="personal_sales_threshold" type="number" step="1" width="w-28" defaultValue={r.personal_sales_threshold ?? ''} placeholder="—" ariaLabel={`${r.rank_key} personal sales target`} />
                      <span className="mx-1 text-xs text-muted">×</span>
                      <Field name="consecutive_months" type="number" step="1" width="w-14" defaultValue={r.consecutive_months ?? ''} placeholder="—" ariaLabel={`${r.rank_key} months running`} />
                      <span className="ml-1 text-xs text-muted">mths</span>
                    </td>
                    <td><SaveButton pending={pending} /></td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertRank}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <TitleChoice titles={data.titles} current={null} ariaLabel="new rank title" required />
                  </td>
                  <td className="font-serif italic text-xs text-muted whitespace-nowrap">lettered by its rate</td>
                  <td className="num">
                    <Field name="product_rate" type="number" step="0.01" width="w-20" placeholder="11" required ariaLabel="new rank rate" />
                  </td>
                  <td><Tick name="can_recruit" defaultChecked ariaLabel="new rank can recruit" /></td>
                  <td className="num">
                    <Field name="group_sales_threshold" type="number" step="1" width="w-28" placeholder="—" ariaLabel="new rank group sales target" />
                  </td>
                  <td className="num whitespace-nowrap">
                    <Field name="personal_sales_threshold" type="number" step="1" width="w-28" placeholder="—" ariaLabel="new rank personal sales target" />
                    <span className="mx-1 text-xs text-muted">×</span>
                    <Field name="consecutive_months" type="number" step="1" width="w-14" placeholder="—" ariaLabel="new rank months running" />
                    <span className="ml-1 text-xs text-muted">mths</span>
                  </td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * The ladder's title picker. A title that was assigned but has since been
 * deactivated still shows on its row, so the ladder never lies about itself.
 */
function TitleChoice({
  titles,
  current,
  ariaLabel,
  required,
}: {
  titles: CommissionSettingsData['titles']
  current: string | null
  ariaLabel: string
  required?: boolean
}) {
  const known = current !== null && titles.some(t => t.id === current)
  return (
    <Choice name="title_id" defaultValue={current ?? ''} ariaLabel={ariaLabel} required={required} width="w-48">
      {current === null ? <option value="">— pick a title —</option> : null}
      {current !== null && !known ? <option value={current}>(inactive title)</option> : null}
      {titles.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </Choice>
  )
}

// ─── III. Item groups ────────────────────────────────────────────────────────

function ItemGroups({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  return (
    <section>
      <SectionHead title="III. Item groups" count={`${data.itemGroups.length} CLASSIFIED`} />
      <Hint>
        Which ERP <em>Item Group</em> values earn commission. A group that is not listed here
        is treated as <strong>not</strong> commissionable and raises a warning on the run, so
        a new group coming out of the ERP can never quietly start or stop paying.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Item group</th>
              <th className="w-32">Commissionable</th>
              <th>Note</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.itemGroups.map(g => (
              <RowForm key={g.id} action={upsertItemGroup}>
                {({ pending }) => (
                  <tr>
                    <td className="font-mono text-xs">
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="item_group" value={g.item_group} />
                      {g.item_group}
                    </td>
                    <td><Tick name="commissionable" defaultChecked={g.commissionable} ariaLabel={`${g.item_group} commissionable`} /></td>
                    <td><Field name="note" defaultValue={g.note} width="w-full" placeholder="why" /></td>
                    <td><SaveButton pending={pending} /></td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertItemGroup}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <Field name="item_group" placeholder="NEW GROUP" width="w-40" required />
                  </td>
                  <td><Tick name="commissionable" defaultChecked ariaLabel="new group commissionable" /></td>
                  <td><Field name="note" placeholder="why" /></td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── IV. KPI items ───────────────────────────────────────────────────────────

function KpiItems({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  return (
    <section>
      <SectionHead title="IV. KPI items" count={`${data.kpiItems.length} ITEMS`} />
      <Hint>
        A KPI item pays a flat amount per unit and its <em>revenue leaves the commission
        base</em> — the allowance already paid for it. Most are bundled free in the ERP
        (quantity, zero price), which is exactly the case this exists to reward.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Item code</th>
              <th>Name</th>
              <th className="right">KPI amount</th>
              <th className="w-32">From</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {data.kpiItems.map(k => (
              <RowForm key={k.id} action={upsertKpiItem}>
                {({ pending }) => (
                  <tr>
                    <td className="font-mono text-xs">
                      <Hidden name="id" value={k.id} />
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="product_code" value={k.product_code} />
                      <Hidden name="effective_from" value={k.effective_from} />
                      {k.product_code}
                    </td>
                    <td><Field name="product_name" defaultValue={k.product_name} /></td>
                    <td className="num"><Field name="kpi_amount" type="number" step="0.01" width="w-24" defaultValue={k.kpi_amount} /></td>
                    <td className="font-mono text-xs text-muted">{k.effective_from}</td>
                    <td className="flex items-center gap-3">
                      <SaveButton pending={pending} />
                      <ActionButton
                        run={() => deleteKpiItem(k.id)}
                        label="Remove"
                        danger
                        confirm={`Stop paying a KPI allowance on ${k.product_code}?`}
                      />
                    </td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertKpiItem}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <Field name="product_code" placeholder="ERP item code" width="w-56" required />
                  </td>
                  <td><Field name="product_name" placeholder="name" /></td>
                  <td className="num"><Field name="kpi_amount" type="number" step="0.01" width="w-24" placeholder="50" required /></td>
                  <td><Field name="effective_from" type="date" width="w-36" /></td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── V. KPI threshold ladder ─────────────────────────────────────────────────

function KpiThresholds({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  return (
    <section>
      <SectionHead title="V. KPI threshold ladder" count={`${data.kpiThresholds.length} RUNGS`} />
      <Hint>
        Sell this many KPI units in the month and the <em>whole</em> KPI amount is uplifted.
        The highest rung reached applies — the rungs do not add up.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="right">Minimum units</th>
              <th className="right">Bonus %</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {data.kpiThresholds.map(t => (
              <RowForm key={t.id} action={upsertKpiThreshold}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={t.id} />
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="effective_from" value={t.effective_from} />
                      <Field name="tier_label" defaultValue={t.tier_label} width="w-32" />
                    </td>
                    <td className="num"><Field name="min_qty" type="number" step="1" width="w-24" defaultValue={t.min_qty} /></td>
                    <td className="num"><Field name="bonus_pct" type="number" step="0.01" width="w-24" defaultValue={toPct(t.bonus_pct)} /></td>
                    <td className="flex items-center gap-3">
                      <SaveButton pending={pending} />
                      <ActionButton run={() => deleteKpiThreshold(t.id)} label="Remove" danger />
                    </td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertKpiThreshold}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <Field name="tier_label" placeholder="Tier 2" width="w-32" />
                  </td>
                  <td className="num"><Field name="min_qty" type="number" step="1" width="w-24" placeholder="25" required /></td>
                  <td className="num"><Field name="bonus_pct" type="number" step="0.01" width="w-24" placeholder="35" required /></td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── VI. Open Bill ───────────────────────────────────────────────────────────

function OpenBillRates({ data }: { data: CommissionSettingsData }) {
  return (
    <section>
      <SectionHead title="VI. Open Bill rates" />
      <Hint>
        The 1st, 2nd and 3rd bill a salesperson writes on an event day. The bonus follows the
        person&apos;s <em>current</em> rate, so a promotion lifts it too.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface max-w-lg">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Bill of the day</th>
              <th className="right">Bonus %</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.openBillRules.map(o => (
              <RowForm key={o.id} action={updateOpenBillRule}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={o.id} />
                      {o.bill_rank === 1 ? '1st bill' : o.bill_rank === 2 ? '2nd bill' : '3rd bill'}
                    </td>
                    <td className="num"><Field name="pct" type="number" step="0.01" width="w-24" defaultValue={toPct(o.pct)} /></td>
                    <td><SaveButton pending={pending} /></td>
                  </tr>
                )}
              </RowForm>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── VII. Brands and margin bands ────────────────────────────────────────────

function BrandsAndBands({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  // Which brand this section shows, by CODE — the one key a brand has before
  // it exists. Codes are unique within a scheme and this page is one scheme.
  // NEW_BRAND is the "+ Add brand" chip: no brand selected, an empty form.
  const [brandCode, setBrandCode] = useState<string>('')

  const brands = data.brands
  const addingBrand = brandCode === NEW_BRAND
  const activeBrand = addingBrand
    ? null
    : (brands.find(b => b.code === brandCode) ?? brands[0] ?? null)

  /**
   * Save, then follow the brand just saved: a new one turns up in the picker
   * under the code it was given, and a recoded one keeps its place instead of
   * snapping back to the first chip.
   */
  async function saveBrand(fd: FormData) {
    await upsertBrand(fd)
    setBrandCode(String(fd.get('code') ?? '').trim().toUpperCase())
  }

  return (
    <section>
      <SectionHead title="VII. Brands & margin bands" count={`${brands.length} BRANDS`} />
      <Hint>
        Margin thresholds follow the brand. <strong>Incentive</strong> rungs read as
        “margin at or above” and stack up the ladder; <strong>penalty</strong> rungs read as
        “margin at or below” and the most severe match wins. A brand with no incentive ladder
        blocks the monthly incentive for anyone who sold it — so fill each one in before its
        first run.
      </Hint>

      <div className="flex flex-wrap gap-2 mb-4">
        {brands.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandCode(b.code)}
            className={
              b.id === activeBrand?.id
                ? 'px-3 py-1 rounded-md bg-accent text-white font-serif italic text-sm'
                : 'px-3 py-1 rounded-md bg-surface border border-hairline text-ink font-serif italic text-sm hover:bg-surface-2'
            }
          >
            {b.name}
            {b.item_code_prefixes.length === 0 ? ' ·  no prefixes' : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBrandCode(NEW_BRAND)}
          className={
            addingBrand
              ? 'px-3 py-1 rounded-md bg-accent text-white font-serif italic text-sm'
              : 'px-3 py-1 rounded-md bg-surface border border-dashed border-hairline text-graphite font-serif italic text-sm hover:bg-surface-2 hover:text-ink'
          }
        >
          + Add brand
        </button>
      </div>

      {/* Keyed on the brand so switching chips re-seeds the uncontrolled
          fields — without it the inputs keep the previous brand's text
          while the hidden id moves on, and Save writes one brand's code
          onto another. */}
      <ActionForm key={activeBrand?.id ?? NEW_BRAND} action={saveBrand} className="mb-4">
        {({ pending }) => (
          <div className="border border-hairline rounded-md bg-surface p-4 flex flex-wrap items-end gap-4">
            <Hidden name="scheme_id" value={scheme.id} />
            {activeBrand ? <Hidden name="id" value={activeBrand.id} /> : null}
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Code</span>
              <Field name="code" defaultValue={activeBrand?.code} width="w-28" required />
            </label>
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Name</span>
              <Field name="name" defaultValue={activeBrand?.name} width="w-40" required />
            </label>
            <label className="text-xs font-sans text-graphite flex-1 min-w-[16rem]">
              <span className="block mb-1">Item code prefixes (comma separated)</span>
              <Field
                name="item_code_prefixes"
                defaultValue={activeBrand?.item_code_prefixes.join(', ')}
                placeholder="AK-, AKE"
              />
            </label>
            <SaveButton pending={pending} label={activeBrand ? 'Save brand' : 'Add brand'} />
          </div>
        )}
      </ActionForm>

      {activeBrand ? (
        <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Band</th>
                <th className="w-28">Kind</th>
                <th className="right">Margin %</th>
                <th className="right">× commission</th>
                <th className="right">Monthly incentive</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {data.marginBands
                .filter(b => b.brand_id === activeBrand.id)
                .map(b => (
                  <RowForm key={b.id} action={upsertMarginBand}>
                    {({ pending }) => (
                      <tr>
                        <td>
                          <Hidden name="id" value={b.id} />
                          <Hidden name="scheme_id" value={scheme.id} />
                          <Hidden name="brand_id" value={activeBrand.id} />
                          <Hidden name="band_key" value={b.band_key} />
                          <Hidden name="sort_order" value={b.sort_order} />
                          <Field name="label" defaultValue={b.label} width="w-48" />
                        </td>
                        <td>
                          <Choice
                            name="kind"
                            defaultValue={b.kind}
                            ariaLabel={`${b.band_key} kind`}
                            width="w-auto"
                          >
                            <option value="incentive">incentive ≥</option>
                            <option value="reference">reference</option>
                            <option value="penalty">penalty ≤</option>
                          </Choice>
                        </td>
                        <td className="num"><Field name="margin_pct" type="number" step="0.01" width="w-20" defaultValue={toPct(b.margin_pct)} /></td>
                        <td className="num"><Field name="commission_multiplier" type="number" step="0.01" width="w-20" defaultValue={b.commission_multiplier} /></td>
                        <td className="num"><Field name="monthly_incentive" type="number" step="0.01" width="w-24" defaultValue={b.monthly_incentive} /></td>
                        <td className="flex items-center gap-3">
                          <SaveButton pending={pending} />
                          <ActionButton run={() => deleteMarginBand(b.id)} label="Remove" danger />
                        </td>
                      </tr>
                    )}
                  </RowForm>
                ))}
              <RowForm action={upsertMarginBand}>
                {({ pending }) => (
                  <tr className="bg-surface-2/40">
                    <td>
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="brand_id" value={activeBrand.id} />
                      <Field name="band_key" placeholder="band_key" width="w-36" required />
                    </td>
                    <td>
                      <Choice
                        name="kind"
                        defaultValue="penalty"
                        ariaLabel="new band kind"
                        width="w-auto"
                      >
                        <option value="incentive">incentive ≥</option>
                        <option value="reference">reference</option>
                        <option value="penalty">penalty ≤</option>
                      </Choice>
                    </td>
                    <td className="num"><Field name="margin_pct" type="number" step="0.01" width="w-20" placeholder="27" required /></td>
                    <td className="num"><Field name="commission_multiplier" type="number" step="0.01" width="w-20" defaultValue={1} /></td>
                    <td className="num"><Field name="monthly_incentive" type="number" step="0.01" width="w-24" defaultValue={0} /></td>
                    <td>
                      <Hidden name="label" value="New band" />
                      <SaveButton pending={pending} label="Add" />
                    </td>
                  </tr>
                )}
              </RowForm>
            </tbody>
          </table>
        </div>
      ) : (
        <Hint>
          Add the brand first — its margin ladder is keyed in here once it exists.
        </Hint>
      )}
    </section>
  )
}
