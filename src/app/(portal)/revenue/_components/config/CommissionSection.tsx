'use client'

import { useState } from 'react'
import Link from 'next/link'
import { revenuePath } from '@/lib/revenue'
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
import { setPositionFromForm, updateStaffTax } from '../../hierarchy-actions'
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
import type { CommissionSettingsData } from './types'

/**
 * The brand picker's "+ Add brand" chip. Lowercase on purpose: saved codes are
 * uppercased, so no brand can ever collide with it.
 */
const NEW_BRAND = '+new'

/**
 * One sub-department's Rules page: every rule on one screen (user 2026-08-31:
 * "帮我 consolidate 成一个比较容易看、容易 set 的表格... 把规则、setting、
 * threshold 等等全部放在同一个 Tab 里").
 *
 * Which sub-department is the ROUTE's answer, not a picker's (2026-09-01) —
 * `/revenue/fair/rules` loads Fair's scheme and nothing else, so there is no
 * way to edit one sub-department's ladder while another's name is on screen.
 * Generating a new sub-department still lives here, because a new one usually
 * starts as a copy of the ruleset you are looking at.
 */
export default function CommissionSection({
  data,
  subDept,
}: {
  data: CommissionSettingsData
  subDept: { name: string; slug: string }
}) {
  const [showNewSub, setShowNewSub] = useState(false)
  // Which brand section VII shows, by CODE — the one key a brand has before it
  // exists. Codes are unique within a scheme and this page is one scheme.
  // NEW_BRAND is the "+ Add brand" chip: no brand selected, an empty form.
  const [brandCode, setBrandCode] = useState<string>('')

  const scheme = data.scheme
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
    <div className="space-y-12">
      {/* ── Sub-department ────────────────────────────────────────────── */}
      <section>
        <SectionHead
          title="Sub-department"
          count={`${data.subDepartments.length} TOTAL`}
          action={
            <button
              type="button"
              onClick={() => setShowNewSub(v => !v)}
              className="text-sm text-accent hover:text-accent-hover font-serif italic"
            >
              {showNewSub ? 'Cancel' : '+ Generate new sub-department'}
            </button>
          }
        />
        <Hint>
          Each sub-department calculates differently, so every rule below belongs to{' '}
          <em>{subDept.name}</em> alone — the sidebar is what switches between them. A new
          sub-department can <em>follow</em> an existing one&apos;s rules — every rank, item group,
          KPI item, threshold, Open Bill rate, brand and margin band is copied — or start blank for
          a ruleset of its own.
        </Hint>

        {showNewSub ? <NewSubDepartmentForm data={data} onDone={() => setShowNewSub(false)} /> : null}
      </section>

      {!scheme ? (
        <Hint>{subDept.name} has no scheme yet.</Hint>
      ) : (
        <>
          {/* ── I. Scheme rules ─────────────────────────────────────────── */}
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
                            <option value="fixed">Manual — whatever title they are moved to</option>
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

          {/* ── II. Tier ladder ─────────────────────────────────────────── */}
          <section>
            <SectionHead title="II. Tier ladder" count={`${data.ranks.length} RANKS`} />
            <Hint>
              Rates can repeat across tiers, so the <em>rank key</em> is the identity, not the rate.
              A rank that may not recruit cannot be chosen as anybody&apos;s upline. The group-sales
              target is what a <em>scheme-target</em> salesperson climbs to each month; leave it
              blank for a rank nobody can reach on volume alone.
            </Hint>
            <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Rank</th>
                    <th className="right">Rate %</th>
                    <th className="w-24">Can recruit</th>
                    <th className="right">Group sales target</th>
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
                            <Hidden name="tier_key" value={r.tier_key} />
                            <Hidden name="rank_key" value={r.rank_key} />
                            <Hidden name="sort_order" value={r.sort_order} />
                            <Field name="tier_label" defaultValue={r.tier_label} width="w-44" />
                          </td>
                          <td><Field name="label" defaultValue={r.label} width="w-52" /></td>
                          <td className="num">
                            <Field name="product_rate" type="number" step="0.01" width="w-20" defaultValue={toPct(r.product_rate)} />
                          </td>
                          <td><Tick name="can_recruit" defaultChecked={r.can_recruit} ariaLabel={`${r.rank_key} can recruit`} /></td>
                          <td className="num">
                            <Field name="group_sales_threshold" type="number" step="1" width="w-32" defaultValue={r.group_sales_threshold ?? ''} placeholder="—" />
                          </td>
                          <td><SaveButton pending={pending} /></td>
                        </tr>
                      )}
                    </RowForm>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── III. Item groups ────────────────────────────────────────── */}
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

          {/* ── IV. KPI items ───────────────────────────────────────────── */}
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

          {/* ── V. KPI threshold ladder ─────────────────────────────────── */}
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

          {/* ── VI. Open Bill ───────────────────────────────────────────── */}
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

          {/* ── VII. Brands and margin bands ────────────────────────────── */}
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

          {/* ── VIII. Promotion criteria ────────────────────────────────── */}
          <PromotionCriteria
            ranks={data.ranks}
            rules={data.promotionRules}
            bands={data.marginBands}
          />

          {/* ── IX. Salespeople ─────────────────────────────────────────── */}
          <section>
            <SectionHead
              title="IX. Salespeople"
              count={`${data.salespeople.length} PEOPLE`}
              action={
                <Link
                  href={revenuePath(subDept.slug, 'hierarchy')}
                  className="text-sm text-accent hover:text-accent-hover font-serif italic"
                >
                  Open the staff hierarchy →
                </Link>
              }
            />
            <Hint>
              <strong>Manual</strong> keeps whatever title they were moved to, even in a month below
              target. <strong>Scheme target</strong> recomputes the rate every month from group
              sales and drops back when the target is missed. Changing a rank or upline writes a new
              effective-dated position — a month already computed keeps the chart it was computed
              against.
            </Hint>
            {data.salespeople.length === 0 ? (
              <div className="border border-hairline rounded-md bg-surface p-8 text-center">
                <p className="font-serif text-lg text-ink mb-2">No salespeople yet.</p>
                <p className="font-serif italic text-muted text-sm">
                  Add them under HR → Staff with the Revenue Department, then place them here or on
                  the Staff Hierarchy.
                </p>
              </div>
            ) : (
              <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Upline</th>
                      <th>Attained rank</th>
                      <th className="w-44">Rate mode</th>
                      <th className="w-40">Withholding</th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salespeople.map(p => (
                      <tr key={p.staff_id}>
                        <td>
                          <span className="text-ink">{p.employee_name}</span>
                          {p.employee_code ? (
                            <span className="ml-2 font-mono text-xs text-muted">{p.employee_code}</span>
                          ) : null}
                        </td>
                        <PositionCells person={p} data={data} schemeId={scheme.id} />
                        <td>
                          <ActionForm action={updateStaffTax}>
                            {({ pending }) => (
                              <div className="flex items-center gap-2">
                                <Hidden name="staff_id" value={p.staff_id} />
                                <Tick name="withholding" defaultChecked={p.tax_mode === 'withholding'} ariaLabel={`${p.employee_name} withholding`} />
                                <Field name="withholding_rate" type="number" step="0.01" width="w-16" defaultValue={toPct(p.withholding_rate)} ariaLabel="withholding rate" />
                                <span className="text-xs text-muted">%</span>
                                <SaveButton pending={pending} label="✓" />
                              </div>
                            )}
                          </ActionForm>
                        </td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Upline + rank + rate mode, saved together as one position. */
function PositionCells({
  person,
  data,
  schemeId,
}: {
  person: CommissionSettingsData['salespeople'][number]
  data: CommissionSettingsData
  schemeId: string
}) {
  const recruiters = data.ranks.filter(r => r.can_recruit).map(r => r.id)
  const canBeUpline = data.salespeople.filter(
    p => p.staff_id !== person.staff_id && p.rank_id && recruiters.includes(p.rank_id),
  )

  return (
    <RowForm action={setPositionFromForm}>
      {({ pending }) => (
        <>
          <td>
            <Hidden name="staff_id" value={person.staff_id} />
            <Hidden name="scheme_id" value={schemeId} />
            <Choice
              name="upline_staff_id"
              defaultValue={person.upline_staff_id ?? ''}
              ariaLabel={`${person.employee_name} upline`}
            >
              <option value="">— top of a tree —</option>
              {canBeUpline.map(u => (
                <option key={u.staff_id} value={u.staff_id}>{u.employee_name}</option>
              ))}
            </Choice>
          </td>
          <td>
            <Choice
              name="rank_id"
              defaultValue={person.rank_id ?? ''}
              required
              ariaLabel={`${person.employee_name} rank`}
              width="w-48"
            >
              <option value="">— not placed —</option>
              {data.ranks.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </Choice>
          </td>
          <td>
            <Choice
              name="rate_mode"
              defaultValue={person.rate_mode ?? ''}
              ariaLabel={`${person.employee_name} rate mode`}
            >
              <option value="">scheme default</option>
              <option value="fixed">Manual</option>
              <option value="variable">Scheme target</option>
            </Choice>
            <span className="ml-2"><SaveButton pending={pending} label="✓" /></span>
          </td>
        </>
      )}
    </RowForm>
  )
}
