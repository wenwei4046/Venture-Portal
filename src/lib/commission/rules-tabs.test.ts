import { describe, expect, it } from 'vitest'
import { RULES_TABS, groupedRulesTabs, resolveRulesTab, visibleRulesTabs, type RulesRecorded, type RulesSwitches } from './rules-tabs'

const off: RulesSwitches = {
  enable_kpi: false,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
}
const on: RulesSwitches = {
  enable_kpi: true,
  enable_margin_penalty: true,
  enable_margin_incentive: true,
}
const nothing: RulesRecorded = { itemGroups: 0, promotionRules: 0 }
const keys = (scheme: RulesSwitches, recorded = nothing) => visibleRulesTabs(scheme, recorded).map(t => t.key)

describe('visibleRulesTabs', () => {
  it('IR — a percentage ladder and group packages, nothing per item: three tabs and Capacity', () => {
    // IR's live scheme on 2026-09-11: product revenue, override and the group
    // package on, every per-item switch off, no rows on any per-item table.
    expect(keys(off)).toEqual(['scheme', 'ladder', 'ranks', 'capacity'])
  })

  it('Fair — every switch on, its policy recorded, two directors: all nine, in the side list’s order', () => {
    expect(keys(on, { itemGroups: 7, promotionRules: 10, directors: 2, kpiItems: 1, kpiThresholds: 1 }))
      .toEqual(RULES_TABS.map(t => t.key))
    expect(RULES_TABS.map(t => t.key)).toEqual(
      ['scheme', 'ladder', 'ranks', 'directors', 'groups', 'kpi', 'brands', 'capacity', 'promotion'],
    )
  })

  it('KPI item allowance brings the item groups and KPI items — the ladder is on the KPI items tab', () => {
    expect(keys({ ...off, enable_kpi: true })).toEqual(['scheme', 'ladder', 'ranks', 'groups', 'kpi', 'capacity'])
  })

  // 2026-10-08: the items moved here from the Product List, where they were
  // listed whatever the switch said. Fair on that day: KPI off, HB Straight at
  // RM 250 and Tier 1 (10 units → +20%) recorded.
  it('KPI items stays, switch off, while an item or a rung is recorded', () => {
    expect(keys(off, { ...nothing, kpiItems: 1 })).toEqual(['scheme', 'ladder', 'ranks', 'kpi', 'capacity'])
    expect(keys(off, { ...nothing, kpiThresholds: 1 })).toEqual(['scheme', 'ladder', 'ranks', 'kpi', 'capacity'])
    expect(keys(off, { itemGroups: 7, promotionRules: 10, directors: 2, kpiItems: 1, kpiThresholds: 1 }))
      .toEqual(['scheme', 'ladder', 'ranks', 'directors', 'groups', 'kpi', 'capacity', 'promotion'])
    expect(keys(off)).not.toContain('kpi')
  })

  // Open Bill went (2026-10-31), its rates tab with it: a link to it opens Scheme rules.
  it('has no Open Bill rates tab any more', () => {
    expect(RULES_TABS.map(t => t.key)).not.toContain('open-bill')
    expect(resolveRulesTab('open-bill', visibleRulesTabs(on, nothing))).toBe('scheme')
  })

  it('either margin switch brings Brands & margin bands — one brand ladder holds both kinds of rung', () => {
    expect(keys({ ...off, enable_margin_penalty: true })).toContain('brands')
    expect(keys({ ...off, enable_margin_incentive: true })).toContain('brands')
    expect(keys(off)).not.toContain('brands')
  })

  it('a classification the engine is applying is never hidden: item groups stay with KPI off', () => {
    expect(keys(off, { itemGroups: 7, promotionRules: 0 })).toEqual(['scheme', 'ladder', 'ranks', 'groups', 'capacity'])
  })

  // 2026-09-27: KRIS and PETER direct Fair, PETER IR — each pays its own.
  it('Directors has no switch: it shows while the sub-department has a director, after Ranks', () => {
    expect(keys(off, { ...nothing, directors: 1 })).toEqual(['scheme', 'ladder', 'ranks', 'directors', 'capacity'])
    expect(keys(off)).not.toContain('directors')
  })

  it('Promotion criteria has no switch: it shows while something is recorded', () => {
    expect(keys(off, { itemGroups: 0, promotionRules: 10 })).toContain('promotion')
    expect(keys(on)).not.toContain('promotion')
  })
})

describe('resolveRulesTab', () => {
  const ir = visibleRulesTabs(off, nothing)

  it('opens a tab the scheme shows', () => {
    expect(resolveRulesTab('ranks', ir)).toBe('ranks')
  })

  it('lands on Scheme rules for a tab the scheme does not show — that is where its switch is', () => {
    expect(resolveRulesTab('kpi', ir)).toBe('scheme')
  })

  it('and for no tab at all, or one that never existed', () => {
    expect(resolveRulesTab(null, ir)).toBe('scheme')
    expect(resolveRulesTab('people', ir)).toBe('scheme')
  })

  it('a bookmark of the old threshold ladder tab opens KPI items, where the ladder is now', () => {
    const fair = visibleRulesTabs(off, { ...nothing, kpiItems: 1, kpiThresholds: 1 })
    expect(resolveRulesTab('thresholds', fair)).toBe('kpi')
    expect(resolveRulesTab('kpi', fair)).toBe('kpi')
    expect(resolveRulesTab('thresholds', ir)).toBe('scheme')
  })
})

describe('groupedRulesTabs (2026-10-10, the HR revamp’s side list)', () => {
  it('puts each tab under its group, in the prototype’s order, and drops an empty group', () => {
    const fair = groupedRulesTabs(visibleRulesTabs(on, { itemGroups: 7, promotionRules: 10, directors: 2, kpiItems: 1, kpiThresholds: 1 }))
    expect(fair.map(g => [g.label, g.items.map(i => i.label)])).toEqual([
      ['Pay structure', ['Scheme rules', 'Title ladder', 'Ranks', 'Directors']],
      ['Item rules', ['Item groups', 'KPI items', 'Brands & margin bands']],
      ['Headcount', ['Capacity']],
      ['Policy', ['Promotion criteria']],
    ])
    const ir = groupedRulesTabs(visibleRulesTabs(off, nothing))
    expect(ir.map(g => g.label)).toEqual(['Pay structure', 'Headcount'])
  })
})
