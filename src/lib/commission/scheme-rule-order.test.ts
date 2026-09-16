import { describe, expect, it } from 'vitest'
import { IR_PARAMETERS, orderSchemeRules, type SchemeRuleState } from './scheme-rule-order'

/** IR's live scheme on 2026-09-11. */
const ir: SchemeRuleState = {
  enable_product_revenue: true,
  enable_kpi: false,
  enable_open_bill: false,
  enable_override: true,
  enable_margin_penalty: false,
  enable_group_incentive: true,
  enable_margin_incentive: false,
  deposit_threshold_pct: null,
}

/** Fair's, as `select('*')` returns it — the deposit share comes back as a string. */
const fair: SchemeRuleState = {
  enable_product_revenue: true,
  enable_kpi: true,
  enable_open_bill: true,
  enable_override: true,
  enable_margin_penalty: true,
  enable_group_incentive: false,
  enable_margin_incentive: true,
  deposit_threshold_pct: '0.500000',
}

describe('orderSchemeRules', () => {
  it('IR: its three parameters, then what is ticked, then what is not, Default rate mode last', () => {
    expect(orderSchemeRules(ir)).toEqual([
      'group_sales_depth',
      'override_depth',
      'direct_line_limit',
      'product_revenue',
      'override',
      'group_incentive',
      'kpi',
      'open_bill',
      'margin_penalty',
      'margin_incentive',
      'deposit_gate',
      'cost_divisor',
      'default_rate_mode',
    ])
  })

  it('Fair: the IR parameters still lead, every switch but the group package is on', () => {
    expect(orderSchemeRules(fair)).toEqual([
      ...IR_PARAMETERS,
      'product_revenue',
      'kpi',
      'open_bill',
      'override',
      'margin_penalty',
      'margin_incentive',
      'deposit_gate',
      'group_incentive',
      'cost_divisor',
      'default_rate_mode',
    ])
  })

  it('a blank scheme keeps the catalogue order below the IR parameters', () => {
    const blank: SchemeRuleState = { ...ir, enable_product_revenue: false, enable_override: false, enable_group_incentive: false }
    expect(orderSchemeRules(blank)).toEqual([
      ...IR_PARAMETERS,
      'product_revenue',
      'kpi',
      'open_bill',
      'override',
      'margin_penalty',
      'group_incentive',
      'margin_incentive',
      'deposit_gate',
      'cost_divisor',
      'default_rate_mode',
    ])
  })

  it('a scheme inserted by an old script, with no group-package column, reads as off', () => {
    const legacy: SchemeRuleState = { ...ir }
    delete legacy.enable_group_incentive
    const order = orderSchemeRules(legacy)
    expect(order.indexOf('group_incentive')).toBeGreaterThan(order.indexOf('override'))
  })

  it('every row appears exactly once', () => {
    const rows = orderSchemeRules(ir)
    expect(new Set(rows).size).toBe(rows.length)
    expect(rows).toHaveLength(13)
    // The cost basis is neither a switch nor IR's: it sits with Default rate mode at the foot.
    expect(rows.slice(-2)).toEqual(['cost_divisor', 'default_rate_mode'])
  })
})
