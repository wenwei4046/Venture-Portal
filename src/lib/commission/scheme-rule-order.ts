/**
 * The order of the rows on Scheme rules.
 *
 * Three groups, top down (user 2026-09-11, on IR's page: "默认是 IR 专属的排在
 * 最上面 … 接下来排我现在打勾的那些 … 剩下的 balance，你就放那些没有打勾的"):
 *
 *   1. the IR programme's parameters — Group sales layers, Override layers,
 *      Direct-line limit — always first, on every sub-department's page;
 *   2. the switches that are ON, as saved;
 *   3. the switches that are OFF;
 *
 * and Default rate mode, neither a switch nor IR's, closes the table. Inside
 * a group the rows keep the catalogue's order, so a switch only moves when
 * its SAVED state changes: the page re-reads the scheme after every save, so
 * a row crosses the line the moment Save lands, never while a box is being
 * ticked.
 */

export type SchemeRuleKey =
  | 'group_sales_depth'
  | 'override_depth'
  | 'direct_line_limit'
  | 'product_revenue'
  | 'kpi'
  | 'open_bill'
  | 'override'
  | 'margin_penalty'
  | 'group_incentive'
  | 'margin_incentive'
  | 'deposit_gate'
  | 'default_rate_mode'

/** What the order reads from `comm_schemes`. */
export interface SchemeRuleState {
  enable_product_revenue: boolean
  enable_kpi: boolean
  enable_open_bill: boolean
  enable_override: boolean
  enable_margin_penalty: boolean
  enable_group_incentive?: boolean
  enable_margin_incentive: boolean
  /** null = no deposit gate; that is the switch. */
  deposit_threshold_pct: number | string | null
}

/** Group 1: the IR programme's parameters, in the order the annexure names them. */
export const IR_PARAMETERS: readonly SchemeRuleKey[] = ['group_sales_depth', 'override_depth', 'direct_line_limit']

/** The switches in catalogue order, each with how it reads its saved state. */
const SWITCHES: ReadonlyArray<{ key: SchemeRuleKey; on: (s: SchemeRuleState) => boolean }> = [
  { key: 'product_revenue', on: s => s.enable_product_revenue },
  { key: 'kpi', on: s => s.enable_kpi },
  { key: 'open_bill', on: s => s.enable_open_bill },
  { key: 'override', on: s => s.enable_override },
  { key: 'margin_penalty', on: s => s.enable_margin_penalty },
  { key: 'group_incentive', on: s => s.enable_group_incentive ?? false },
  { key: 'margin_incentive', on: s => s.enable_margin_incentive },
  { key: 'deposit_gate', on: s => s.deposit_threshold_pct !== null },
]

/** Every row of Scheme rules, in the order this scheme shows them. */
export function orderSchemeRules(scheme: SchemeRuleState): SchemeRuleKey[] {
  return [
    ...IR_PARAMETERS,
    ...SWITCHES.filter(w => w.on(scheme)).map(w => w.key),
    ...SWITCHES.filter(w => !w.on(scheme)).map(w => w.key),
    'default_rate_mode',
  ]
}
