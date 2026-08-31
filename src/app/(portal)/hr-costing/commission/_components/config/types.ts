/**
 * Row shapes for the Settings → Commission tab.
 *
 * These mirror the comm_* tables. They live here rather than in
 * lib/supabase/database.types.ts because those tables postdate the generated
 * types — the untyped-client convention the project already uses for ba_* and
 * bank_recon_*.
 */

export interface SubDeptRow {
  id: string
  department_id: string
  name: string
  code: string | null
  is_active: boolean
}

export interface SchemeRow {
  id: string
  sub_department_id: string
  scheme_name: string
  open_bill_basis: 'uplift_on_commission' | 'pct_of_revenue'
  override_includes_kpi: boolean
  enable_product_revenue: boolean
  enable_kpi: boolean
  enable_open_bill: boolean
  enable_override: boolean
  enable_margin_penalty: boolean
  enable_margin_incentive: boolean
  deposit_threshold_pct: number | null
  default_rate_mode: 'fixed' | 'variable'
}

export interface RankRow {
  id: string
  tier_key: string
  tier_label: string
  rank_key: string
  label: string
  product_rate: number
  can_recruit: boolean
  group_sales_threshold: number | null
  sort_order: number
}

export interface ItemGroupRow {
  id: string
  item_group: string
  commissionable: boolean
  note: string | null
}

export interface KpiItemRow {
  id: string
  product_code: string
  product_name: string | null
  kpi_amount: number
  effective_from: string
  effective_to: string | null
}

export interface KpiThresholdRow {
  id: string
  tier_label: string | null
  min_qty: number
  bonus_pct: number
  effective_from: string
}

export interface OpenBillRuleRow {
  id: string
  bill_rank: number
  pct: number
}

export interface BrandRow {
  id: string
  code: string
  name: string
  item_code_prefixes: string[]
  note: string | null
  is_active: boolean
}

export interface MarginBandRow {
  id: string
  brand_id: string
  band_key: string
  label: string
  kind: 'incentive' | 'reference' | 'penalty'
  margin_pct: number
  commission_multiplier: number
  monthly_incentive: number
  sort_order: number
}

export interface PromotionRuleRow {
  id: string
  from_rank_key: string
  to_rank_key: string
  alternative_group: number
  criterion: 'personal_sales' | 'group_sales' | 'kpi_items_per_pax' | 'margin_band'
  threshold_amount: number | null
  threshold_qty: number | null
  margin_band_key: string | null
  consecutive_months: number | null
  is_enforced: boolean
  note: string | null
}

/** A salesperson's live position, joined for the people table. */
export interface SalespersonRow {
  staff_id: string
  employee_name: string
  employee_code: string | null
  hierarchy_id: string | null
  scheme_id: string | null
  sub_department_name: string | null
  upline_staff_id: string | null
  rank_id: string | null
  rank_key: string | null
  rank_label: string | null
  rate_mode: 'fixed' | 'variable' | null
  tax_mode: 'pcb' | 'withholding' | 'none'
  withholding_rate: number
}

export interface ProductRow {
  id: string
  item_code: string
  product_name: string | null
  brand_code: string | null
  item_group: string | null
  unit_cost: number | null
  is_active: boolean
  updated_at: string | null
}

export interface CommissionSettingsData {
  subDepartments: SubDeptRow[]
  schemes: SchemeRow[]
  ranks: RankRow[]
  itemGroups: ItemGroupRow[]
  kpiItems: KpiItemRow[]
  kpiThresholds: KpiThresholdRow[]
  openBillRules: OpenBillRuleRow[]
  brands: BrandRow[]
  marginBands: MarginBandRow[]
  promotionRules: PromotionRuleRow[]
  salespeople: SalespersonRow[]
  /** Revenue-side departments a new sub-department can hang off. */
  commissionDepartments: Array<{ id: string; name: string }>
}
