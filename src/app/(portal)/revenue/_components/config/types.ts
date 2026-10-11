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
  enable_group_incentive?: boolean
  group_sales_depth?: number | null
  override_depth?: number | null
  direct_line_limit?: number | null
  deposit_threshold_pct: number | null
  default_rate_mode: 'fixed' | 'variable'
  // No `revenue_cost_divisor`: the Revenue Team cost basis is Product List ›
  // Costing Setting's alone (2026-10-11) — Rules neither shows nor writes it.
}

/**
 * A rank of the catalogue — one row of the Rank tab (2026-09-05). A rank is
 * its rate or group package; the letter is counted from the top by the app
 * after every write (`resequenceLadder`, lib/commission/ranks.ts). A rung of
 * the ladder points at one of these and copies its rate, label and order.
 */
export interface RankDefRow {
  id: string
  scheme_id: string
  product_rate: number
  group_incentive_amount: number
  group_subsidy_cap: number
  /** "Rank B" — from the top of the catalogue. Rewritten after every write, never typed in. */
  label: string
  /** Pay order, 10/20/30 … from the lowest rate up, then group packages. */
  sort_order: number
}

export interface RankRow {
  id: string
  /** The title (Team → Role & Permission) this rung belongs to. Fixed once the rung exists. */
  title_id: string
  /** The rank this rung pays — a row of `comm_rank_defs`, picked on the ladder. */
  rank_def_id: string
  rank_key: string
  /**
   * "Rank B" — a COPY of the rank's label, kept by the database trigger
   * `comm_ranks_follow_rank_def` (and rewritten whenever the catalogue is
   * re-lettered). Since 2026-09-05 pages may read it as it stands.
   */
  label: string
  /** A COPY of the rank's rate, kept by the same trigger. Set on the Rank tab, never here. */
  product_rate: number
  /** Fixed pay and separate subsidy cap, copied from the rank catalogue. */
  group_incentive_amount: number
  group_subsidy_cap: number
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
  /**
   * Heads its department — the Revenue Director (2026-09-27: offered on the
   * Title ladder, where its rung sets the rate of their own bills). Never
   * offered as a membership title.
   */
  isDepartmentHead?: boolean
}

/** One director of the sub-department and what Rules › Directors pays them. */
export interface DirectorPayRow {
  staffId: string
  name: string
  employeeCode: string | null
  titleName: string | null
  /** Null until something has been saved for them. */
  fixedAmount: number | null
  salesThreshold: number | null
  incentiveAmount: number | null
}

export interface ItemGroupRow {
  id: string
  item_group: string
  commissionable: boolean
  note: string | null
}

export interface KpiItemRow {
  id: string
  /** 'sku' = a code on a line; 'option' = a bed frame's or sofa's special (2026-09-27). */
  source: 'sku' | 'option'
  product_code: string | null
  product_name: string | null
  /** The SKU Master row a SKU item was picked from. */
  erp_product_id: string | null
  option_pool: 'bedframe_specials' | 'sofa_specials' | null
  option_value: string | null
  kpi_amount: number
  effective_from: string
  effective_to: string | null
}

/** A special of the Bedframe or Sofa Maintenance pool — what Rules › KPI items picks from. */
export interface KpiSpecialRow {
  pool: 'bedframe_specials' | 'sofa_specials'
  value: string
  label: string
  sort_order: number
  /** The ERP took it out of the pool: no new bill can print it. */
  removed: boolean
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
 * One person's MEMBERSHIP of a sub-department, joined for the Team table and
 * the org chart (Staff Hierarchy, both tabs — the two read one load so they
 * never disagree).
 *
 * Since 2026-09-10 a sub-department is a world of its own: the title, the
 * upline and the rank here are the ones held IN THIS SUB-DEPARTMENT. On the
 * home sub-department (the department's oldest) they mirror the company
 * roster — the database keeps them in step; everywhere else they are this
 * chart's own facts.
 */
export interface SalespersonRow {
  staff_id: string
  employee_name: string
  employee_code: string | null
  /** The title held HERE — the ratchet; may sit above the rank they are paid. */
  title_id: string | null
  title_name: string | null
  /** Where that title stands on the company ladder (`title_levels`); null = not placed. */
  title_level_rank: number | null
  title_level_name: string | null
  /** The company title, for the row's small print when it differs from the one held here. */
  company_title_name: string | null
  hierarchy_id: string | null
  /**
   * This sub-department is where they are BASED (2026-09-20): the company
   * roster describes this membership, so their title comes from People and
   * their line is `reports_to`. Everybody else on the same chart is here by a
   * membership of their own.
   */
  based_here: boolean
  /** Who they earn under HERE. For somebody based here this mirrors `reports_to`. */
  upline_staff_id: string | null
  /** Who they report to on the company chart — `hr_staff_costs.reports_to`. */
  reports_to: string | null
  rank_id: string | null
  rank_key: string | null
  rank_label: string | null
  rate_mode: 'fixed' | 'variable' | null
  /** `effective_from` of the open position — when they were last placed or moved. */
  placed_since: string | null
  tax_mode: 'pcb' | 'withholding' | 'none'
  withholding_rate: number
  direct_line_count?: number
  direct_line_limit?: number | null
  /** Earned SDL capacity is separate from the held membership/company title. */
  expansion_earned_at?: string | null
  expansion_source_period?: string | null
}

/** Somebody in the department who is not a member of this sub-department yet. */
export interface MemberCandidate {
  staff_id: string
  employee_name: string
  employee_code: string | null
  company_title_name: string | null
}

/**
 * A department head — somebody holding a title with `is_department_head`
 * (2026-09-11). A director of a sub-department, or one who could be.
 */
export interface DirectorRow {
  staff_id: string
  employee_name: string
  employee_code: string | null
  title_name: string | null
}

/** Staff Hierarchy's load: the ladder, the members, and who could still join. */
export interface TeamData {
  /** The sub-department the scheme belongs to — what the directors hang off. */
  subDepartmentId: string
  /** Everyone BASED here: the people whose company roster row describes this membership. */
  homeStaffIds: string[]
  ranks: RankRow[]
  /** The members. A department head is never one: they hold no rank. */
  people: SalespersonRow[]
  /** Titles a membership may hold — the commission departments' rows of `titles`, heads excluded. */
  titles: TitleRow[]
  /** Anybody in the department neither based here nor already a member. */
  candidates: MemberCandidate[]
  /** Who this sub-department reports to, A→Z. A reporting line only: no override reaches them. */
  directors: DirectorRow[]
  /** Heads of the department who do not direct this sub-department yet. */
  directorCandidates: DirectorRow[]
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
  /** The Rank tab: every rank of the scheme, whether or not a title sits on it. */
  rankDefs: RankDefRow[]
  ranks: RankRow[]
  /**
   * Titles a rung may belong to: every active title of a commission
   * department, the Revenue Director included (2026-09-27).
   */
  titles: TitleRow[]
  itemGroups: ItemGroupRow[]
  /** In force today or later — Rules › KPI items sets them (2026-10-08). */
  kpiItems: KpiItemRow[]
  kpiThresholds: KpiThresholdRow[]
  /** The Bedframe and Sofa specials pools, for the KPI items picker. */
  kpiSpecials: KpiSpecialRow[]
  /** SKU items whose SKU the ERP has since removed (their `erp_product_id`). */
  kpiGoneSkus: string[]
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
  /**
   * Who this sub-department reports to, and what each is paid here (Rules ›
   * Directors, 2026-09-27). Empty while it has no director.
   */
  directors: DirectorPayRow[]
}
