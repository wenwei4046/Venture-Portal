'use client'

import { useState } from 'react'
import { compareRankPay, rankLetters, rankPayLabelOf, rankPayOf } from '@/lib/commission/ranks'
import {
  deleteMarginBand,
  updateOpenBillRule,
  upsertBrand,
  upsertDirectorPay,
  upsertItemGroup,
  upsertMarginBand,
  upsertRank,
} from '../../config-actions'
import {
  ActionButton,
  ActionForm,
  Choice,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  Tick,
  toPct,
} from '@/components/RowForm'
import type { CommissionSettingsData, SchemeRow } from './types'

/**
 * The Rules tables that stayed as they were (2026-10-10, the HR revamp — the
 * prototype draws them "same content as today"): the Title ladder, the
 * Directors' pay, Item groups, Open Bill rates, Brands & margin bands. Each
 * sits under its section's title and one line (`RulesView`), so none carries
 * a head of its own any more. Scheme rules, Ranks and Capacity were redrawn
 * (`../rules/`).
 *
 * Until 2026-10-10 this file was `CommissionSection`, the page itself: every
 * rule on one URL (user 2026-08-31), one section on screen at a time (a tab
 * rail since 2026-09-05), only the tabs the scheme uses (2026-09-11,
 * `lib/commission/rules-tabs.ts`) — all of which the side list keeps.
 */

/**
 * The brand picker's "+ Add brand" chip. Lowercase on purpose: saved codes are
 * uppercased, so no brand can ever collide with it.
 */
const NEW_BRAND = '+new'

/** A brand chip's shape; the caller adds its rim and wash. */
const PILL = 'px-3 py-1.5 rounded-full border text-xs transition-colors'

// ─── Title ladder ────────────────────────────────────────────────────────────

/** The catalogue from the top: group packages, then percentage rates. */
export function catalogueTopDown(data: CommissionSettingsData) {
  return [...data.rankDefs].sort((a, b) => compareRankPay(rankPayOf(b), rankPayOf(a))
    || b.sort_order - a.sort_order || b.id.localeCompare(a.id))
}

/** The letter each rank of the catalogue wears — counted over the catalogue, not the rungs. */
export function catalogueLetters(data: CommissionSettingsData) {
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
export function TitleLadder({
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
  const titleById = new Map(data.titles.map(t => [t.id, t.name]))
  const holderByDef = new Map(data.ranks.map(r => [r.rank_def_id, r]))
  // The Revenue Director's rung (2026-09-27) sets the rate of their own bills:
  // nobody climbs into it, so it takes no gate, and a director always recruits.
  const headTitles = new Set(data.titles.filter(t => t.isDepartmentHead).map(t => t.id))
  const onLadder = new Set(data.ranks.map(r => r.title_id))

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
    // A link inside a sentence: black like the words around it, so the
    // underline is what says it can be pressed (the sheet's `a.text-accent`).
    <button type="button" onClick={onRanks} className="text-accent underline underline-offset-[3px]">
      Ranks tab
    </button>
  )

  return (
    <section>
      <div className="overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Title</th>
              <th className="w-52">Rank · pay</th>
              <th className="w-24">Can recruit</th>
              <th className="right">Group sales target</th>
              <th className="right">Personal sales streak</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.ranks.map(r => {
              const head = headTitles.has(r.title_id)
              return (
                <RowForm key={r.id} action={upsertRank}>
                  {({ pending }) => (
                    <tr>
                      <td>
                        <Hidden name="id" value={r.id} />
                        <Hidden name="scheme_id" value={scheme.id} />
                        <span className="font-medium whitespace-nowrap" title={r.rank_key}>
                          {titleById.get(r.title_id) ?? <span className="font-normal">(inactive title)</span>}
                        </span>
                      </td>
                      <td>
                        <Choice name="rank_def_id" defaultValue={r.rank_def_id} required ariaLabel={`${r.rank_key} rank`} width="w-48">
                          {rankOptions(r)}
                        </Choice>
                      </td>
                      {head ? (
                        // A director always recruits and is never promoted into:
                        // nothing to tick, no gate to type.
                        <>
                          <td><span className="text-xs whitespace-nowrap" title="A director may always have people under them">Always</span></td>
                          <td colSpan={2}>
                            <span className="text-xs whitespace-nowrap" title="Their rung sets the rate of their own bills — nobody climbs into it">
                              Own bills only · no override · no gate
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><Tick name="can_recruit" defaultChecked={r.can_recruit} ariaLabel={`${r.rank_key} can recruit`} /></td>
                          <td className="num">
                            <Field name="group_sales_threshold" type="number" step="1" width="w-24" defaultValue={r.group_sales_threshold ?? ''} placeholder="—" ariaLabel={`${r.rank_key} group sales target`} />
                          </td>
                          <td className="num whitespace-nowrap">
                            <Field name="personal_sales_threshold" type="number" step="1" width="w-20" defaultValue={r.personal_sales_threshold ?? ''} placeholder="—" ariaLabel={`${r.rank_key} personal sales target`} />
                            <span className="mx-1 text-xs">×</span>
                            <Field name="consecutive_months" type="number" step="1" width="w-12" defaultValue={r.consecutive_months ?? ''} placeholder="—" ariaLabel={`${r.rank_key} months running`} />
                            <span className="ml-1 text-xs">mths</span>
                          </td>
                        </>
                      )}
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
                    {/* Only a title without a rung yet: one rung per title. */}
                    <TitleChoice titles={data.titles.filter(t => !onLadder.has(t.id))} current={null} ariaLabel="new rung title" required />
                  </td>
                  <td>
                    <Choice name="rank_def_id" defaultValue="" required ariaLabel="new rung rank" width="w-48">
                      <option value="">— pick a rank —</option>
                      {rankOptions(null)}
                    </Choice>
                  </td>
                  <td><Tick name="can_recruit" defaultChecked ariaLabel="new rung can recruit" /></td>
                  <td className="num">
                    <Field name="group_sales_threshold" type="number" step="1" width="w-24" placeholder="—" ariaLabel="new rung group sales target" />
                  </td>
                  <td className="num whitespace-nowrap">
                    <Field name="personal_sales_threshold" type="number" step="1" width="w-20" placeholder="—" ariaLabel="new rung personal sales target" />
                    <span className="mx-1 text-xs">×</span>
                    <Field name="consecutive_months" type="number" step="1" width="w-12" placeholder="—" ariaLabel="new rung months running" />
                    <span className="ml-1 text-xs">mths</span>
                  </td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
      {catalogue.length === 0 ? (
        <p className="sheet-warning">
          No ranks yet — add them on the {RanksTab} first; a rung needs one to pay.
        </p>
      ) : null}
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
    <Choice name="title_id" defaultValue={current ?? ''} ariaLabel={ariaLabel} required={required} width="w-40">
      {current === null ? <option value="">— pick a title —</option> : null}
      {current !== null && !known ? <option value={current}>(inactive title)</option> : null}
      {titles.map(t => (
        <option key={t.id} value={t.id}>{t.isDepartmentHead ? `${t.name} · heads the department` : t.name}</option>
      ))}
    </Choice>
  )
}

// ─── Directors ───────────────────────────────────────────────────────────────

/**
 * What this sub-department pays the directors it reports to (user
 * 2026-09-27: "they have fix pay amount that pay from revenue department …
 * One is a fixed amount. The other is a threshold"). One row per director,
 * each their own: the fixed amount is their base commission — the Revenue
 * payroll carves their basic out of it like anybody's — and the incentive is
 * paid in a month whose Commissionable value, Comm Cal's card, reaches the
 * threshold. Their own bills pay the Revenue Director rung's rate on the Title
 * ladder, and no override ever reaches them.
 */
export function DirectorPay({
  data,
  scheme,
  subName,
  onLadder,
}: {
  data: CommissionSettingsData
  scheme: SchemeRow
  subName: string
  onLadder: () => void
}) {
  const headRung = data.ranks.find(r => data.titles.some(t => t.id === r.title_id && t.isDepartmentHead))
  const rung = headRung ? data.rankDefs.find(d => d.id === headRung.rank_def_id) : undefined
  const LadderTab = (
    <button type="button" onClick={onLadder} className="text-accent underline underline-offset-[3px]">
      Title ladder
    </button>
  )
  return (
    <section>
      <div className="overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Director</th>
              <th className="right">Fixed amount · RM</th>
              <th className="right">Incentive when Commissionable value reaches · RM</th>
              <th className="right">Incentive · RM</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data.directors.map(d => (
              <RowForm key={d.staffId} action={upsertDirectorPay}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="staff_id" value={d.staffId} />
                      <span className="font-medium whitespace-nowrap">{d.name}</span>
                      <span className="block text-[11px]">
                        {[d.titleName, d.employeeCode].filter(Boolean).join(' · ')}
                        {d.fixedAmount === null ? ' · nothing saved yet' : ''}
                      </span>
                    </td>
                    <td className="num">
                      <Field name="fixed_amount" type="number" step="0.01" width="w-32" defaultValue={d.fixedAmount ?? 0} ariaLabel={`${d.name} fixed amount`} />
                    </td>
                    <td className="num">
                      <Field name="sales_threshold" type="number" step="0.01" width="w-36" defaultValue={d.salesThreshold ?? ''} placeholder="—" ariaLabel={`${d.name} incentive threshold`} />
                    </td>
                    <td className="num">
                      <Field name="incentive_amount" type="number" step="0.01" width="w-32" defaultValue={d.incentiveAmount ?? 0} ariaLabel={`${d.name} incentive`} />
                    </td>
                    <td><SaveButton pending={pending} /></td>
                  </tr>
                )}
              </RowForm>
            ))}
          </tbody>
        </table>
      </div>
      {headRung ? (
        <p className="text-xs mt-3">
          Own bills: {rung ? rankPayLabelOf(rung) : rankPayLabelOf(headRung)} — the Revenue Director&apos;s rung on the {LadderTab}.
        </p>
      ) : (
        <p className="sheet-warning">
          The Revenue Director has no rung on the {LadderTab} yet, so a director&apos;s own bills earn
          nothing. Add one there to pay them a rank&apos;s rate.
        </p>
      )}
    </section>
  )
}

// ─── Item groups ────────────────────────────────────────────────────────────

export function ItemGroups({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  return (
    <section>
      <div className="overflow-x-auto">
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

// ─── Open Bill ──────────────────────────────────────────────────────────────

export function OpenBillRates({ data }: { data: CommissionSettingsData }) {
  return (
    <section>
      <div className="max-w-lg overflow-x-auto">
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

// ─── Brands and margin bands ────────────────────────────────────────────────

export function BrandsAndBands({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
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

      {/* A picker, so pills rather than tabs — the month workbench's chip: a
          white pill, and the one being read on a peach wash with an orange
          rim. The state is said by `aria-pressed` as well as the wash. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {brands.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandCode(b.code)}
            aria-pressed={b.id === activeBrand?.id}
            className={
              b.id === activeBrand?.id
                ? `${PILL} border-accent bg-accent-bg font-semibold`
                : `${PILL} border-hairline bg-surface hover:bg-surface-2`
            }
          >
            {b.name}
            {b.item_code_prefixes.length === 0 ? ' ·  no prefixes' : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBrandCode(NEW_BRAND)}
          aria-pressed={addingBrand}
          className={
            addingBrand
              ? `${PILL} border-accent bg-accent-bg font-semibold`
              : `${PILL} border-dashed border-hairline bg-surface hover:bg-surface-2`
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
          <div className="border border-hairline rounded-card bg-surface-2 p-4 flex flex-wrap items-end gap-4">
            <Hidden name="scheme_id" value={scheme.id} />
            {activeBrand ? <Hidden name="id" value={activeBrand.id} /> : null}
            <label className="text-xs">
              <span className="block mb-1 font-medium">Code</span>
              <Field name="code" defaultValue={activeBrand?.code} width="w-28" required />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-medium">Name</span>
              <Field name="name" defaultValue={activeBrand?.name} width="w-40" required />
            </label>
            <label className="text-xs flex-1 min-w-[16rem]">
              <span className="block mb-1 font-medium">Item code prefixes (comma separated)</span>
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
        <div className="overflow-x-auto table-scroll">
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
                        <td className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-3">
                            <SaveButton pending={pending} />
                            <ActionButton run={() => deleteMarginBand(b.id)} label="Remove" danger />
                          </span>
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
