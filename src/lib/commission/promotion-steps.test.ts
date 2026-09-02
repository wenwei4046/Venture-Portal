import { describe, expect, it } from 'vitest'
import {
  buildPromotionSteps,
  isLadderGate,
  stepLogic,
  type LadderRank,
  type PromotionRule,
} from './promotion-steps'

/**
 * The Fair ladder and the promotion rows as seeded on 2026-08-31, with the
 * DECIMALs as PostgREST actually returns them (strings). Every case below is
 * a way the grouping could quietly put a rule under the wrong step or route.
 */

const LADDER: LadderRank[] = [
  { rank_key: 'rs_5', label: 'Revenue Specialist - 5%', sort_order: 10, group_sales_threshold: null },
  { rank_key: 'rs_6', label: 'Revenue Specialist - 6%', sort_order: 20, group_sales_threshold: null },
  { rank_key: 'ta_7', label: 'Team Assistant - 7%', sort_order: 30, group_sales_threshold: '300000.00' },
  { rank_key: 'ta_8', label: 'Team Assistant - 8%', sort_order: 40, group_sales_threshold: null },
  { rank_key: 'tl_9', label: 'Team Leader - 9%', sort_order: 50, group_sales_threshold: null },
  { rank_key: 'stl_10', label: 'Senior Team Leader - 10%', sort_order: 60, group_sales_threshold: null },
]

function rule(
  id: string,
  from: string,
  to: string,
  group: number,
  criterion: PromotionRule['criterion'],
  extra: Partial<PromotionRule> = {},
): PromotionRule {
  return {
    id,
    from_rank_key: from,
    to_rank_key: to,
    alternative_group: group,
    criterion,
    threshold_amount: null,
    threshold_qty: null,
    margin_band_key: null,
    consecutive_months: null,
    is_enforced: false,
    note: null,
    ...extra,
  }
}

const RULES: PromotionRule[] = [
  rule('r1', 'rs_5', 'rs_6', 1, 'personal_sales', { threshold_amount: '100000.00', consecutive_months: 2 }),
  rule('r2', 'rs_6', 'ta_7', 1, 'group_sales', { threshold_amount: '300000.00' }),
  // Deliberately listed KPI-before-sales, and route 3 before route 2, to prove
  // the order on screen comes from the module and not from the database.
  rule('r3', 'ta_7', 'ta_8', 1, 'kpi_items_per_pax', { threshold_qty: 10 }),
  rule('r4', 'ta_7', 'ta_8', 1, 'group_sales', { threshold_amount: '500000.00' }),
  rule('r5', 'ta_7', 'ta_8', 3, 'group_sales', { threshold_amount: '700000.00' }),
  rule('r6', 'ta_7', 'ta_8', 2, 'group_sales', { threshold_amount: '500000.00' }),
  rule('r7', 'ta_7', 'ta_8', 2, 'margin_band', { margin_band_key: 'incentive_tier_1' }),
  rule('r8', 'ta_8', 'tl_9', 1, 'group_sales', { threshold_amount: '700000.00' }),
  rule('r9', 'ta_8', 'tl_9', 1, 'margin_band', { margin_band_key: 'incentive_tier_1' }),
  rule('r10', 'ta_8', 'tl_9', 1, 'kpi_items_per_pax', { threshold_qty: 10 }),
]

describe('buildPromotionSteps', () => {
  it('makes one step per pair of adjacent rungs, in ladder order, including the empty one', () => {
    const steps = buildPromotionSteps(LADDER, RULES)
    expect(steps.map(s => `${s.fromKey}→${s.toKey}`)).toEqual([
      'rs_5→rs_6',
      'rs_6→ta_7',
      'ta_7→ta_8',
      'ta_8→tl_9',
      'tl_9→stl_10',
    ])
    expect(steps.every(s => s.onLadder)).toBe(true)
    expect(steps[4].routes).toEqual([])
    expect(steps[0].fromLabel).toBe('Revenue Specialist - 5%')
    expect(steps[0].toLabel).toBe('Revenue Specialist - 6%')
  })

  it('does not care which order the ranks arrive in', () => {
    const shuffled = [LADDER[3], LADDER[0], LADDER[5], LADDER[2], LADDER[4], LADDER[1]]
    expect(buildPromotionSteps(shuffled, RULES).map(s => s.fromKey)).toEqual([
      'rs_5', 'rs_6', 'ta_7', 'ta_8', 'tl_9',
    ])
  })

  it('splits a step into lettered routes by alternative_group, ascending', () => {
    const step = buildPromotionSteps(LADDER, RULES)[2]
    expect(step.routes.map(r => [r.letter, r.group])).toEqual([['A', 1], ['B', 2], ['C', 3]])
    expect(step.routes.map(r => r.rules.map(x => x.id))).toEqual([
      ['r4', 'r3'],
      ['r6', 'r7'],
      ['r5'],
    ])
  })

  it('puts the same criterion in the same place in every route', () => {
    const step = buildPromotionSteps(LADDER, RULES)[3]
    expect(step.routes[0].rules.map(x => x.criterion)).toEqual([
      'group_sales',
      'kpi_items_per_pax',
      'margin_band',
    ])
  })

  it('keeps a rule whose pair is not two adjacent rungs, after the ladder, under its own keys', () => {
    const stray = [
      rule('s1', 'rs_5', 'ta_7', 1, 'group_sales', { threshold_amount: '250000.00' }),
      rule('s2', 'ta_8', 'gone', 1, 'personal_sales', { threshold_amount: '1.00' }),
    ]
    const steps = buildPromotionSteps(LADDER, [...RULES, ...stray])
    expect(steps).toHaveLength(7)
    const [skip, missing] = steps.slice(5)
    expect(skip).toMatchObject({ fromKey: 'rs_5', toKey: 'ta_7', onLadder: false, fromLabel: 'Revenue Specialist - 5%', toLabel: 'Team Assistant - 7%' })
    expect(skip.ladderGate).toBe(300000)
    expect(missing).toMatchObject({ fromKey: 'ta_8', toKey: 'gone', onLadder: false, toLabel: 'gone', ladderGate: null })
    // The ladder's own five steps are untouched by the strays.
    expect(steps[2].routes.flatMap(r => r.rules).map(x => x.id)).not.toContain('s1')
  })

  it('reads the destination rank target off the ladder as a number', () => {
    const steps = buildPromotionSteps(LADDER, RULES)
    expect(steps[1].ladderGate).toBe(300000)
    expect(steps[0].ladderGate).toBeNull()
  })
})

describe('isLadderGate', () => {
  it('marks the group-sales line that equals the ladder target, and nothing else', () => {
    const steps = buildPromotionSteps(LADDER, RULES)
    const gate = steps[1].routes[0].rules[0]
    expect(isLadderGate(steps[1], gate)).toBe(true)

    // Same 300k figure on a different step whose destination has no target.
    const elsewhere = { ...gate, from_rank_key: 'ta_8', to_rank_key: 'tl_9' }
    expect(isLadderGate(steps[3], elsewhere)).toBe(false)

    // A personal-sales line at the same amount is not the group-sales gate.
    const personal = { ...gate, criterion: 'personal_sales' as const }
    expect(isLadderGate(steps[1], personal)).toBe(false)

    // Route lines whose amount differs from the target.
    for (const r of steps[2].routes.flatMap(x => x.rules)) {
      expect(isLadderGate(steps[2], r)).toBe(false)
    }
  })

  it('marks the personal-sales streak that matches the destination rung, amount AND months', () => {
    // The 5% → 6% step went live on 2026-09-03: 100k × 2 months on rs_6.
    const ladder = LADDER.map(r =>
      r.rank_key === 'rs_6' ? { ...r, personal_sales_threshold: '100000.00', consecutive_months: 2 } : r,
    )
    const steps = buildPromotionSteps(ladder, RULES)
    expect(steps[0].streakGate).toEqual({ amount: 100000, months: 2 })
    const line = steps[0].routes[0].rules[0]
    expect(line.criterion).toBe('personal_sales')
    expect(isLadderGate(steps[0], line)).toBe(true)

    // Same amount over a different streak length is a different rule.
    expect(isLadderGate(steps[0], { ...line, consecutive_months: 3 })).toBe(false)
    // A group-sales line at the streak's amount is not the streak.
    expect(isLadderGate(steps[0], { ...line, criterion: 'group_sales' })).toBe(false)
    // Without the ladder columns nothing on that step is live.
    expect(isLadderGate(buildPromotionSteps(LADDER, RULES)[0], line)).toBe(false)
  })
})

describe('stepLogic', () => {
  it('says how the lines combine', () => {
    const steps = buildPromotionSteps(LADDER, RULES)
    expect(steps.map(stepLogic)).toEqual([
      'one test',
      'one test',
      'any one of 3 routes',
      'all 3 must hold',
      'nothing recorded',
    ])
  })
})
