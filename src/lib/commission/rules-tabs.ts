/**
 * Which of the Rules page's tabs one sub-department shows.
 *
 * Three are always there — Scheme rules, the Title ladder and the Ranks
 * catalogue: what the sub-department pays, and to whom. Every other tab is a
 * table that ONE switch on Scheme rules reads, and it appears only while that
 * switch is on (user 2026-09-11, on IR's Rules page: "上面的 tab 是 depend on
 * 我 turn on 它才会跳出来。如果我没有 turn on 的话，它不会跳出 related 的内容"):
 *
 *   KPI item allowance                 → Item groups, KPI items (the items AND
 *                                        the threshold ladder, one tab)
 *   Open Bill bonus                    → Open Bill rates
 *   Below-margin penalty or            → Brands & margin bands — a brand's ladder
 *   Monthly margin incentive             holds the penalty rungs AND the incentive
 *                                        rungs, so either switch needs the tab
 *   (no switch — recorded policy)      → Promotion criteria, while anything is recorded
 *   (no switch — who it reports to)    → Directors, while the sub-department has
 *                                        a director to pay (2026-09-27)
 *
 * So IR — a percentage ladder plus group packages, nothing per item — shows
 * three tabs and its director's, and Fair shows all nine.
 *
 * Two exceptions, on purpose. Item groups is read by Product revenue
 * commission, not by the KPI switch it is listed under: the engine treats a
 * line whose group is not classified as NOT commissionable (`classifyLine`,
 * engine.ts). So a scheme that HAS classified groups keeps the tab whatever
 * its switches say — a rule the run is applying is never out of sight. IR has
 * classified nothing, so it sees nothing.
 *
 * And KPI items keeps its tab while anything is recorded on it — an item or a
 * rung of the ladder — with the switch off (2026-10-08). The items moved here
 * from Product List › Add-on / KPI Items (user: "rules 这里是用来算薪水的 …
 * product list 是拿来 set costing 的"), and the Product List showed them with
 * the switch off; this is now the only place they are set, so a list waiting
 * for the switch has to stay reachable. Nothing recorded and the switch off
 * (IR) — no tab, as before.
 *
 * Pure, so the page stays a thin caller and this is tested.
 */

export type RulesTab =
  | 'scheme'
  | 'ladder'
  | 'groups'
  | 'open-bill'
  | 'brands'
  | 'promotion'
  | 'ranks'
  | 'directors'
  | 'kpi'

export interface RulesTabItem {
  key: RulesTab
  label: string
}

/**
 * Every tab, in section order — Ranks is section IX, Directors X, and KPI
 * items XI: it was IV (the items, read-only) and V (the threshold ladder)
 * until 2026-10-08, when the two became one tab and the user put it at the end
 * of the rail, so it took the next numeral, as Directors did.
 */
export const RULES_TABS: readonly RulesTabItem[] = [
  { key: 'scheme', label: 'Scheme rules' },
  { key: 'ladder', label: 'Title ladder' },
  { key: 'groups', label: 'Item groups' },
  { key: 'open-bill', label: 'Open Bill rates' },
  { key: 'brands', label: 'Brands & margin bands' },
  { key: 'promotion', label: 'Promotion criteria' },
  { key: 'ranks', label: 'Ranks' },
  { key: 'directors', label: 'Directors' },
  { key: 'kpi', label: 'KPI items' },
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
  /** KPI items in force today or later. */
  kpiItems?: number
  /** Rungs of the KPI threshold ladder. */
  kpiThresholds?: number
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
      return scheme.enable_kpi || (recorded.kpiItems ?? 0) > 0 || (recorded.kpiThresholds ?? 0) > 0
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
 * Scheme rules — where the switch that would show it lives. The threshold
 * ladder's own tab (`thresholds`, until 2026-10-08) opens KPI items, where the
 * ladder is now.
 */
export function resolveRulesTab(raw: string | null | undefined, visible: readonly RulesTabItem[]): RulesTab {
  const key = raw === 'thresholds' ? 'kpi' : raw
  return isRulesTab(key) && visible.some(t => t.key === key) ? key : 'scheme'
}
