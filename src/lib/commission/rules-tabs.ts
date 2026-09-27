/**
 * Which of the Rules page's tabs one sub-department shows.
 *
 * Three are always there — Scheme rules, the Title ladder and the Ranks
 * catalogue: what the sub-department pays, and to whom. Every other tab is a
 * table that ONE switch on Scheme rules reads, and it appears only while that
 * switch is on (user 2026-09-11, on IR's Rules page: "上面的 tab 是 depend on
 * 我 turn on 它才会跳出来。如果我没有 turn on 的话，它不会跳出 related 的内容"):
 *
 *   KPI item allowance                 → Item groups, KPI items, KPI threshold ladder
 *   Open Bill bonus                    → Open Bill rates
 *   Below-margin penalty or            → Brands & margin bands — a brand's ladder
 *   Monthly margin incentive             holds the penalty rungs AND the incentive
 *                                        rungs, so either switch needs the tab
 *   (no switch — recorded policy)      → Promotion criteria, while anything is recorded
 *   (no switch — who it reports to)    → Directors, while the sub-department has
 *                                        a director to pay (2026-09-27)
 *
 * So IR — a percentage ladder plus group packages, nothing per item — shows
 * three tabs and its director's, and Fair shows all ten.
 *
 * One exception, on purpose. Item groups is read by Product revenue
 * commission, not by the KPI switch it is listed under: the engine treats a
 * line whose group is not classified as NOT commissionable (`classifyLine`,
 * engine.ts). So a scheme that HAS classified groups keeps the tab whatever
 * its switches say — a rule the run is applying is never out of sight. IR has
 * classified nothing, so it sees nothing.
 *
 * Pure, so the page stays a thin caller and this is tested.
 */

export type RulesTab =
  | 'scheme'
  | 'ladder'
  | 'groups'
  | 'kpi'
  | 'thresholds'
  | 'open-bill'
  | 'brands'
  | 'promotion'
  | 'ranks'
  | 'directors'

export interface RulesTabItem {
  key: RulesTab
  label: string
}

/** Every tab, in section order — Ranks is section IX, Directors X. */
export const RULES_TABS: readonly RulesTabItem[] = [
  { key: 'scheme', label: 'Scheme rules' },
  { key: 'ladder', label: 'Title ladder' },
  { key: 'groups', label: 'Item groups' },
  { key: 'kpi', label: 'KPI items' },
  { key: 'thresholds', label: 'KPI threshold ladder' },
  { key: 'open-bill', label: 'Open Bill rates' },
  { key: 'brands', label: 'Brands & margin bands' },
  { key: 'promotion', label: 'Promotion criteria' },
  { key: 'ranks', label: 'Ranks' },
  { key: 'directors', label: 'Directors' },
]

/** The switches of `comm_schemes` that decide a tab. */
export interface RulesSwitches {
  enable_kpi: boolean
  enable_open_bill: boolean
  enable_margin_penalty: boolean
  enable_margin_incentive: boolean
}

/** How many rows the scheme has on the tabs that are decided by their contents. */
export interface RulesRecorded {
  itemGroups: number
  promotionRules: number
  /** Directors the sub-department reports to (Staff Hierarchy › Team › Reports to). */
  directors?: number
}

export function isRulesTab(s: string | null | undefined): s is RulesTab {
  return !!s && RULES_TABS.some(t => t.key === s)
}

function tabIsShown(key: RulesTab, scheme: RulesSwitches, recorded: RulesRecorded): boolean {
  switch (key) {
    case 'scheme':
    case 'ladder':
    case 'ranks':
      return true
    case 'groups':
      return scheme.enable_kpi || recorded.itemGroups > 0
    case 'kpi':
    case 'thresholds':
      return scheme.enable_kpi
    case 'open-bill':
      return scheme.enable_open_bill
    case 'brands':
      return scheme.enable_margin_penalty || scheme.enable_margin_incentive
    case 'promotion':
      return recorded.promotionRules > 0
    case 'directors':
      return (recorded.directors ?? 0) > 0
  }
}

/** The tabs this scheme shows, in section order. */
export function visibleRulesTabs(scheme: RulesSwitches, recorded: RulesRecorded): RulesTabItem[] {
  return RULES_TABS.filter(t => tabIsShown(t.key, scheme, recorded))
}

/**
 * The tab `?tab=` opens. A key that is not a tab, or that names one this
 * scheme does not show (a bookmark of Fair's KPI items opened on IR), lands on
 * Scheme rules — where the switch that would show it lives.
 */
export function resolveRulesTab(raw: string | null | undefined, visible: readonly RulesTabItem[]): RulesTab {
  return isRulesTab(raw) && visible.some(t => t.key === raw) ? raw : 'scheme'
}
