'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import {
  createSubDepartment,
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
} from '../../commission-actions'
import { setPositionFromForm, updateStaffTax } from '../../../hr-costing/commission/hierarchy-actions'
import {
  ActionButton,
  ActionForm,
  Field,
  Hint,
  SaveButton,
  SectionHead,
  Tick,
  toPct,
} from './ui'
import type { CommissionSettingsData } from './types'

/**
 * Settings → Commission. One tab, every rule (user 2026-08-31: "帮我 consolidate
 * 成一个比较容易看、容易 set 的表格... 把规则、setting、threshold 等等全部放在
 * 同一个 Tab 里").
 *
 * A sub-department picker at the top scopes everything below it, because each
 * sub-department calculates differently — "Fair" (the roadshow team) is the
 * first, and a new one either clones its rules or starts blank.
 */
export default function CommissionSection({ data }: { data: CommissionSettingsData }) {
  const [subDeptId, setSubDeptId] = useState(data.subDepartments[0]?.id ?? '')
  const [showNewSub, setShowNewSub] = useState(false)

  const scheme = useMemo(
    () => data.schemes.find(s => s.sub_department_id === subDeptId) ?? null,
    [data.schemes, subDeptId],
  )
  const [brandId, setBrandId] = useState<string>('')

  const brands = data.brands
  const activeBrand = brands.find(b => b.id === brandId) ?? brands[0] ?? null

  if (data.subDepartments.length === 0) {
    return (
      <div>
        <SectionHead title="Commission" />
        <Hint>
          No commission sub-department exists yet. The Revenue Department splits into
          sub-departments — <em>Fair</em> (the roadshow team) is the first — and each one carries
          its own rules. Create one to begin.
        </Hint>
        <NewSubDepartmentForm data={data} onDone={() => setShowNewSub(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* ── Sub-department picker ─────────────────────────────────────── */}
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
          Each sub-department calculates differently, so every rule below belongs to the one picked
          here. A new sub-department can <em>follow</em> an existing one&apos;s rules — every rank,
          item group, KPI item, threshold, Open Bill rate, brand and margin band is copied — or
          start blank for a ruleset of its own.
        </Hint>

        <div className="flex flex-wrap gap-2 mb-4">
          {data.subDepartments.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubDeptId(s.id)}
              className={
                s.id === subDeptId
                  ? 'px-4 py-1.5 rounded-md bg-accent text-white font-serif italic text-sm'
                  : 'px-4 py-1.5 rounded-md bg-surface border border-hairline text-ink font-serif italic text-sm hover:bg-surface-2'
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        {showNewSub ? <NewSubDepartmentForm data={data} onDone={() => setShowNewSub(false)} /> : null}
      </section>

      {!scheme ? (
        <Hint>That sub-department has no scheme yet.</Hint>
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
                  <input type="hidden" name="scheme_id" value={scheme.id} />
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
                    <ActionForm key={r.id} action={upsertRank} className="contents">
                      {({ pending }) => (
                        <tr>
                          <td>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="scheme_id" value={scheme.id} />
                            <input type="hidden" name="tier_key" value={r.tier_key} />
                            <input type="hidden" name="rank_key" value={r.rank_key} />
                            <input type="hidden" name="sort_order" value={r.sort_order} />
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
                    </ActionForm>
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
                    <ActionForm key={g.id} action={upsertItemGroup} className="contents">
                      {({ pending }) => (
                        <tr>
                          <td className="font-mono text-xs">
                            <input type="hidden" name="scheme_id" value={scheme.id} />
                            <input type="hidden" name="item_group" value={g.item_group} />
                            {g.item_group}
                          </td>
                          <td><Tick name="commissionable" defaultChecked={g.commissionable} ariaLabel={`${g.item_group} commissionable`} /></td>
                          <td><Field name="note" defaultValue={g.note} width="w-full" placeholder="why" /></td>
                          <td><SaveButton pending={pending} /></td>
                        </tr>
                      )}
                    </ActionForm>
                  ))}
                  <ActionForm action={upsertItemGroup} className="contents">
                    {({ pending }) => (
                      <tr className="bg-surface-2/40">
                        <td>
                          <input type="hidden" name="scheme_id" value={scheme.id} />
                          <Field name="item_group" placeholder="NEW GROUP" width="w-40" required />
                        </td>
                        <td><Tick name="commissionable" defaultChecked ariaLabel="new group commissionable" /></td>
                        <td><Field name="note" placeholder="why" /></td>
                        <td><SaveButton pending={pending} label="Add" /></td>
                      </tr>
                    )}
                  </ActionForm>
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
                    <ActionForm key={k.id} action={upsertKpiItem} className="contents">
                      {({ pending }) => (
                        <tr>
                          <td className="font-mono text-xs">
                            <input type="hidden" name="id" value={k.id} />
                            <input type="hidden" name="scheme_id" value={scheme.id} />
                            <input type="hidden" name="product_code" value={k.product_code} />
                            <input type="hidden" name="effective_from" value={k.effective_from} />
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
                    </ActionForm>
                  ))}
                  <ActionForm action={upsertKpiItem} className="contents">
                    {({ pending }) => (
                      <tr className="bg-surface-2/40">
                        <td>
                          <input type="hidden" name="scheme_id" value={scheme.id} />
                          <Field name="product_code" placeholder="ERP item code" width="w-56" required />
                        </td>
                        <td><Field name="product_name" placeholder="name" /></td>
                        <td className="num"><Field name="kpi_amount" type="number" step="0.01" width="w-24" placeholder="50" required /></td>
                        <td><Field name="effective_from" type="date" width="w-36" /></td>
                        <td><SaveButton pending={pending} label="Add" /></td>
                      </tr>
                    )}
                  </ActionForm>
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
                    <ActionForm key={t.id} action={upsertKpiThreshold} className="contents">
                      {({ pending }) => (
                        <tr>
                          <td>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="scheme_id" value={scheme.id} />
                            <input type="hidden" name="effective_from" value={t.effective_from} />
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
                    </ActionForm>
                  ))}
                  <ActionForm action={upsertKpiThreshold} className="contents">
                    {({ pending }) => (
                      <tr className="bg-surface-2/40">
                        <td>
                          <input type="hidden" name="scheme_id" value={scheme.id} />
                          <Field name="tier_label" placeholder="Tier 2" width="w-32" />
                        </td>
                        <td className="num"><Field name="min_qty" type="number" step="1" width="w-24" placeholder="25" required /></td>
                        <td className="num"><Field name="bonus_pct" type="number" step="0.01" width="w-24" placeholder="35" required /></td>
                        <td><SaveButton pending={pending} label="Add" /></td>
                      </tr>
                    )}
                  </ActionForm>
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
                    <ActionForm key={o.id} action={updateOpenBillRule} className="contents">
                      {({ pending }) => (
                        <tr>
                          <td>
                            <input type="hidden" name="id" value={o.id} />
                            {o.bill_rank === 1 ? '1st bill' : o.bill_rank === 2 ? '2nd bill' : '3rd bill'}
                          </td>
                          <td className="num"><Field name="pct" type="number" step="0.01" width="w-24" defaultValue={toPct(o.pct)} /></td>
                          <td><SaveButton pending={pending} /></td>
                        </tr>
                      )}
                    </ActionForm>
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
                  onClick={() => setBrandId(b.id)}
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
            </div>

            <ActionForm action={upsertBrand} className="mb-4">
              {({ pending }) => (
                <div className="border border-hairline rounded-md bg-surface p-4 flex flex-wrap items-end gap-4">
                  <input type="hidden" name="scheme_id" value={scheme.id} />
                  {activeBrand ? <input type="hidden" name="id" value={activeBrand.id} /> : null}
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
                        <ActionForm key={b.id} action={upsertMarginBand} className="contents">
                          {({ pending }) => (
                            <tr>
                              <td>
                                <input type="hidden" name="id" value={b.id} />
                                <input type="hidden" name="scheme_id" value={scheme.id} />
                                <input type="hidden" name="brand_id" value={activeBrand.id} />
                                <input type="hidden" name="band_key" value={b.band_key} />
                                <input type="hidden" name="sort_order" value={b.sort_order} />
                                <Field name="label" defaultValue={b.label} width="w-48" />
                              </td>
                              <td>
                                <select
                                  name="kind"
                                  defaultValue={b.kind}
                                  aria-label={`${b.band_key} kind`}
                                  className="px-2 py-1 bg-paper border border-hairline rounded text-xs text-ink"
                                >
                                  <option value="incentive">incentive ≥</option>
                                  <option value="reference">reference</option>
                                  <option value="penalty">penalty ≤</option>
                                </select>
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
                        </ActionForm>
                      ))}
                    <ActionForm action={upsertMarginBand} className="contents">
                      {({ pending }) => (
                        <tr className="bg-surface-2/40">
                          <td>
                            <input type="hidden" name="scheme_id" value={scheme.id} />
                            <input type="hidden" name="brand_id" value={activeBrand.id} />
                            <Field name="band_key" placeholder="band_key" width="w-36" required />
                          </td>
                          <td>
                            <select
                              name="kind"
                              defaultValue="penalty"
                              aria-label="new band kind"
                              className="px-2 py-1 bg-paper border border-hairline rounded text-xs text-ink"
                            >
                              <option value="incentive">incentive ≥</option>
                              <option value="reference">reference</option>
                              <option value="penalty">penalty ≤</option>
                            </select>
                          </td>
                          <td className="num"><Field name="margin_pct" type="number" step="0.01" width="w-20" placeholder="27" required /></td>
                          <td className="num"><Field name="commission_multiplier" type="number" step="0.01" width="w-20" defaultValue={1} /></td>
                          <td className="num"><Field name="monthly_incentive" type="number" step="0.01" width="w-24" defaultValue={0} /></td>
                          <td>
                            <input type="hidden" name="label" value="New band" />
                            <SaveButton pending={pending} label="Add" />
                          </td>
                        </tr>
                      )}
                    </ActionForm>
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {/* ── VIII. Promotion criteria ────────────────────────────────── */}
          <section>
            <SectionHead title="VIII. Promotion criteria" count="RECORDED · NOT ENFORCED" />
            <Hint>
              Written down for reference while the rules settle. Nothing reads these yet — the only
              gate the engine applies is the group-sales target on the ladder above. Rows sharing an
              <em> Alt</em> group must all hold; different groups are alternatives.
            </Hint>
            <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>From → To</th>
                    <th className="w-16">Alt</th>
                    <th>Criterion</th>
                    <th className="right">Threshold</th>
                    <th className="w-24">Enforced</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.promotionRules.map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.from_rank_key} → {r.to_rank_key}</td>
                      <td className="font-mono text-xs">{r.alternative_group}</td>
                      <td>{CRITERION_LABEL[r.criterion]}</td>
                      <td className="num">
                        {r.threshold_amount !== null ? formatMoney(r.threshold_amount) : null}
                        {r.threshold_qty !== null ? `${r.threshold_qty} per head` : null}
                        {r.margin_band_key ?? null}
                        {r.consecutive_months ? ` × ${r.consecutive_months} months` : ''}
                      </td>
                      <td className="font-serif italic text-xs text-muted">{r.is_enforced ? 'yes' : 'no'}</td>
                      <td className="font-serif italic text-xs text-muted">{r.note}</td>
                    </tr>
                  ))}
                  {data.promotionRules.length === 0 ? (
                    <tr><td colSpan={6} className="text-muted font-serif italic">None recorded.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── IX. Salespeople ─────────────────────────────────────────── */}
          <section>
            <SectionHead
              title="IX. Salespeople"
              count={`${data.salespeople.length} PEOPLE`}
              action={
                <Link href="/hr-costing/commission/org-chart" className="text-sm text-accent hover:text-accent-hover font-serif italic">
                  Open the org chart →
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
                  the org chart.
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
                                <input type="hidden" name="staff_id" value={p.staff_id} />
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

const CRITERION_LABEL: Record<string, string> = {
  personal_sales: 'Personal sales',
  group_sales: 'Group sales',
  kpi_items_per_pax: 'KPI items per head',
  margin_band: 'Margin band',
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
    <ActionForm action={setPositionFromForm} className="contents">
      {({ pending }) => (
        <>
          <td>
            <input type="hidden" name="staff_id" value={person.staff_id} />
            <input type="hidden" name="scheme_id" value={schemeId} />
            <select
              name="upline_staff_id"
              defaultValue={person.upline_staff_id ?? ''}
              aria-label={`${person.employee_name} upline`}
              className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink w-40"
            >
              <option value="">— top of a tree —</option>
              {canBeUpline.map(u => (
                <option key={u.staff_id} value={u.staff_id}>{u.employee_name}</option>
              ))}
            </select>
          </td>
          <td>
            <select
              name="rank_id"
              defaultValue={person.rank_id ?? ''}
              required
              aria-label={`${person.employee_name} rank`}
              className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink w-48"
            >
              <option value="">— not placed —</option>
              {data.ranks.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </td>
          <td>
            <select
              name="rate_mode"
              defaultValue={person.rate_mode ?? ''}
              aria-label={`${person.employee_name} rate mode`}
              className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink w-40"
            >
              <option value="">scheme default</option>
              <option value="fixed">Manual</option>
              <option value="variable">Scheme target</option>
            </select>
            <span className="ml-2"><SaveButton pending={pending} label="✓" /></span>
          </td>
        </>
      )}
    </ActionForm>
  )
}

function NewSubDepartmentForm({
  data,
  onDone,
}: {
  data: CommissionSettingsData
  onDone: () => void
}) {
  return (
    <ActionForm action={createSubDepartment} onDone={onDone}>
      {({ pending }) => (
        <div className="border border-hairline rounded-md bg-surface p-6 max-w-2xl">
          <h3 className="font-serif text-lg text-ink mb-4">New sub-department</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Department</span>
              <select
                name="department_id"
                required
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink"
              >
                {data.commissionDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Name</span>
              <Field name="name" placeholder="e.g. Showroom" required />
            </label>
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Short code</span>
              <Field name="code" placeholder="SHOW" />
            </label>
            <label className="text-xs font-sans text-graphite">
              <span className="block mb-1">Follow an existing ruleset</span>
              <select
                name="clone_from_scheme_id"
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink"
              >
                <option value="">— start blank —</option>
                {data.schemes.map(s => {
                  const sub = data.subDepartments.find(d => d.id === s.sub_department_id)
                  return (
                    <option key={s.id} value={s.id}>
                      Copy {sub?.name ?? s.scheme_name}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>
          <p className="font-serif italic text-muted text-xs mt-3 mb-4">
            Copying brings across every rank, item group, KPI item, threshold, Open Bill rate, brand
            and margin band. It does not bring across people — nobody can hold two positions at once.
          </p>
          <SaveButton pending={pending} label="Create sub-department" />
        </div>
      )}
    </ActionForm>
  )
}
