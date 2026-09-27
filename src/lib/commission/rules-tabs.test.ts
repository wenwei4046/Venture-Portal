import { describe, expect, it } from 'vitest'
import { RULES_TABS, resolveRulesTab, visibleRulesTabs, type RulesRecorded, type RulesSwitches } from './rules-tabs'

const off: RulesSwitches = {
  enable_kpi: false,
  enable_open_bill: false,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
}
const on: RulesSwitches = {
  enable_kpi: true,
  enable_open_bill: true,
  enable_margin_penalty: true,
  enable_margin_incentive: true,
}
const nothing: RulesRecorded = { itemGroups: 0, promotionRules: 0 }
const keys = (scheme: RulesSwitches, recorded = nothing) => visibleRulesTabs(scheme, recorded).map(t => t.key)

describe('visibleRulesTabs', () => {
  it('IR — a percentage ladder and group packages, nothing per item: three tabs', () => {
    // IR's live scheme on 2026-09-11: product revenue, override and the group
    // package on, every per-item switch off, no rows on any per-item table.
    expect(keys(off)).toEqual(['scheme', 'ladder', 'ranks'])
  })

  it('Fair — every switch on, its policy recorded, two directors: all ten, in section order', () => {
    expect(keys(on, { itemGroups: 7, promotionRules: 10, directors: 2 })).toEqual(RULES_TABS.map(t => t.key))
  })

  it('KPI item allowance brings the three item tables', () => {
    expect(keys({ ...off, enable_kpi: true })).toEqual(['scheme', 'ladder', 'groups', 'kpi', 'thresholds', 'ranks'])
  })

  it('Open Bill bonus brings Open Bill rates', () => {
    expect(keys({ ...off, enable_open_bill: true })).toEqual(['scheme', 'ladder', 'open-bill', 'ranks'])
  })

  it('either margin switch brings Brands & margin bands — one brand ladder holds both kinds of rung', () => {
    expect(keys({ ...off, enable_margin_penalty: true })).toContain('brands')
    expect(keys({ ...off, enable_margin_incentive: true })).toContain('brands')
    expect(keys(off)).not.toContain('brands')
  })

  it('a classification the engine is applying is never hidden: item groups stay with KPI off', () => {
    expect(keys(off, { itemGroups: 7, promotionRules: 0 })).toEqual(['scheme', 'ladder', 'groups', 'ranks'])
  })

  // 2026-09-27: KRIS and PETER direct Fair, PETER IR — each pays its own.
  it('Directors has no switch: it shows while the sub-department has a director, last', () => {
    expect(keys(off, { ...nothing, directors: 1 })).toEqual(['scheme', 'ladder', 'ranks', 'directors'])
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
})
