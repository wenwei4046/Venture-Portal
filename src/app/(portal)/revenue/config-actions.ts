'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { RESERVED_SUB_DEPT_SLUGS, subDeptSlug } from '@/lib/revenue'

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
 */
export async function createSubDepartment(formData: FormData) {
  const user = await requirePermission('revenue')
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
    ? (await supabase.from('comm_schemes').select('*').eq('id', cloneFrom).single()).data
    : null

  const { data: scheme, error: schemeError } = await supabase
    .from('comm_schemes')
    .insert({
      sub_department_id: sub!.id,
      scheme_name: `${name} scheme`,
      cloned_from_scheme_id: cloneFrom,
      effective_from: new Date().toISOString().slice(0, 8) + '01',
      created_by: user.id,
      ...(source
        ? {
            open_bill_basis: source.open_bill_basis,
            override_includes_kpi: source.override_includes_kpi,
            enable_product_revenue: source.enable_product_revenue,
            enable_kpi: source.enable_kpi,
            enable_open_bill: source.enable_open_bill,
            enable_override: source.enable_override,
            enable_margin_penalty: source.enable_margin_penalty,
            enable_margin_incentive: source.enable_margin_incentive,
            deposit_threshold_pct: source.deposit_threshold_pct,
            default_rate_mode: source.default_rate_mode,
          }
        : {}),
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
 * Copy every rule row from one scheme to another. Brands are copied first
 * because the margin bands hang off them and need the NEW brand ids.
 */
async function cloneSchemeChildren(
  supabase: SupabaseClient,
  fromSchemeId: string,
  toSchemeId: string,
) {
  const simple: Array<[table: string, columns: string[]]> = [
    ['comm_ranks', ['title_id', 'rank_key', 'label', 'product_rate', 'can_recruit', 'group_sales_threshold', 'sort_order']],
    ['comm_item_groups', ['item_group', 'commissionable', 'note']],
    ['comm_kpi_items', ['product_code', 'product_name', 'kpi_amount', 'effective_from', 'effective_to']],
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
  await requirePermission('revenue')
  const supabase = await client()

  const id = required(formData, 'scheme_id', 'Scheme')
  const depositOn = formData.get('deposit_gate_on') === 'on'
  const depositPct = pct(formData, 'deposit_threshold_pct')

  if (depositOn && depositPct === null) {
    throw new Error('Give the deposit gate a threshold, or switch it off')
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
          override_includes_kpi: formData.get('override_includes_kpi') === 'on',
          open_bill_basis: basis || 'uplift_on_commission',
          default_rate_mode: rateMode || 'variable',
          deposit_threshold_pct: depositOn ? depositPct : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    ).error,
    'Could not save the scheme',
  )

  refresh()
}

// ─── Tier ladder ────────────────────────────────────────────────────────────

/**
 * One rung: its title (a Team → Role & Permission row), label, rate, whether
 * it may recruit, and the group-sales target that climbs to it.
 *
 * A NEW rung (no id) gets its identity here: `rank_key` is minted from the
 * label — it is the key positions and statements hang off, so it never
 * changes once written — and it lands at the bottom of the ladder unless a
 * sort order was given. The tick ordering IS the ladder: a title sits where
 * its lowest rung sits (titles.ts), so where a rung goes decides who
 * outranks whom.
 */
export async function upsertRank(formData: FormData) {
  await requirePermission('revenue')
  const supabase = await client()

  const id = text(formData, 'id')
  const schemeId = required(formData, 'scheme_id', 'Scheme')
  const label = required(formData, 'label', 'Label')
  const rate = pct(formData, 'product_rate')
  if (rate === null || rate < 0 || rate > 1) {
    throw new Error('Commission rate must be between 0 and 100%')
  }

  const base = {
    scheme_id: schemeId,
    title_id: required(formData, 'title_id', 'Title'),
    label,
    product_rate: rate,
    can_recruit: formData.get('can_recruit') === 'on',
    group_sales_threshold: num(formData, 'group_sales_threshold'),
  }

  if (id) {
    check(
      (await supabase.from('comm_ranks').update({ ...base, sort_order: num(formData, 'sort_order') ?? 0 }).eq('id', id)).error,
      'Could not save the rank',
    )
    refresh()
    return
  }

  let sortOrder = num(formData, 'sort_order')
  if (sortOrder === null) {
    const { data: last } = await supabase
      .from('comm_ranks')
      .select('sort_order')
      .eq('scheme_id', schemeId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10
  }

  const { error } = await supabase.from('comm_ranks').insert({
    ...base,
    rank_key: text(formData, 'rank_key') || rankKeyFrom(label),
    sort_order: sortOrder,
  })
  if (error?.code === '23505') {
    throw new Error('A rank with that key already exists on this ladder — give it a different label')
  }
  check(error, 'Could not add the rank')

  refresh()
}

/** "Team Leader - 11%" → "team_leader_11". Stable, readable, unique per label. */
function rankKeyFrom(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/%/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!key) throw new Error('Give the rank a label the key can be made from')
  return key
}

// ─── Item groups ────────────────────────────────────────────────────────────

export async function upsertItemGroup(formData: FormData) {
  await requirePermission('revenue')
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

export async function upsertKpiItem(formData: FormData) {
  const user = await requirePermission('revenue')
  const supabase = await client()

  const id = text(formData, 'id')
  const amount = num(formData, 'kpi_amount')
  if (amount === null || amount < 0) throw new Error('KPI amount must be zero or more')

  const row = {
    scheme_id: required(formData, 'scheme_id', 'Scheme'),
    product_code: required(formData, 'product_code', 'Item code'),
    product_name: text(formData, 'product_name') || null,
    kpi_amount: amount,
    effective_from: text(formData, 'effective_from') || new Date().toISOString().slice(0, 10),
    created_by: user.id,
  }

  check(
    id
      ? (await supabase.from('comm_kpi_items').update(row).eq('id', id)).error
      : (await supabase.from('comm_kpi_items').insert(row)).error,
    'Could not save the KPI item',
  )

  refresh()
}

export async function deleteKpiItem(id: string) {
  await requirePermission('revenue')
  const supabase = await client()
  check((await supabase.from('comm_kpi_items').delete().eq('id', id)).error, 'Could not remove the KPI item')
  refresh()
}

export async function upsertKpiThreshold(formData: FormData) {
  await requirePermission('revenue')
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
    effective_from: text(formData, 'effective_from') || new Date().toISOString().slice(0, 10),
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
  await requirePermission('revenue')
  const supabase = await client()
  check((await supabase.from('comm_kpi_thresholds').delete().eq('id', id)).error, 'Could not remove the threshold')
  refresh()
}

// ─── Open Bill ──────────────────────────────────────────────────────────────

export async function updateOpenBillRule(formData: FormData) {
  await requirePermission('revenue')
  const supabase = await client()

  const id = required(formData, 'id', 'Rule')
  const p = pct(formData, 'pct')
  if (p === null || p < 0 || p > 1) throw new Error('Open Bill bonus must be between 0 and 100%')

  check((await supabase.from('comm_open_bill_rules').update({ pct: p }).eq('id', id)).error, 'Could not save the Open Bill rate')
  refresh()
}

// ─── Brands and margin bands ────────────────────────────────────────────────

export async function upsertBrand(formData: FormData) {
  await requirePermission('revenue')
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
  await requirePermission('revenue')
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
  await requirePermission('revenue')
  const supabase = await client()
  check((await supabase.from('comm_margin_bands').delete().eq('id', id)).error, 'Could not remove the band')
  refresh()
}
