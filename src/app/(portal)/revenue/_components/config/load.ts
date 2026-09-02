import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { CommissionSettingsData, ProductRow, SalespersonRow, SchemeRow, TitleRow } from './types'

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
    ranks: [],
    titles: rows<{ id: string; name: string }>(titles.data).map(t => ({ id: t.id, name: t.name })) satisfies TitleRow[],
    itemGroups: [],
    kpiItems: [],
    kpiThresholds: [],
    openBillRules: [],
    brands: [],
    marginBands: [],
    promotionRules: [],
    salespeople: [],
    subDepartments: rows(subDepartments.data),
    allSchemes: rows(allSchemes.data),
    commissionDepartments: rows(departments.data),
  } satisfies CommissionSettingsData

  if (!schemeId) return shell

  const [
    scheme,
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
    supabase.from('comm_ranks').select('*').eq('scheme_id', schemeId).order('sort_order'),
    supabase.from('comm_item_groups').select('*').eq('scheme_id', schemeId).order('item_group'),
    supabase.from('comm_kpi_items').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('product_code'),
    supabase.from('comm_kpi_thresholds').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('min_qty'),
    supabase.from('comm_open_bill_rules').select('*').eq('scheme_id', schemeId).is('effective_to', null).order('bill_rank'),
    supabase.from('comm_brands').select('*').eq('scheme_id', schemeId).order('code'),
    supabase.from('comm_margin_bands').select('*').eq('scheme_id', schemeId).order('sort_order'),
    supabase.from('comm_promotion_rules').select('*').eq('scheme_id', schemeId).order('from_rank_key').order('alternative_group'),
  ])

  // Salespeople: staff in a commission department who either sit in THIS
  // scheme or sit nowhere yet. `comm_hierarchy` allows one open position per
  // person across every scheme, so somebody already placed in another
  // sub-department is not offered here — moving them means ending that
  // position, not drawing a second one.
  const { data: staffRows } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, employee_code, tax_mode, withholding_rate, title_id, titles (name), departments!inner (name, payroll_source)')
    .eq('status', 'active')
    .eq('departments.payroll_source', 'commission')
    .order('employee_name')

  const { data: positions } = await supabase
    .from('comm_hierarchy')
    .select('id, staff_id, scheme_id, upline_staff_id, rank_id, rate_mode, comm_ranks (rank_key, label)')
    .is('effective_to', null)

  const positionByStaff = new Map(
    rows<{
      id: string
      staff_id: string
      scheme_id: string
      upline_staff_id: string | null
      rank_id: string
      rate_mode: 'fixed' | 'variable' | null
      comm_ranks: { rank_key: string; label: string } | null
    }>(positions).map(p => [p.staff_id, p]),
  )

  const salespeople: SalespersonRow[] = rows<{
    id: string
    employee_name: string
    employee_code: string | null
    tax_mode: 'pcb' | 'withholding' | 'none' | null
    withholding_rate: number | null
    title_id: string | null
    titles: { name: string } | { name: string }[] | null
  }>(staffRows)
    .filter(s => {
      const pos = positionByStaff.get(s.id)
      return !pos || pos.scheme_id === schemeId
    })
    .map(s => {
      const pos = positionByStaff.get(s.id)
      const title = Array.isArray(s.titles) ? (s.titles[0] ?? null) : s.titles
      return {
        staff_id: s.id,
        employee_name: s.employee_name,
        employee_code: s.employee_code,
        title_id: s.title_id ?? null,
        title_name: title?.name ?? null,
        hierarchy_id: pos?.id ?? null,
        upline_staff_id: pos?.upline_staff_id ?? null,
        rank_id: pos?.rank_id ?? null,
        rank_key: pos?.comm_ranks?.rank_key ?? null,
        rank_label: pos?.comm_ranks?.label ?? null,
        rate_mode: pos?.rate_mode ?? null,
        tax_mode: s.tax_mode ?? 'pcb',
        withholding_rate: Number(s.withholding_rate ?? 0.02),
      }
    })

  return {
    ...shell,
    scheme: (scheme.data as SchemeRow | null) ?? null,
    ranks: rows(ranks.data),
    itemGroups: rows(itemGroups.data),
    kpiItems: rows(kpiItems.data),
    kpiThresholds: rows(kpiThresholds.data),
    openBillRules: rows(openBillRules.data),
    brands: rows(brands.data),
    marginBands: rows(marginBands.data),
    promotionRules: rows(promotionRules.data),
    salespeople,
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
