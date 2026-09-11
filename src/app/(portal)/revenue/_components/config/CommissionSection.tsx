'use client'

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { compareRankPay, rankLetters, rankPayLabelOf, rankPayOf } from '@/lib/commission/ranks'
import {
  deleteKpiItem,
  deleteKpiThreshold,
  deleteMarginBand,
  deleteRankDef,
  updateOpenBillRule,
  updateScheme,
  upsertBrand,
  upsertItemGroup,
  upsertKpiItem,
  upsertKpiThreshold,
  upsertMarginBand,
  upsertRank,
  upsertRankDef,
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
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import { resolveRulesTab, visibleRulesTabs, type RulesTab } from '@/lib/commission/rules-tabs'
import { orderSchemeRules, type SchemeRuleKey } from '@/lib/commission/scheme-rule-order'
import type { CommissionSettingsData, SchemeRow } from './types'

/**
 * The brand picker's "+ Add brand" chip. Lowercase on purpose: saved codes are
 * uppercased, so no brand can ever collide with it.
 */
const NEW_BRAND = '+new'

/**
 * One sub-department's Rules page.
 *
 * Every rule on one URL, as the user asked on 2026-08-31 ("把规则、setting、
 * threshold 等等全部放在同一个 Tab 里") — and, since 2026-09-05, one SECTION on
 * screen at a time: the sections became a tab rail on the header's rule
 * ("我要把下面那些分析的 1、2、3、4 全部变成一个 tab tab tab") — eight, then
 * nine when the Ranks catalogue got a tab of its own the same evening. Nine
 * tables end to end were a scroll, not a page. The tab is `?tab=`, pushed with the
 * browser's own history so switching costs nothing and Back steps through
 * them; Next syncs `useSearchParams` from it.
 *
 * Since 2026-09-11 the rail shows only the tabs the scheme USES: Scheme
 * rules, the Title ladder and Ranks always, and every other table only while
 * the switch that reads it is on — IR, which pays nothing per item, gets
 * three tabs where Fair gets nine (`lib/commission/rules-tabs.ts` says which
 * switch owns which tab). A `?tab=` naming a hidden one opens Scheme rules,
 * where its switch is.
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
  const [showNewSub, setShowNewSub] = useState(false)

  const scheme = data.scheme
  const tabs = scheme
    ? visibleRulesTabs(scheme, {
        itemGroups: data.itemGroups.length,
        promotionRules: data.promotionRules.length,
      })
    : []
  const tab: RulesTab = resolveRulesTab(searchParams.get('tab'), tabs)

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

      {scheme ? <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" /> : null}

      {showNewSub ? (
        <section className="mb-12">
          <SectionHead title="New sub-department" count={`${data.subDepartments.length} SO FAR`} />
          <Hint>
            Each sub-department calculates differently, so every rule on this page belongs to{' '}
            <em>{subDept.name}</em> alone — the sidebar is what switches between them. A new
            sub-department can <em>follow</em> an existing one&apos;s rules — every rank, item group,
            KPI item, threshold, Open Bill rate, brand and margin band is copied — or start blank for
            a ruleset of its own, with every switch off and every table empty until you write it.
          </Hint>
          <NewSubDepartmentForm data={data} onDone={() => setShowNewSub(false)} />
        </section>
      ) : null}

      {!scheme ? (
        <Hint>{subDept.name} has no scheme yet.</Hint>
      ) : tab === 'scheme' ? (
        <SchemeRules scheme={scheme} />
      ) : tab === 'ladder' ? (
        <TitleLadder data={data} scheme={scheme} onRanks={() => goTo('ranks')} />
      ) : tab === 'ranks' ? (
        <RankCatalogue data={data} scheme={scheme} onLadder={() => goTo('ladder')} />
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

/**
 * The ON cell of the three group-package parameters — Group sales layers,
 * Override layers, Direct-line limit. They are not switches: `updateScheme`
 * requires them at 2 / 2 / 3 whenever Group incentive package is on, and
 * blank means "every layer" for a percentage-only scheme like Fair. The cell
 * used to hold a dash, which read as a switch that cannot be turned on (user
 * 2026-09-11: "那种 dash 就是它不能 on 的 … 应该把那个 dash 换成 IR，这样就知道它是
 * 属于 IR"). So it names the programme the parameters belong to instead — IR,
 * spec §15 — on every sub-department's page, Fair's included.
 */
function IrParameter() {
  return (
    <span
      className="chip whitespace-nowrap"
      title="An IR programme parameter, not a switch — it is set together with Group incentive package"
    >
      IR
    </span>
  )
}

function SchemeRules({ scheme }: { scheme: SchemeRow }) {
  // One row per rule, keyed. The ORDER is the saved scheme's — the IR
  // parameters, then what is on, then what is off, Default rate mode last
  // (`orderSchemeRules`); a row moves when Save lands, not while a box is ticked.
  const rows: Record<SchemeRuleKey, ReactNode> = {
    product_revenue: (
      <tr key="product_revenue">
        <td>Product revenue commission</td>
        <td><Tick name="enable_product_revenue" defaultChecked={scheme.enable_product_revenue} /></td>
        <td className="text-muted font-serif italic text-xs">
          the salesperson&apos;s rate × their commissionable revenue
        </td>
      </tr>
    ),
    kpi: (
      <tr key="kpi">
        <td>KPI item allowance</td>
        <td><Tick name="enable_kpi" defaultChecked={scheme.enable_kpi} /></td>
        <td className="text-muted font-serif italic text-xs">
          flat RM per unit; that item&apos;s revenue leaves the commission base
        </td>
      </tr>
    ),
    open_bill: (
      <tr key="open_bill">
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
    ),
    override: (
      <tr key="override">
        <td>Hierarchy override</td>
        <td><Tick name="enable_override" defaultChecked={scheme.enable_override} /></td>
        <td className="font-sans text-xs text-graphite">
          <label className="inline-flex items-center gap-2">
            <Tick name="override_includes_kpi" defaultChecked={scheme.override_includes_kpi} ariaLabel="override includes KPI revenue" />
            include KPI revenue in the override base
          </label>
        </td>
      </tr>
    ),
    margin_penalty: (
      <tr key="margin_penalty">
        <td>Below-margin penalty</td>
        <td><Tick name="enable_margin_penalty" defaultChecked={scheme.enable_margin_penalty} /></td>
        <td className="text-muted font-serif italic text-xs">
          per bill — also cuts every upline&apos;s override on it
        </td>
      </tr>
    ),
    group_incentive: (
      <tr key="group_incentive">
        <td>Group incentive package</td>
        <td><Tick name="enable_group_incentive" defaultChecked={scheme.enable_group_incentive ?? false} /></td>
        <td className="text-muted font-serif italic text-xs">
          monthly fixed pay per qualifying direct group, replacing percentage commission; amounts are set in Ranks
        </td>
      </tr>
    ),
    group_sales_depth: (
      <tr key="group_sales_depth">
        <td>Group sales layers</td>
        <td><IrParameter /></td>
        <td className="font-sans text-xs text-graphite">
          <Field name="group_sales_depth" type="number" step="1" width="w-20" defaultValue={scheme.group_sales_depth ?? ''} ariaLabel="Group sales layers" />
          <span className="ml-2">2 = directs and their directs; blank = all layers</span>
        </td>
      </tr>
    ),
    override_depth: (
      <tr key="override_depth">
        <td>Override layers</td>
        <td><IrParameter /></td>
        <td className="font-sans text-xs text-graphite">
          <Field name="override_depth" type="number" step="1" width="w-20" defaultValue={scheme.override_depth ?? ''} ariaLabel="Override layers" />
          <span className="ml-2">2 = at most two layers; blank = all layers</span>
        </td>
      </tr>
    ),
    direct_line_limit: (
      <tr key="direct_line_limit">
        <td>Direct-line limit</td>
        <td><IrParameter /></td>
        <td className="font-sans text-xs text-graphite">
          <Field name="direct_line_limit" type="number" step="1" width="w-20" defaultValue={scheme.direct_line_limit ?? ''} ariaLabel="Direct-line limit" />
          <span className="ml-2">Base 3 for group packages. Full Spec permits a fourth line that month. Each further line requires all existing groups to qualify in its opening month. Opened slots are retained; unused permission expires.</span>
        </td>
      </tr>
    ),
    margin_incentive: (
      <tr key="margin_incentive">
        <td>Monthly margin incentive</td>
        <td><Tick name="enable_margin_incentive" defaultChecked={scheme.enable_margin_incentive} /></td>
        <td className="text-muted font-serif italic text-xs">
          every brand sold must clear the tier
        </td>
      </tr>
    ),
    deposit_gate: (
      <tr key="deposit_gate">
        <td>Deposit gate</td>
        <td><Tick name="deposit_gate_on" defaultChecked={scheme.deposit_threshold_pct !== null} /></td>
        <td className="font-sans text-xs text-graphite">
          <Field name="deposit_threshold_pct" type="number" step="0.01" width="w-20" defaultValue={toPct(scheme.deposit_threshold_pct)} ariaLabel="deposit threshold percent" />
          <span className="ml-2">% of the order total before any of it pays</span>
        </td>
      </tr>
    ),
    default_rate_mode: (
      <tr key="default_rate_mode">
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
    ),
  }

  return (
    <section>
      <SectionHead title="I. Scheme rules" />
      <Hint>
        Which components this sub-department pays at all. Switching one off makes the engine
        skip it entirely, so a sub-department that only pays a flat percentage of revenue
        reuses the same engine rather than getting a bespoke one. A sub-department that started
        blank has every switch off until you turn it on here. IR&apos;s three parameters lead the
        table; below them, what is on comes before what is off.
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
              <tbody>{orderSchemeRules(scheme).map(k => rows[k])}</tbody>
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

/** The catalogue from the top: group packages, then percentage rates. */
function catalogueTopDown(data: CommissionSettingsData) {
  return [...data.rankDefs].sort((a, b) => compareRankPay(rankPayOf(b), rankPayOf(a))
    || b.sort_order - a.sort_order || b.id.localeCompare(a.id))
}

/** The letter each rank of the catalogue wears — counted over the catalogue, not the rungs. */
function catalogueLetters(data: CommissionSettingsData) {
  return rankLetters(
    data.rankDefs.map(d => ({ id: d.id, ...rankPayOf(d), sortOrder: d.sort_order })),
  )
}

/**
 * The ladder: one rung per title. The title is fixed once the rung exists —
 * only the last row, the one that adds a rung, picks one. The RANK is the
 * dropdown, from the Rank tab's catalogue, and the rate is the rank's: shown,
 * never typed (user 2026-09-05: "title 本身不能用 dropdown 选 … rank 那边有
 * dropdown option … rate 不能直接改，因为 rank 和 rate 是绑定的"). A rank pays
 * one title, so a rank another rung holds is greyed in the picker with its
 * holder's name. Letters are counted over the catalogue, so a rank with no
 * title on it still holds its place (`lib/commission/ranks.ts`).
 */
function TitleLadder({
  data,
  scheme,
  onRanks,
}: {
  data: CommissionSettingsData
  scheme: SchemeRow
  onRanks: () => void
}) {
  const letters = catalogueLetters(data)
  const catalogue = catalogueTopDown(data)
  const defById = new Map(data.rankDefs.map(d => [d.id, d]))
  const titleById = new Map(data.titles.map(t => [t.id, t.name]))
  const holderByDef = new Map(data.ranks.map(r => [r.rank_def_id, r]))

  // The rank picker for one rung (or, with `self` null, for the row that adds one).
  const rankOptions = (self: { id: string } | null) =>
    catalogue.map(d => {
      const holder = holderByDef.get(d.id)
      const taken = holder !== undefined && holder.id !== self?.id
      const name = `Rank ${letters.get(d.id) ?? '?'} · ${rankPayLabelOf(d)}`
      return (
        <option key={d.id} value={d.id} disabled={taken}>
          {taken ? `${name} — ${titleById.get(holder.title_id) ?? 'taken'}` : name}
        </option>
      )
    })

  const RanksTab = (
    <button type="button" onClick={onRanks} className="not-italic font-sans text-xs text-accent hover:underline">
      Ranks tab
    </button>
  )

  return (
    <section>
      <SectionHead title="II. Title ladder" count={`${data.ranks.length} RUNGS`} />
      <Hint>
        One rung per <strong>title</strong> from People → Roles; the title is fixed once the rung
        exists, only the last row picks one. The <strong>rank</strong> is the dropdown — which
        rank the title is paid — and its <strong>pay</strong> follows it: percentage or group package, set
        on the {RanksTab}, never here. A Team Leader on Rank A at 9% who misses target is still a
        Team Leader, paid Rank B at 8%: the rank is what a month pays, the title is what a person
        keeps — the month somebody is paid a rung above the title they hold, their title is raised
        to it and <em>never lowered</em>. Whether a title may recruit follows the title. The
        percentage ladder is climbed <strong>one rung at a time</strong>, and a rung carries at most one
        gate: a <strong>group-sales target</strong> is monthly — a <em>scheme-target</em>{' '}
        salesperson is paid that rung in a month that clears it and drops back in one that does
        not; a <strong>personal-sales streak</strong> (so much, so many months running) is earned
        — passing it raises the title for good and later months climb from there. Leave both
        blank for a percentage rung nobody can reach on volume alone. A group package uses the monthly
        group-sales target for each eligible direct line, including the leader&apos;s own sales.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Title</th>
              <th className="w-52">Rank</th>
              <th className="right">Pay</th>
              <th className="w-24">Can recruit</th>
              <th className="right">Group sales target</th>
              <th className="right">Personal sales streak</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.ranks.map(r => {
              const rank = defById.get(r.rank_def_id)
              return (
                <RowForm key={r.id} action={upsertRank}>
                  {({ pending }) => (
                    <tr>
                      <td>
                        <Hidden name="id" value={r.id} />
                        <Hidden name="scheme_id" value={scheme.id} />
                        <span className="text-ink whitespace-nowrap" title={r.rank_key}>
                          {titleById.get(r.title_id) ?? <span className="text-muted">(inactive title)</span>}
                        </span>
                      </td>
                      <td>
                        <Choice name="rank_def_id" defaultValue={r.rank_def_id} required ariaLabel={`${r.rank_key} rank`} width="w-48">
                          {rankOptions(r)}
                        </Choice>
                      </td>
                      <td className="num">
                        <span className="font-mono text-sm text-num-ink" title="Set on the Ranks tab">
                          {rankPayLabelOf(rank ?? r)}
                        </span>
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
              )
            })}
            <RowForm action={upsertRank}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <TitleChoice titles={data.titles} current={null} ariaLabel="new rung title" required />
                  </td>
                  <td>
                    <Choice name="rank_def_id" defaultValue="" required ariaLabel="new rung rank" width="w-48">
                      <option value="">— pick a rank —</option>
                      {rankOptions(null)}
                    </Choice>
                  </td>
                  <td className="num">
                    <span className="font-serif italic text-xs text-muted whitespace-nowrap">follows the rank</span>
                  </td>
                  <td><Tick name="can_recruit" defaultChecked ariaLabel="new rung can recruit" /></td>
                  <td className="num">
                    <Field name="group_sales_threshold" type="number" step="1" width="w-28" placeholder="—" ariaLabel="new rung group sales target" />
                  </td>
                  <td className="num whitespace-nowrap">
                    <Field name="personal_sales_threshold" type="number" step="1" width="w-28" placeholder="—" ariaLabel="new rung personal sales target" />
                    <span className="mx-1 text-xs text-muted">×</span>
                    <Field name="consecutive_months" type="number" step="1" width="w-14" placeholder="—" ariaLabel="new rung months running" />
                    <span className="ml-1 text-xs text-muted">mths</span>
                  </td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
      {catalogue.length === 0 ? (
        <p className="mt-3 font-serif italic text-sm text-alert">
          No ranks yet — add them on the {RanksTab} first; a rung needs one to pay.
        </p>
      ) : null}
    </section>
  )
}

// ─── IX. Ranks ───────────────────────────────────────────────────────────────

/**
 * The catalogue: a rank is its pay, and this is the only place its amounts are
 * typed (user 2026-09-05: "rank A 等于多少 rate、rank B 等于多少 rate … 除非我在
 * rank 的那个 tab 里去调"). The letter is not typed either — it is the rank's
 * place counted from the top, SS for the highest rate, then A, B, C … — so a
 * rank keyed in above the others moves every letter down, and a rank nobody
 * has put a title on yet still holds its place in the count. Section IX: the
 * number the salespeople held before they moved to Staff Hierarchy.
 */
function RankCatalogue({
  data,
  scheme,
  onLadder,
}: {
  data: CommissionSettingsData
  scheme: SchemeRow
  onLadder: () => void
}) {
  const letters = catalogueLetters(data)
  const catalogue = catalogueTopDown(data)
  // Which ranks a title sits on — only to keep Remove off those rows. Which
  // title is the ladder's business, not this tab's (user 2026-09-06: "这边主要
  // 是 setting for rate").
  const taken = new Set(data.ranks.map(r => r.rank_def_id))

  return (
    <section>
      <SectionHead title="IX. Ranks" count={`${catalogue.length} RANKS`} />
      <Hint>
        Set each rank&apos;s percentage or group package here. The{' '}
        <button type="button" onClick={onLadder} className="not-italic font-sans text-xs text-accent hover:underline">
          Title ladder
        </button>{' '}
        picks a rank for each title. A positive group incentive replaces percentage commission
        for a qualifying month, so its rate must be 0%. The subsidy cap is separate from cash pay.
        Leave both amounts at 0 for a percentage rank. Packages sit above percentage ranks, ordered
        by incentive then subsidy cap; letters count from the top: <em>SS</em>, <em>A</em>,{' '}
        <em>B</em> … . Changing pay affects future calculations; a month already computed keeps
        its saved amounts. Set the monthly group target on the title ladder.
      </Hint>
      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="w-32">Rank</th>
              <th className="right w-28">Rate %</th>
              <th className="right">Group incentive RM</th>
              <th className="right">Subsidy cap RM</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map(d => (
              <RowForm key={d.id} action={upsertRankDef}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={d.id} />
                      <Hidden name="scheme_id" value={scheme.id} />
                      <span className="chip whitespace-nowrap">RANK {letters.get(d.id) ?? '?'}</span>
                    </td>
                    <td className="num">
                      <Field name="product_rate" type="number" step="0.01" width="w-20" defaultValue={toPct(d.product_rate)} ariaLabel={`${d.label} rate`} />
                    </td>
                    <td className="num">
                      <Field name="group_incentive_amount" type="number" step="0.01" width="w-32" defaultValue={d.group_incentive_amount ?? 0} ariaLabel={`${d.label} group incentive RM`} />
                    </td>
                    <td className="num">
                      <Field name="group_subsidy_cap" type="number" step="0.01" width="w-32" defaultValue={d.group_subsidy_cap ?? 0} ariaLabel={`${d.label} subsidy cap RM`} />
                    </td>
                    <td className="whitespace-nowrap">
                      <SaveButton pending={pending} />
                      {!taken.has(d.id) ? (
                        <span className="ml-3">
                          <ActionButton run={() => deleteRankDef(d.id)} label="Remove" danger />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertRankDef}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <span className="font-serif italic text-xs text-muted whitespace-nowrap">lettered by its pay</span>
                  </td>
                  <td className="num">
                    <Field name="product_rate" type="number" step="0.01" width="w-20" placeholder="11" required ariaLabel="new rank rate" />
                  </td>
                  <td className="num">
                    <Field name="group_incentive_amount" type="number" step="0.01" width="w-32" defaultValue={0} ariaLabel="new rank group incentive RM" />
                  </td>
                  <td className="num">
                    <Field name="group_subsidy_cap" type="number" step="0.01" width="w-32" defaultValue={0} ariaLabel="new rank subsidy cap RM" />
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
