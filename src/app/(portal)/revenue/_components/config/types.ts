/**
 * Row shapes for the Revenue Department's Rules page.
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
  /** The title (Team → Role & Permission) this rung belongs to. */
  title_id: string
  rank_key: string
  /**
   * "Rank B" — the letter counted from the top of the ladder, maintained by
   * `upsertRank` after every write (`lib/commission/ranks.ts`). Pages letter
   * the rows they hold themselves rather than trusting this; it exists so the
   * engine's warnings and SQL say the same thing the pages do.
   */
  label: string
  product_rate: number
  can_recruit: boolean
  /** MONTHLY gate: group sales this month. Paid this rung, back down next month. */
  group_sales_threshold: number | null
  /** EARNED gate: own sales in `consecutive_months` months running. Raises the title for good. */
  personal_sales_threshold: number | null
  consecutive_months: number | null
  sort_order: number
}

/** A title the ladder may hang a rung on — the Revenue side's rows of `titles`. */
export interface TitleRow {
  id: string
  name: string
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

/**
 * A salesperson's live position, joined for the Team table and the org chart
 * (Staff Hierarchy, both tabs — the two read one load so they never disagree).
 */
export interface SalespersonRow {
  staff_id: string
  employee_name: string
  employee_code: string | null
  /** The title they HOLD — the ratchet; may sit above the rank they are paid. */
  title_id: string | null
  title_name: string | null
  hierarchy_id: string | null
  upline_staff_id: string | null
  rank_id: string | null
  rank_key: string | null
  rank_label: string | null
  rate_mode: 'fixed' | 'variable' | null
  /** `effective_from` of the open position — when they were last placed or moved. */
  placed_since: string | null
  tax_mode: 'pcb' | 'withholding' | 'none'
  withholding_rate: number
}

/** Staff Hierarchy's load: the ladder to pick from, and everyone on it or not yet placed. */
export interface TeamData {
  ranks: RankRow[]
  people: SalespersonRow[]
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

/**
 * One sub-department's rules — everything below `scheme` is filtered to it —
 * plus the three unscoped lists the "generate a new sub-department" form needs.
 * The people are not here: they moved to Staff Hierarchy's Team tab on
 * 2026-09-05 and load through `loadTeam`.
 */
export interface CommissionSettingsData {
  /** Null while a sub-department exists but has no active scheme. */
  scheme: SchemeRow | null
  ranks: RankRow[]
  /** Titles a rung may belong to: every active title of a commission department. */
  titles: TitleRow[]
  itemGroups: ItemGroupRow[]
  kpiItems: KpiItemRow[]
  kpiThresholds: KpiThresholdRow[]
  openBillRules: OpenBillRuleRow[]
  brands: BrandRow[]
  marginBands: MarginBandRow[]
  promotionRules: PromotionRuleRow[]
  /** Every sub-department — the clone picker names its source by them. */
  subDepartments: SubDeptRow[]
  /** Every live scheme, so a new sub-department can follow any of them. */
  allSchemes: Array<{ id: string; sub_department_id: string; scheme_name: string }>
  /** Revenue-side departments a new sub-department can hang off. */
  commissionDepartments: Array<{ id: string; name: string }>
}
