'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { RESERVED_SUB_DEPT_SLUGS, subDeptSlug } from '@/lib/revenue'
import { officeMonth, officeToday } from '@/lib/office-time'
import { mintRankKey, rankName, rankLabelOf, rankPayError, rankPayOf, resequenceLadder } from '@/lib/commission/ranks'
import { newSchemeSettings, type SchemeSettings } from '@/lib/commission/scheme-defaults'
import { checkDirectorPay } from '@/lib/commission/director-pay'

/**
 * Revenue → Rules. Every rule, threshold and per-person tick for the Revenue
 * Department's sub-departments lives behind these actions.
 *
 * Role: Principal + HR. HR runs payroll and owns the commission run, so it
 * would be strange for them to be unable to fix a KPI amount. The Product List
 * (product-actions.ts) stays Principal-only — what a product COSTS is not
 * payroll's call.
 *
 * comm_* / sales_* postdate the generated database.types.ts, so these use the
 * untyped-client convention already established by ba_* and bank_recon_*.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
}

function num(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) as string | null)?.trim()
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`)
  return n
}

/** Percentages are keyed in as 0–100 and stored as 0–1. */
function pct(formData: FormData, key: string): number | null {
  const n = num(formData, key)
  if (n === null) return null
  if (n < -100 || n > 100) throw new Error(`"${key}" must be between -100 and 100`)
  return n / 100
}

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

function required(formData: FormData, key: string, label: string): string {
  const v = text(formData, key)
  if (!v) throw new Error(`${label} is required`)
  return v
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// ─── Sub-departments ────────────────────────────────────────────────────────

/**
 * "Generate New Sub-Department". Either clones an existing sub-department's
 * whole ruleset or starts blank for a bespoke one — the user's requirement,
 * because each sub-department calculates differently.
 *
 * Cloning copies every child row of the source scheme and records
 * cloned_from_scheme_id, so it is obvious later where a ruleset came from.
 *
 * Blank means blank (2026-09-10): the scheme is written with every component
 * switch OFF (`lib/commission/scheme-defaults.ts`). Left to the column
 * defaults it came up with all six on, and the new sub-department opened on a
 * Scheme rules tab that looked like a copy of Fair's.
 */
export async function createSubDepartment(formData: FormData) {
  const user = await requireAction('revenue', 'manage')
  const supabase = await client()

  const departmentId = required(formData, 'department_id', 'Department')
  const name = required(formData, 'name', 'Name')
  const code = text(formData, 'code') || null
  const cloneFrom = text(formData, 'clone_from_scheme_id') || null

  // The name becomes the URL (`/revenue/fair`), so it has to survive the trip.
  // `uq_sub_department_name` guards the name; neither of these is a name clash.
  const slug = subDeptSlug(name)
  if (!slug) {
    throw new Error('That name has no letters or digits to make a web address from')
  }
  if (RESERVED_SUB_DEPT_SLUGS.includes(slug)) {
    throw new Error(`"${name}" collides with the /revenue/${slug} page — pick another name`)
  }
  const { data: existing } = await supabase.from('comm_sub_departments').select('name')
  const clash = ((existing ?? []) as Array<{ name: string }>).find(s => subDeptSlug(s.name) === slug)
  if (clash) {
    throw new Error(`"${name}" and "${clash.name}" would share the address /revenue/${slug}`)
  }

  const { data: sub, error: subError } = await supabase
    .from('comm_sub_departments')
    .insert({ department_id: departmentId, name, code, created_by: user.id })
    .select('id')
    .single()
  check(subError, 'Could not create the sub-department')

  const source = cloneFrom
    ? ((await supabase.from('comm_schemes').select('*').eq('id', cloneFrom).single()).data as SchemeSettings | null)
    : null
  if (cloneFrom && !source) {
    throw new Error('The ruleset to follow is gone — pick another, or start blank')
  }

  const { data: scheme, error: schemeError } = await supabase
    .from('comm_schemes')
    .insert({
      sub_department_id: sub!.id,
      scheme_name: `${name} scheme`,
      cloned_from_scheme_id: cloneFrom,
      effective_from: `${officeMonth()}-01`, // the office's month, not UTC's
      created_by: user.id,
      ...newSchemeSettings(source),
    })
    .select('id')
    .single()
  check(schemeError, 'Could not create the scheme')

  if (cloneFrom) {
    await cloneSchemeChildren(supabase, cloneFrom, scheme!.id)
  }

  // The sidebar lists sub-departments, and it is rendered by the portal layout
  // on every page — so a new one has to invalidate the whole shell, not just
  // /revenue, or it stays missing until the next hard load.
  revalidatePath('/', 'layout')
  refresh()
}

/**
 * Copy every rule row from one scheme to another. Catalogue ids are mapped
 * explicitly so a zero-rate package can never be mistaken for a plain rank.
 * Brands are copied before their margin bands for the same reason.
 */
async function cloneSchemeChildren(
  supabase: SupabaseClient,
  fromSchemeId: string,
  toSchemeId: string,
) {
  const { data: sourceDefs, error: defsError } = await supabase.from('comm_rank_defs')
    .select('id, product_rate, group_incentive_amount, group_subsidy_cap, label, sort_order')
    .eq('scheme_id', fromSchemeId)
  check(defsError, 'Could not read the ranks to clone')
  const rankDefIds = new Map<string, string>()
  for (const sourceDef of (sourceDefs ?? []) as Array<Record<string, unknown>>) {
    const { id: sourceId, ...values } = sourceDef
    const { data: cloned, error } = await supabase.from('comm_rank_defs')
      .insert({ ...values, scheme_id: toSchemeId }).select('id').single()
    check(error, 'Could not clone a rank')
    rankDefIds.set(String(sourceId), String(cloned!.id))
  }
  const { data: sourceRungs, error: rungsError } = await supabase.from('comm_ranks')
    .select('rank_def_id, title_id, rank_key, label, product_rate, group_incentive_amount, group_subsidy_cap, can_recruit, group_sales_threshold, personal_sales_threshold, consecutive_months, sort_order')
    .eq('scheme_id', fromSchemeId)
  check(rungsError, 'Could not read the title ladder to clone')
  if (sourceRungs?.length) {
    const rungs = (sourceRungs as unknown as Array<Record<string, unknown>>).map(r => {
      const rankDefId = rankDefIds.get(String(r.rank_def_id))
      if (!rankDefId) throw new Error('A ladder rank is missing from the source catalogue')
      return { ...r, scheme_id: toSchemeId, rank_def_id: rankDefId }
    })
    check((await supabase.from('comm_ranks').insert(rungs)).error, 'Could not clone the title ladder')
  }

  const simple: Array<[table: string, columns: string[]]> = [
    ['comm_item_groups', ['item_group', 'commissionable', 'note']],
    ['comm_kpi_items', ['source', 'product_code', 'product_name', 'erp_product_id', 'option_pool', 'option_value', 'kpi_amount', 'effective_from', 'effective_to']],
    ['comm_cost_ratios', ['erp_product_id', 'product_code', 'ratio', 'note']],
    ['comm_kpi_thresholds', ['tier_label', 'min_qty', 'bonus_pct', 'effective_from', 'effective_to']],
    ['comm_open_bill_rules', ['bill_rank', 'pct', 'effective_from', 'effective_to']],
    ['comm_promotion_rules', ['from_rank_key', 'to_rank_key', 'alternative_group', 'criterion', 'threshold_amount', 'threshold_qty', 'margin_band_key', 'consecutive_months', 'is_enforced', 'note']],
  ]

  for (const [table, columns] of simple) {
    const { data } = await supabase.from(table).select(columns.join(',')).eq('scheme_id', fromSchemeId)
    if (!data?.length) continue
    const rows = (data as unknown as Array<Record<string, unknown>>).map(r => ({
      ...r,
      scheme_id: toSchemeId,
    }))
    check((await supabase.from(table).insert(rows)).error, `Could not clone ${table}`)
  }

  const { data: brands } = await supabase
    .from('comm_brands')
    .select('id, code, name, item_code_prefixes, note, is_active')
    .eq('scheme_id', fromSchemeId)

  for (const brand of (brands ?? []) as Array<Record<string, unknown>>) {
    const { data: newBrand, error } = await supabase
      .from('comm_brands')
      .insert({
        scheme_id: toSchemeId,
        code: brand.code,
        name: brand.name,
        item_code_prefixes: brand.item_code_prefixes,
        note: brand.note,
        is_active: brand.is_active,
      })
      .select('id')
      .single()
    check(error, 'Could not clone a brand')

    const { data: bands } = await supabase
      .from('comm_margin_bands')
      .select('band_key, label, kind, margin_pct, commission_multiplier, monthly_incentive, sort_order')
      .eq('brand_id', brand.id as string)
    if (!bands?.length) continue

    check(
      (
        await supabase.from('comm_margin_bands').insert(
          (bands as unknown as Array<Record<string, unknown>>).map(b => ({
            ...b,
            scheme_id: toSchemeId,
            brand_id: newBrand!.id,
          })),
        )
      ).error,
      'Could not clone the margin bands',
    )
  }
}

// ─── Scheme switches ────────────────────────────────────────────────────────

export async function updateScheme(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = required(formData, 'scheme_id', 'Scheme')
  const depositOn = formData.get('deposit_gate_on') === 'on'
  const depositPct = pct(formData, 'deposit_threshold_pct')
  const groupIncentiveOn = formData.get('enable_group_incentive') === 'on'
  const groupDepth = num(formData, 'group_sales_depth')
  const overrideDepth = num(formData, 'override_depth')
  const directLimit = num(formData, 'direct_line_limit')
  for (const [label, value] of [['Group sales layers', groupDepth], ['Override layers', overrideDepth], ['Direct-line limit', directLimit]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 20)) {
      throw new Error(`${label} must be a whole number from 1 to 20, or blank for unlimited`)
    }
  }
  if (groupIncentiveOn && (groupDepth !== 2 || overrideDepth !== 2 || directLimit !== 3)) {
    throw new Error('Group packages require 2 sales layers, 2 override layers and a base limit of 3 directs. Full Spec permits opening the fourth line that month. Opening each further line requires all existing groups to qualify in its opening month; opened slots are retained.')
  }

  if (depositOn && depositPct === null) {
    throw new Error('Give the deposit gate a threshold, or switch it off')
  }

  // Revenue Team cost = unit cost ÷ divisor (user 2026-09-12: Fair 0.7). Both
  // the member calculator and the monthly run judge margin on that cost.
  const costDivisor = num(formData, 'revenue_cost_divisor')
  if (costDivisor !== null && (!(costDivisor > 0) || costDivisor > 10)) {
    throw new Error('The cost divisor must be above 0 and at most 10 (1 keeps the cost as keyed)')
  }

  const basis = text(formData, 'open_bill_basis')
  if (basis && !['uplift_on_commission', 'pct_of_revenue'].includes(basis)) {
    throw new Error('Unknown Open Bill basis')
  }
  const rateMode = text(formData, 'default_rate_mode')
  if (rateMode && !['fixed', 'variable'].includes(rateMode)) {
    throw new Error('Unknown rate mode')
  }

  check(
    (
      await supabase
        .from('comm_schemes')
        .update({
          enable_product_revenue: formData.get('enable_product_revenue') === 'on',
          enable_kpi: formData.get('enable_kpi') === 'on',
          enable_open_bill: formData.get('enable_open_bill') === 'on',
          enable_override: formData.get('enable_override') === 'on',
          enable_margin_penalty: formData.get('enable_margin_penalty') === 'on',
          enable_margin_incentive: formData.get('enable_margin_incentive') === 'on',
          enable_group_incentive: groupIncentiveOn,
          group_sales_depth: groupDepth,
          override_depth: overrideDepth,
          direct_line_limit: directLimit,
          override_includes_kpi: formData.get('override_includes_kpi') === 'on',
          open_bill_basis: basis || 'uplift_on_commission',
          default_rate_mode: rateMode || 'variable',
          deposit_threshold_pct: depositOn ? depositPct : null,
          revenue_cost_divisor: costDivisor ?? 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    ).error,
    'Could not save the scheme',
  )

  refresh()
}

// ─── Ranks ──────────────────────────────────────────────────────────────────

/**
 * The Rank tab (user 2026-09-05: "rank A 等于多少 rate、rank B 等于多少 rate
 * … 除非我在 rank 的那个 tab 里去调"). A rank is its pay and is a row of
 * `comm_rank_defs`; nobody names one. After every write the catalogue is
 * re-sequenced by pay — `sort_order` 10, 20, 30 … from the bottom, `label`
 * "Rank SS", "Rank A", "Rank B" … from the top (`lib/commission/ranks.ts`) —
 * so a rank keyed in at 6.5% lands between 6% and 7% and every letter above
 * it moves along. Packages sit above percentage ranks. Duplicate complete
 * pay packages are refused (`uq_comm_rank_def_package` says the same).
 *
 * The rungs of the ladder point at a rank and COPY its rate, label and order
 * — trigger `comm_ranks_follow_rank_def` on the way in, and
 * `comm_rank_defs_propagate` pushing a re-rate down — so the engine, the
 * statements and the hierarchy never notice the split.
 */
export async function upsertRankDef(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = text(formData, 'id')
  const schemeId = required(formData, 'scheme_id', 'Scheme')
  const rate = pct(formData, 'product_rate')
  if (rate === null || rate < 0 || rate > 1) {
    throw new Error('Commission rate must be between 0 and 100%')
  }
  const incentive = num(formData, 'group_incentive_amount') ?? 0
  const subsidy = num(formData, 'group_subsidy_cap') ?? 0
  const error = rankPayError({ productRate: rate, groupIncentiveAmount: incentive, groupSubsidyCap: subsidy })
  if (error) throw new Error(error)
  const pay = { product_rate: rate, group_incentive_amount: incentive, group_subsidy_cap: subsidy }

  const catalogue = await loadRankDefs(supabase, schemeId)
  const clash = catalogue.find(d => d.id !== id
    && Math.abs(Number(d.product_rate) - rate) < 1e-9
    && Number(d.group_incentive_amount) === incentive
    && Number(d.group_subsidy_cap) === subsidy)
  if (clash) {
    throw new Error(`${rankLabelOf(clash)} already exists — give this rank different pay`)
  }

  if (id) {
    check(
      (await supabase.from('comm_rank_defs').update(pay).eq('id', id).eq('scheme_id', schemeId)).error,
      'Could not save the rank',
    )
  } else {
    // Appended at the bottom; the re-sequence below puts it where its rate
    // belongs and letters it.
    const bottom = catalogue.reduce((max, d) => Math.max(max, d.sort_order), 0) + 10
    const { error } = await supabase
      .from('comm_rank_defs')
      .insert({ scheme_id: schemeId, ...pay, label: rankName('?'), sort_order: bottom })
    check(error, 'Could not add the rank')
  }

  await resequenceRanks(supabase, schemeId)
  refresh()
}

/** Remove a rank no title sits on. One with a title on it is refused: move the title first. */
export async function deleteRankDef(id: string) {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  if (!id) throw new Error('Which rank?')

  const { data: found } = await supabase
    .from('comm_rank_defs')
    .select('id, scheme_id, label')
    .eq('id', id)
    .maybeSingle()
  const rank = found as { id: string; scheme_id: string; label: string } | null
  if (!rank) throw new Error('That rank is already gone')

  const holder = (await loadLadderRows(supabase, rank.scheme_id)).find(r => r.rank_def_id === id)
  if (holder) {
    throw new Error(`${rank.label} is ${holder.title_name ?? 'a title'}'s — move that title to another rank on the ladder first`)
  }

  check((await supabase.from('comm_rank_defs').delete().eq('id', id)).error, 'Could not remove the rank')
  await resequenceRanks(supabase, rank.scheme_id)
  refresh()
}

// ─── Title ladder ────────────────────────────────────────────────────────────

/**
 * One rung of the ladder: a title (a Team → Roles row — fixed once the rung
 * exists; only the row that adds a rung picks one, user 2026-09-05), the RANK
 * it pays (picked from the Rank tab's catalogue; the rate follows the rank
 * and is never keyed in here), whether it may recruit, and the gate that
 * climbs to it. A rank pays one title, so a rank another rung already holds
 * is refused (`uq_comm_rank_def` says the same).
 *
 * A NEW rung (no id) gets its identity here: `rank_key` is minted from the
 * title's initials and the rate (`stl_11`) — it is the key positions and
 * statements hang off, so it never changes once written, and it never
 * carries the letter, which does. Moving the rung to another rank later
 * keeps the key: it is a name, not a description.
 */
export async function upsertRank(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = text(formData, 'id')
  const schemeId = required(formData, 'scheme_id', 'Scheme')
  const rankDefId = required(formData, 'rank_def_id', 'Rank')

  // A rung carries at most one gate: a monthly group-sales target, or a
  // personal-sales streak (so much, so many months running) that is earned
  // for good. Both at once would leave the engine two answers.
  const groupGate = num(formData, 'group_sales_threshold')
  const streakAmount = num(formData, 'personal_sales_threshold')
  const streakMonths = num(formData, 'consecutive_months')
  if (groupGate !== null && streakAmount !== null) {
    throw new Error('A rung takes either a group-sales target or a personal-sales streak, not both')
  }
  if ((streakAmount === null) !== (streakMonths === null)) {
    throw new Error('A personal-sales streak needs both the amount and how many months running')
  }
  if (streakMonths !== null && (!Number.isInteger(streakMonths) || streakMonths < 1)) {
    throw new Error('Months running must be a whole number of at least 1')
  }

  // The Revenue Director's rung (2026-09-27) sets the rate of their own bills:
  // nobody is promoted into it, so no gate; it always recruits; a percentage.
  // The database refuses the same (23DIR) — this says it before the write.
  const rungTitleId = id
    ? ((await supabase.from('comm_ranks').select('title_id').eq('id', id).eq('scheme_id', schemeId).maybeSingle())
      .data as { title_id: string | null } | null)?.title_id ?? null
    : text(formData, 'title_id') || null
  const directorRung = rungTitleId !== null && Boolean(
    ((await supabase.from('titles').select('is_department_head').eq('id', rungTitleId).maybeSingle())
      .data as { is_department_head: boolean } | null)?.is_department_head,
  )
  if (directorRung && (groupGate !== null || streakAmount !== null || streakMonths !== null)) {
    throw new Error('The Revenue Director’s rung only sets the rate of their own bills — nobody is promoted into it, so leave the group target and the streak blank')
  }

  const rank = (await loadRankDefs(supabase, schemeId)).find(d => d.id === rankDefId)
  if (!rank) throw new Error('Pick a rank — they are set on the Ranks tab')
  if (directorRung && Number(rank.group_incentive_amount) > 0) {
    throw new Error('A Revenue Director is paid a percentage on their own bills — pick a percentage rank, not a group package')
  }
  if (Number(rank.group_incentive_amount) > 0) {
    const { data: packages, error: packageReadError } = await supabase.from('comm_ranks')
      .select('id').eq('scheme_id', schemeId).gt('group_incentive_amount', 0)
    check(packageReadError, 'Could not read the group package')
    if ((packages ?? []).some((r: { id: string }) => r.id !== id)) {
      throw new Error('Only one group-incentive rung can be used on this scheme. Edit the existing package rung instead.')
    }
  }
  if (Number(rank.group_incentive_amount) > 0
    && (groupGate === null || groupGate <= 0 || streakAmount !== null || streakMonths !== null)) {
    throw new Error('A group package needs a positive monthly group-sales target and no personal-sales streak')
  }

  const ladder = await loadLadderRows(supabase, schemeId)
  if (id && !ladder.some(r => r.id === id)) {
    throw new Error('That rung does not belong to this scheme. Refresh the title ladder before saving.')
  }
  const clash = ladder.find(r => r.id !== id && r.rank_def_id === rankDefId)
  if (clash) {
    throw new Error(
      `${rankLabelOf(rank)} is already ${clash.title_name ?? 'another title'}'s — a rank pays one title`,
    )
  }

  const base = {
    scheme_id: schemeId,
    rank_def_id: rankDefId,
    // Copies the trigger keeps; written here too so the row reads right on
    // its own.
    product_rate: Number(rank.product_rate),
    group_incentive_amount: Number(rank.group_incentive_amount),
    group_subsidy_cap: Number(rank.group_subsidy_cap),
    label: rank.label,
    sort_order: rank.sort_order,
    // A director may always have people under them.
    can_recruit: directorRung || formData.get('can_recruit') === 'on',
    group_sales_threshold: groupGate,
    personal_sales_threshold: streakAmount,
    consecutive_months: streakMonths,
  }

  if (id) {
    // The title is not in `base`: fixed once the rung exists.
    check((await supabase.from('comm_ranks').update(base).eq('id', id).eq('scheme_id', schemeId)).error, 'Could not save the rung')
  } else {
    const titleId = required(formData, 'title_id', 'Title')
    const { data: title } = await supabase.from('titles').select('name').eq('id', titleId).maybeSingle()
    const titleName = (title as { name: string } | null)?.name
    if (!titleName) throw new Error('Pick a title for the rung')

    const { error } = await supabase.from('comm_ranks').insert({
      ...base,
      title_id: titleId,
      rank_key: mintRankKey(titleName, Number(rank.product_rate), new Set(ladder.map(r => r.rank_key))),
    })
    check(error, 'Could not add the rung')
  }

  refresh()
}

interface RankDefLite {
  id: string
  label: string
  product_rate: number | string
  group_incentive_amount: number | string
  group_subsidy_cap: number | string
  sort_order: number
}

async function loadRankDefs(supabase: SupabaseClient, schemeId: string): Promise<RankDefLite[]> {
  const { data, error } = await supabase
    .from('comm_rank_defs')
    .select('id, label, product_rate, group_incentive_amount, group_subsidy_cap, sort_order')
    .eq('scheme_id', schemeId)
  check(error, 'Could not read the ranks')
  return (data ?? []) as RankDefLite[]
}

interface LadderRow {
  id: string
  rank_key: string
  rank_def_id: string
  title_name: string | null
}

async function loadLadderRows(supabase: SupabaseClient, schemeId: string): Promise<LadderRow[]> {
  const { data, error } = await supabase
    .from('comm_ranks')
    .select('id, rank_key, rank_def_id, titles (name)')
    .eq('scheme_id', schemeId)
  check(error, 'Could not read the ladder')
  return ((data ?? []) as Array<{
    id: string
    rank_key: string
    rank_def_id: string
    titles: { name: string } | { name: string }[] | null
  }>).map(r => ({
    id: r.id,
    rank_key: r.rank_key,
    rank_def_id: r.rank_def_id,
    title_name: (Array.isArray(r.titles) ? r.titles[0] : r.titles)?.name ?? null,
  }))
}

/**
 * Rewrite the catalogue's `sort_order` and `label` so its order is its rate
 * order and every rank wears the letter counted from the top — a rank nobody
 * has put a title on yet included. Only rows whose values change are written;
 * the trigger copies each change down to the rung on that rank.
 */
async function resequenceRanks(supabase: SupabaseClient, schemeId: string): Promise<void> {
  const catalogue = await loadRankDefs(supabase, schemeId)
  const byId = new Map(catalogue.map(d => [d.id, d]))
  const next = resequenceLadder(
    catalogue.map(d => ({ id: d.id, ...rankPayOf(d), sortOrder: d.sort_order })),
  )
  const changed = next.filter(d => {
    const cur = byId.get(d.id)
    return !cur || cur.sort_order !== d.sortOrder || cur.label !== d.label
  })
  for (const d of changed) {
    check(
      (await supabase.from('comm_rank_defs').update({ sort_order: d.sortOrder, label: d.label }).eq('id', d.id)).error,
      'Could not re-letter the ranks',
    )
  }
}

// ─── Directors ──────────────────────────────────────────────────────────────

/**
 * Rules › Directors (2026-09-27): what this sub-department pays one of the
 * directors it reports to — a fixed amount (their base commission) and an
 * incentive paid in a month whose Commissionable value reaches the threshold.
 * The database checks they direct the scheme's sub-department (23DIR); the
 * engine adds both to their commission on Comm Cal.
 */
export async function upsertDirectorPay(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  const schemeId = required(formData, 'scheme_id', 'Scheme')
  const staffId = required(formData, 'staff_id', 'Director')
  const pay = checkDirectorPay({
    fixedAmount: num(formData, 'fixed_amount'),
    salesThreshold: num(formData, 'sales_threshold'),
    incentiveAmount: num(formData, 'incentive_amount'),
  })
  const { error } = await supabase.from('comm_director_pay').upsert({
    scheme_id: schemeId,
    staff_id: staffId,
    fixed_amount: pay.fixedAmount,
    sales_threshold: pay.salesThreshold,
    incentive_amount: pay.incentiveAmount,
  }, { onConflict: 'scheme_id,staff_id' })
  check(error, 'Could not save the director’s pay')
  refresh()
}

// ─── Item groups ────────────────────────────────────────────────────────────

export async function upsertItemGroup(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const row = {
    scheme_id: required(formData, 'scheme_id', 'Scheme'),
    item_group: required(formData, 'item_group', 'Item group').toUpperCase(),
    commissionable: formData.get('commissionable') === 'on',
    note: text(formData, 'note') || null,
  }

  check(
    (
      await supabase
        .from('comm_item_groups')
        .upsert(row, { onConflict: 'scheme_id,item_group' })
    ).error,
    'Could not save the item group',
  )

  refresh()
}

// ─── KPI items and thresholds ───────────────────────────────────────────────

// KPI items are set on Rules › KPI items (`kpi-actions.ts` saveKpiItems — the
// Product List's Add-on / KPI Items from 2026-09-27 until 2026-10-08): a SKU or
// a special, effective-dated. The threshold ladder below is on the same tab.

export async function upsertKpiThreshold(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = text(formData, 'id')
  const minQty = num(formData, 'min_qty')
  const bonus = pct(formData, 'bonus_pct')
  if (minQty === null || minQty <= 0) throw new Error('Minimum quantity must be more than zero')
  if (bonus === null || bonus < 0) throw new Error('Bonus must be zero or more')

  const row = {
    scheme_id: required(formData, 'scheme_id', 'Scheme'),
    tier_label: text(formData, 'tier_label') || null,
    min_qty: minQty,
    bonus_pct: bonus,
    effective_from: text(formData, 'effective_from') || officeToday(),
  }

  check(
    id
      ? (await supabase.from('comm_kpi_thresholds').update(row).eq('id', id)).error
      : (await supabase.from('comm_kpi_thresholds').insert(row)).error,
    'Could not save the KPI threshold',
  )

  refresh()
}

export async function deleteKpiThreshold(id: string) {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  check((await supabase.from('comm_kpi_thresholds').delete().eq('id', id)).error, 'Could not remove the threshold')
  refresh()
}

// ─── Open Bill ──────────────────────────────────────────────────────────────

export async function updateOpenBillRule(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = required(formData, 'id', 'Rule')
  const p = pct(formData, 'pct')
  if (p === null || p < 0 || p > 1) throw new Error('Open Bill bonus must be between 0 and 100%')

  check((await supabase.from('comm_open_bill_rules').update({ pct: p }).eq('id', id)).error, 'Could not save the Open Bill rate')
  refresh()
}

// ─── Brands and margin bands ────────────────────────────────────────────────

export async function upsertBrand(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = text(formData, 'id')
  // "AK-, AKE" → ['AK-','AKE']. These are matched against the ERP Item Code.
  const prefixes = text(formData, 'item_code_prefixes')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)

  const row = {
    scheme_id: required(formData, 'scheme_id', 'Scheme'),
    code: required(formData, 'code', 'Brand code').toUpperCase(),
    name: required(formData, 'name', 'Brand name'),
    item_code_prefixes: prefixes,
    note: text(formData, 'note') || null,
    is_active: formData.get('is_active') !== 'off',
  }

  check(
    id
      ? (await supabase.from('comm_brands').update(row).eq('id', id)).error
      : (await supabase.from('comm_brands').insert(row)).error,
    'Could not save the brand',
  )

  refresh()
}

export async function upsertMarginBand(formData: FormData) {
  await requireAction('revenue', 'manage')
  const supabase = await client()

  const id = text(formData, 'id')
  const kind = required(formData, 'kind', 'Kind')
  if (!['incentive', 'reference', 'penalty'].includes(kind)) throw new Error('Unknown band kind')

  const marginPct = pct(formData, 'margin_pct')
  if (marginPct === null) throw new Error('Margin threshold is required')

  const multiplier = kind === 'penalty' ? num(formData, 'commission_multiplier') : 1
  if (kind === 'penalty' && (multiplier === null || multiplier < 0 || multiplier > 1)) {
    throw new Error('A penalty multiplier must be between 0 and 1')
  }
  const incentive = kind === 'incentive' ? num(formData, 'monthly_incentive') : 0
  if (kind === 'incentive' && (incentive === null || incentive < 0)) {
    throw new Error('An incentive amount must be zero or more')
  }

  const row = {
    scheme_id: required(formData, 'scheme_id', 'Scheme'),
    brand_id: required(formData, 'brand_id', 'Brand'),
    band_key: required(formData, 'band_key', 'Band key'),
    label: required(formData, 'label', 'Label'),
    kind,
    margin_pct: marginPct,
    commission_multiplier: multiplier ?? 1,
    monthly_incentive: incentive ?? 0,
    sort_order: num(formData, 'sort_order') ?? 0,
  }

  check(
    id
      ? (await supabase.from('comm_margin_bands').update(row).eq('id', id)).error
      : (await supabase.from('comm_margin_bands').insert(row)).error,
    'Could not save the margin band',
  )

  refresh()
}

export async function deleteMarginBand(id: string) {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  check((await supabase.from('comm_margin_bands').delete().eq('id', id)).error, 'Could not remove the band')
  refresh()
}

// ─── Quick switches on the month page (2026-09-24) ──────────────────────────

/**
 * What a run pays, switched from the month it is about. The SAME columns as
 * Rules › Scheme rules — one setting, two places to reach it — so the two can
 * never disagree. Margin is one switch here because the user asked for it as
 * one ("margin incentive & penalty"): it sets the penalty and the incentive
 * together; Rules still sets them apart. Off means the run pays none of it;
 * every run computed afterwards follows.
 */
export type SchemeSwitch = 'open_bill' | 'margin' | 'kpi'

/**
 * Open Bill for ONE month (2026-09-26 — user: "open for august, not
 * september"). Rules › Scheme rules sets every month; a month may carry its
 * own setting over it (`comm_open_bill_months`), which is what the run, the
 * picks and the feed's suggestions for that month read (`comm_open_bill_on`).
 * `null`, or the same value as Rules, clears it: the month follows Rules again.
 * A month whose run has paid keeps what it paid.
 */
export async function setMonthOpenBill(subDepartmentId: string, period: string, on: boolean | null): Promise<void> {
  const user = await requireAction('revenue', 'manage')
  if (!/^\d{4}-\d{2}-01$/.test(period)) throw new Error('A month is its first day, e.g. 2026-08-01')
  const supabase = await client()

  const [{ data: locked, error: lockError }, { data: scheme, error: schemeError }] = await Promise.all([
    supabase.rpc('commission_order_period_locked', { p_sub_department_id: subDepartmentId, p_period: period }),
    supabase.from('comm_schemes').select('enable_open_bill')
      .eq('sub_department_id', subDepartmentId).eq('is_active', true).is('effective_to', null).maybeSingle(),
  ])
  if (lockError) throw new Error(`Could not check the commission run: ${lockError.message}`)
  if (locked) throw new Error(`The ${period.slice(0, 7)} month is in payroll, so what it pays cannot change.`)
  if (schemeError) throw new Error(`Could not read Rules: ${schemeError.message}`)
  const rules = Boolean((scheme as { enable_open_bill: boolean } | null)?.enable_open_bill)

  if (on === null || on === rules) {
    check(
      (await supabase.from('comm_open_bill_months').delete()
        .eq('sub_department_id', subDepartmentId).eq('period_month', period)).error,
      'Could not change the month',
    )
  } else {
    check(
      (await supabase.from('comm_open_bill_months').upsert({
        sub_department_id: subDepartmentId,
        period_month: period,
        enabled: on,
        set_by: user.id,
        set_by_name: user.name,
        set_at: new Date().toISOString(),
      })).error,
      'Could not change the month',
    )
  }
  refresh()
}

export async function setSchemeSwitch(schemeId: string, which: SchemeSwitch, on: boolean): Promise<void> {
  await requireAction('revenue', 'manage')
  const supabase = await client()
  const patch =
    which === 'open_bill'
      ? { enable_open_bill: on }
      : which === 'kpi'
        ? { enable_kpi: on }
        : { enable_margin_penalty: on, enable_margin_incentive: on }
  check(
    (await supabase.from('comm_schemes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', schemeId)).error,
    'Could not change the switch',
  )
  refresh()
}
