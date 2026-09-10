import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type {
  CommissionSettingsData,
  MemberCandidate,
  ProductRow,
  RankDefRow,
  RankRow,
  SalespersonRow,
  SchemeRow,
  TeamData,
  TitleRow,
} from './types'

/**
 * Everything the Rules page renders for ONE sub-department, in one round
 * trip's worth of queries.
 *
 * Every rule table carries a `scheme_id`, so all of them are filtered by the
 * scheme the route resolved to. Only the three lists the "generate a new
 * sub-department" form needs — the sub-departments, their schemes, and the
 * departments a new one may hang off — are read unscoped, because that form
 * exists precisely to reach beyond the one on screen.
 *
 * comm_* / sales_* postdate the generated database.types.ts, so this uses the
 * untyped-client convention (ba_*, bank_recon_* do the same). Every row is cast
 * once here, at the boundary, so the components stay typed.
 */
async function untyped(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

export async function loadCommissionSettings(
  schemeId: string | null,
): Promise<CommissionSettingsData> {
  const supabase = await untyped()

  // The clone picker's raw material — deliberately every sub-department, not
  // just the one on screen.
  const [subDepartments, allSchemes, departments, titles] = await Promise.all([
    supabase.from('comm_sub_departments').select('id, department_id, name, code, is_active').order('name'),
    supabase.from('comm_schemes').select('id, sub_department_id, scheme_name').eq('is_active', true).is('effective_to', null),
    supabase.from('departments').select('id, name').eq('payroll_source', 'commission').order('name'),
    // The ladder's Tier column picks from these — the titles the Revenue side
    // keeps under Team → Role & Permission. Unscoped like the lists above:
    // a sub-department cloned under another commission department needs them.
    supabase
      .from('titles')
      .select('id, name, departments!inner (payroll_source)')
      .eq('departments.payroll_source', 'commission')
      .eq('is_active', true)
      .order('name'),
  ])

  const shell = {
    scheme: null,
    rankDefs: [],
    ranks: [],
    titles: rows<{ id: string; name: string }>(titles.data).map(t => ({ id: t.id, name: t.name })) satisfies TitleRow[],
    itemGroups: [],
    kpiItems: [],
    kpiThresholds: [],
    openBillRules: [],
    brands: [],
    marginBands: [],
    promotionRules: [],
    subDepartments: rows(subDepartments.data),
    allSchemes: rows(allSchemes.data),
    commissionDepartments: rows(departments.data),
  } satisfies CommissionSettingsData

  if (!schemeId) return shell

  const [
    scheme,
    rankDefs,
    ranks,
    itemGroups,
    kpiItems,
    kpiThresholds,
    openBillRules,
    brands,
    marginBands,
    promotionRules,
  ] = await Promise.all([
    supabase.from('comm_schemes').select('*').eq('id', schemeId).maybeSingle(),
    supabase.from('comm_rank_defs').select('*').eq('scheme_id', schemeId).order('sort_order'),
    supabase.from('comm_ranks').select('*').eq('scheme_id', schemeId).order('sort_order'),
    supabase.from('comm_item_groups').select('*').eq('scheme_id', schemeId).order('item_group'),
    supabase.from('comm_kpi_items').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('product_code'),
    supabase.from('comm_kpi_thresholds').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('min_qty'),
    supabase.from('comm_open_bill_rules').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('bill_rank'),
    supabase.from('comm_brands').select('*').eq('scheme_id', schemeId).order('code'),
    supabase.from('comm_margin_bands').select('*').eq('scheme_id', schemeId).order('sort_order'),
    supabase.from('comm_promotion_rules').select('*').eq('scheme_id', schemeId).order('from_rank_key').order('alternative_group'),
  ])

  return {
    ...shell,
    scheme: (scheme.data as SchemeRow | null) ?? null,
    rankDefs: rows<RankDefRow>(rankDefs.data),
    ranks: rows(ranks.data),
    itemGroups: rows(itemGroups.data),
    kpiItems: rows(kpiItems.data),
    kpiThresholds: rows(kpiThresholds.data),
    openBillRules: rows(openBillRules.data),
    brands: rows(brands.data),
    marginBands: rows(marginBands.data),
    promotionRules: rows(promotionRules.data),
  }
}

/**
 * Staff Hierarchy's load — the ladder and the people, for BOTH of its tabs.
 * The org chart and the Team table are two views of one read (user
 * 2026-09-05: move somebody on the chart and the table follows), so they are
 * handed the same rows rather than each reading their own.
 *
 * MEMBERSHIPS (2026-09-10). A sub-department is a world of its own, so the
 * people here are its MEMBERS — the open `comm_hierarchy` rows of this scheme
 * — each with the title, upline and rank held here. Two shapes:
 *
 *   home      the department's oldest sub-department. Everybody active in the
 *             department is on its chart: the database opens their membership
 *             from `reports_to` and the company title, and somebody whose
 *             title has no rung yet still stands on the tree with "no rank
 *             yet". Nobody can be added or removed by hand — it is the roster.
 *   other     members only, added by hand with a title of their own. Whoever
 *             is in the department but not a member yet is a `candidate`.
 */
export async function loadTeam(schemeId: string, opts: { isHome: boolean }): Promise<TeamData> {
  const supabase = await untyped()

  const [{ data: rankRows }, { data: staffRows }, { data: positions }, { data: levelRows }, { data: titleRows }] =
    await Promise.all([
      supabase.from('comm_ranks').select('*').eq('scheme_id', schemeId).order('sort_order'),
      supabase
        .from('hr_staff_costs')
        .select('id, employee_name, employee_code, reports_to, tax_mode, withholding_rate, title_id, titles (name, level_id), departments!inner (name, payroll_source)')
        .eq('status', 'active')
        .eq('departments.payroll_source', 'commission')
        .order('employee_name'),
      supabase
        .from('comm_hierarchy')
        .select('id, staff_id, scheme_id, upline_staff_id, rank_id, rate_mode, effective_from, title_id, titles (name, level_id), comm_ranks (rank_key, label)')
        .eq('scheme_id', schemeId)
        .is('effective_to', null),
      // The company ladder: the Team table reads it top down (user, 2026-09-05).
      supabase.from('title_levels').select('id, rank, name'),
      // The titles a membership may hold: the commission departments' own.
      supabase
        .from('titles')
        .select('id, name, departments!inner (payroll_source)')
        .eq('departments.payroll_source', 'commission')
        .eq('is_active', true)
        .order('name'),
    ])

  const rungByLevel = new Map(
    rows<{ id: string; rank: number; name: string }>(levelRows).map(l => [l.id, l]),
  )

  interface TitleEmbed {
    name: string
    level_id: string | null
  }
  const oneTitle = (t: TitleEmbed | TitleEmbed[] | null | undefined): TitleEmbed | null =>
    Array.isArray(t) ? (t[0] ?? null) : (t ?? null)

  const positionByStaff = new Map(
    rows<{
      id: string
      staff_id: string
      scheme_id: string
      upline_staff_id: string | null
      rank_id: string
      rate_mode: 'fixed' | 'variable' | null
      effective_from: string
      title_id: string | null
      titles: TitleEmbed | TitleEmbed[] | null
      comm_ranks: { rank_key: string; label: string } | { rank_key: string; label: string }[] | null
    }>(positions).map(p => [p.staff_id, p]),
  )

  const staff = rows<{
    id: string
    employee_name: string
    employee_code: string | null
    reports_to: string | null
    tax_mode: 'pcb' | 'withholding' | 'none' | null
    withholding_rate: number | null
    title_id: string | null
    titles: TitleEmbed | TitleEmbed[] | null
  }>(staffRows)

  const people: SalespersonRow[] = staff
    .filter(s => opts.isHome || positionByStaff.has(s.id))
    .map(s => {
      const pos = positionByStaff.get(s.id)
      const companyTitle = oneTitle(s.titles)
      // The title held HERE. The home membership mirrors the roster, so for
      // somebody the home chart draws without a membership yet (a title with
      // no rung) the roster's title is the right one to show.
      const title = pos ? oneTitle(pos.titles) : opts.isHome ? companyTitle : null
      const titleId = pos ? (pos.title_id ?? null) : opts.isHome ? (s.title_id ?? null) : null
      const rung = title?.level_id ? (rungByLevel.get(title.level_id) ?? null) : null
      const rank = Array.isArray(pos?.comm_ranks) ? (pos?.comm_ranks[0] ?? null) : (pos?.comm_ranks ?? null)
      return {
        staff_id: s.id,
        employee_name: s.employee_name,
        employee_code: s.employee_code,
        title_id: titleId,
        title_name: title?.name ?? null,
        title_level_rank: rung?.rank ?? null,
        title_level_name: rung?.name ?? null,
        company_title_name: companyTitle?.name ?? null,
        hierarchy_id: pos?.id ?? null,
        upline_staff_id: opts.isHome ? (s.reports_to ?? null) : (pos?.upline_staff_id ?? null),
        reports_to: s.reports_to ?? null,
        rank_id: pos?.rank_id ?? null,
        rank_key: rank?.rank_key ?? null,
        rank_label: rank?.label ?? null,
        rate_mode: pos?.rate_mode ?? null,
        placed_since: pos?.effective_from ?? null,
        tax_mode: s.tax_mode ?? 'pcb',
        withholding_rate: Number(s.withholding_rate ?? 0.02),
      }
    })

  const candidates: MemberCandidate[] = opts.isHome
    ? []
    : staff
        .filter(s => !positionByStaff.has(s.id))
        .map(s => ({
          staff_id: s.id,
          employee_name: s.employee_name,
          employee_code: s.employee_code,
          company_title_name: oneTitle(s.titles)?.name ?? null,
        }))

  return {
    ranks: rows<RankRow>(rankRows),
    people,
    titles: rows<{ id: string; name: string }>(titleRows).map(t => ({ id: t.id, name: t.name })),
    candidates,
  }
}

export async function loadProducts(): Promise<ProductRow[]> {
  const supabase = await untyped()
  const { data } = await supabase
    .from('comm_products')
    .select('id, item_code, product_name, brand_code, item_group, unit_cost, is_active, updated_at')
    .order('item_code')
  return rows<ProductRow>(data).map(p => ({ ...p, unit_cost: p.unit_cost === null ? null : Number(p.unit_cost) }))
}
