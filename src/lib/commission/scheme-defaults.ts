/**
 * What a new sub-department's scheme starts with.
 *
 * "Generate new sub-department" offers two starts. FOLLOW an existing
 * ruleset: the source scheme's switches come across as they are (and its
 * child rows are cloned by the action). START BLANK: blank means blank
 * (user 2026-09-10 — "当我选择 start blank 的时候，它应该是空的，每个 rule 都需要
 * 我重新写进去"): every component is OFF until somebody switches it on and
 * writes its rules. The database's column defaults are all TRUE — they exist
 * so a scheme inserted by an old script still calculates — which is why a
 * blank scheme used to open on a Scheme rules tab with every box ticked, as
 * if Fair's rules had been copied.
 *
 * Pure, so the Server Action stays a thin wrapper and this can be tested.
 */

export const SCHEME_SWITCHES = [
  'enable_product_revenue',
  'enable_kpi',
  'enable_open_bill',
  'enable_override',
  'enable_margin_penalty',
  'enable_margin_incentive',
] as const

export type SchemeSwitch = (typeof SCHEME_SWITCHES)[number]

/** The columns of `comm_schemes` that are settings rather than identity. */
export interface SchemeSettings extends Record<SchemeSwitch, boolean> {
  enable_group_incentive?: boolean
  group_sales_depth?: number | null
  override_depth?: number | null
  direct_line_limit?: number | null
  open_bill_basis: 'uplift_on_commission' | 'pct_of_revenue'
  override_includes_kpi: boolean
  /** 0–1 share of the order total; null = no deposit gate. */
  deposit_threshold_pct: number | string | null
  default_rate_mode: 'fixed' | 'variable'
  /**
   * Revenue Team cost = cost ÷ this (Fair 0.7). A follower keeps its source's
   * — before 2026-09-27 it fell to the column default, 1, and a copy of Fair
   * judged every margin on a cost 30% lower than Fair's.
   */
  revenue_cost_divisor?: number | string | null
}

/**
 * Every switch off, no deposit gate. The two enums keep the schema's defaults:
 * they only mean anything once their switch is on.
 */
export function blankSchemeSettings(): SchemeSettings {
  return {
    enable_product_revenue: false,
    enable_kpi: false,
    enable_open_bill: false,
    enable_override: false,
    enable_margin_penalty: false,
    enable_margin_incentive: false,
    enable_group_incentive: false,
    group_sales_depth: null,
    override_depth: null,
    direct_line_limit: null,
    override_includes_kpi: false,
    deposit_threshold_pct: null,
    open_bill_basis: 'uplift_on_commission',
    default_rate_mode: 'variable',
    revenue_cost_divisor: 1,
  }
}

/** The source scheme's settings, and nothing else of its row (no id, no name, no dates). */
export function copiedSchemeSettings(source: SchemeSettings): SchemeSettings {
  return {
    enable_product_revenue: source.enable_product_revenue,
    enable_kpi: source.enable_kpi,
    enable_open_bill: source.enable_open_bill,
    enable_override: source.enable_override,
    enable_margin_penalty: source.enable_margin_penalty,
    enable_margin_incentive: source.enable_margin_incentive,
    enable_group_incentive: source.enable_group_incentive ?? false,
    group_sales_depth: source.group_sales_depth ?? null,
    override_depth: source.override_depth ?? null,
    direct_line_limit: source.direct_line_limit ?? null,
    override_includes_kpi: source.override_includes_kpi,
    deposit_threshold_pct: source.deposit_threshold_pct,
    open_bill_basis: source.open_bill_basis,
    default_rate_mode: source.default_rate_mode,
    revenue_cost_divisor: source.revenue_cost_divisor ?? 1,
  }
}

/** What the new scheme row is inserted with: a copy of the source's settings, or blank. */
export function newSchemeSettings(source: SchemeSettings | null | undefined): SchemeSettings {
  return source ? copiedSchemeSettings(source) : blankSchemeSettings()
}

/** True when nothing on the scheme pays — the state a blank one starts in. */
export function isBlankScheme(scheme: SchemeSettings): boolean {
  return !scheme.enable_group_incentive && SCHEME_SWITCHES.every(k => !scheme[k])
}
