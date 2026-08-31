import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { CommissionSettingsData, ProductRow, SalespersonRow } from './types'

/**
 * Everything the Commission tab renders, in one round trip's worth of queries.
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

export async function loadCommissionSettings(): Promise<CommissionSettingsData> {
  const supabase = await untyped()

  const [
    subDepartments,
    schemes,
    ranks,
    itemGroups,
    kpiItems,
    kpiThresholds,
    openBillRules,
    brands,
    marginBands,
    promotionRules,
    departments,
  ] = await Promise.all([
    supabase.from('comm_sub_departments').select('id, department_id, name, code, is_active').order('name'),
    supabase.from('comm_schemes').select('*').eq('is_active', true).is('effective_to', null),
    supabase.from('comm_ranks').select('*').order('sort_order'),
    supabase.from('comm_item_groups').select('*').order('item_group'),
    supabase.from('comm_kpi_items').select('*').is('effective_to', null).order('product_code'),
    supabase.from('comm_kpi_thresholds').select('*').is('effective_to', null).order('min_qty'),
    supabase.from('comm_open_bill_rules').select('*').is('effective_to', null).order('bill_rank'),
    supabase.from('comm_brands').select('*').order('code'),
    supabase.from('comm_margin_bands').select('*').order('sort_order'),
    supabase.from('comm_promotion_rules').select('*').order('from_rank_key').order('alternative_group'),
    supabase.from('departments').select('id, name').eq('payroll_source', 'commission').order('name'),
  ])

  // Salespeople: staff in a commission department, with their open position.
  const { data: staffRows } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, employee_code, tax_mode, withholding_rate, departments!inner (name, payroll_source)')
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

  const subDeptById = new Map(
    rows<{ id: string; name: string }>(subDepartments.data).map(s => [s.id, s.name]),
  )
  const schemeToSubDept = new Map(
    rows<{ id: string; sub_department_id: string }>(schemes.data).map(s => [s.id, s.sub_department_id]),
  )

  const salespeople: SalespersonRow[] = rows<{
    id: string
    employee_name: string
    employee_code: string | null
    tax_mode: 'pcb' | 'withholding' | 'none' | null
    withholding_rate: number | null
  }>(staffRows).map(s => {
    const pos = positionByStaff.get(s.id)
    const subDeptId = pos ? schemeToSubDept.get(pos.scheme_id) : undefined
    return {
      staff_id: s.id,
      employee_name: s.employee_name,
      employee_code: s.employee_code,
      hierarchy_id: pos?.id ?? null,
      scheme_id: pos?.scheme_id ?? null,
      sub_department_name: subDeptId ? subDeptById.get(subDeptId) ?? null : null,
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
    subDepartments: rows(subDepartments.data),
    schemes: rows(schemes.data),
    ranks: rows(ranks.data),
    itemGroups: rows(itemGroups.data),
    kpiItems: rows(kpiItems.data),
    kpiThresholds: rows(kpiThresholds.data),
    openBillRules: rows(openBillRules.data),
    brands: rows(brands.data),
    marginBands: rows(marginBands.data),
    promotionRules: rows(promotionRules.data),
    salespeople,
    commissionDepartments: rows(departments.data),
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
