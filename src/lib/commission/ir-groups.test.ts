import { describe, expect, it } from 'vitest'
import { computeIrGroups, type IrGroupMember, type IrGroupsInput } from './ir-groups'

const member = (staffId: string, uplineStaffId: string | null): IrGroupMember => ({ staffId, uplineStaffId })

function calculate(overrides: Partial<IrGroupsInput> = {}) {
  return computeIrGroups({
    leaderStaffId: 'leader',
    hierarchy: [member('leader', null), member('one', 'leader'), member('two', 'leader')],
    personalRevenue: new Map([['leader', 200_000], ['one', 800_000], ['two', 800_000]]),
    groupSalesThreshold: 1_000_000,
    incentivePerGroup: 6_000,
    subsidyPerGroup: 2_000,
    ...overrides,
  })
}

function fullSpecHierarchy(): IrGroupMember[] {
  return [
    member('leader', null),
    ...['one', 'two', 'three'].flatMap(direct => [
      member(direct, 'leader'),
      ...['a', 'b', 'c'].map(child => member(`${direct}-${child}`, direct)),
    ]),
  ]
}

describe('IR monthly group packages', () => {
  it('reuses the leader\'s 200k in both 800k groups without changing personal revenue', () => {
    const personalRevenue = new Map([['leader', 200_000], ['one', 800_000], ['two', 800_000]])
    const before = [...personalRevenue]
    const result = calculate({ personalRevenue })

    expect(result.groups.map(group => group.totalRevenue)).toEqual([1_000_000, 1_000_000])
    expect(result.groups.map(group => group.leaderPersonalRevenue)).toEqual([200_000, 200_000])
    expect(result.qualifyingGroupCount).toBe(2)
    expect(result.groupIncentive).toBe(12_000)
    expect(result.subsidyCap).toBe(4_000)
    expect([...personalRevenue]).toEqual(before)
  })

  it('includes direct and second-layer personal sales, but excludes every deeper generation', () => {
    const result = calculate({
      hierarchy: [member('leader', null), member('one', 'leader'), member('child', 'one'), member('deep', 'child')],
      personalRevenue: new Map([['leader', 200_000], ['one', 300_000], ['child', 499_999.99], ['deep', 900_000]]),
    })

    expect(result.groups[0]).toMatchObject({
      leaderPersonalRevenue: 200_000,
      directPersonalRevenue: 300_000,
      secondLayer: [{ staffId: 'child', personalRevenue: 499_999.99 }],
      secondLayerRevenue: 499_999.99,
      totalRevenue: 999_999.99,
      qualifies: false,
    })
    expect(result.groupIncentive).toBe(0)
  })

  it('awards only one package for a group at 1.5M or multiple whole targets', () => {
    const result = calculate({ personalRevenue: new Map([['leader', 200_000], ['one', 1_300_000], ['two', 2_800_000]]) })

    expect(result.groups.map(group => group.totalRevenue)).toEqual([1_500_000, 3_000_000])
    expect(result.groups.map(group => group.incentive)).toEqual([6_000, 6_000])
    expect(result.groups.map(group => group.subsidyCap)).toEqual([2_000, 2_000])
    expect(result.qualifyingGroupCount).toBe(2)
  })

  it('cannot pool an overperforming group with an underperforming one', () => {
    const result = calculate({ personalRevenue: new Map([['leader', 200_000], ['one', 1_300_000], ['two', 300_000]]) })

    expect(result.groups.map(group => group.qualifies)).toEqual([true, false])
    expect(result.groupIncentive).toBe(6_000)
    expect(result.subsidyCap).toBe(2_000)
  })

  it('returns zero packages when no group qualifies, without assuming a fallback rate', () => {
    const result = calculate({ personalRevenue: new Map([['leader', 200_000], ['one', 799_999.99]]) })

    expect(result.qualifyingGroupCount).toBe(0)
    expect(result.groupIncentive).toBe(0)
    expect(result.subsidyCap).toBe(0)
    expect(result.fullSpec).toBe(false)
  })

  it('does not invent a group for a leader who has only personal sales', () => {
    const result = calculate({ hierarchy: [member('leader', null)], personalRevenue: new Map([['leader', 2_000_000]]) })

    expect(result.groups).toEqual([])
    expect(result.qualifyingGroupCount).toBe(0)
    expect(result.fullSpec).toBe(false)
  })

  it('uses supplied thresholds and amounts, and leaves direct eligibility to the caller', () => {
    const result = calculate({
      groupSalesThreshold: 900_000,
      incentivePerGroup: 4_321.25,
      subsidyPerGroup: 1_234.56,
      eligibleDirectStaffIds: new Set(['two']),
    })

    expect(result.groups.map(group => group.eligible)).toEqual([false, true])
    expect(result.groups.map(group => group.qualifies)).toEqual([false, true])
    expect(result.groupIncentive).toBe(4_321.25)
    expect(result.subsidyCap).toBe(1_234.56)
    expect(calculate({ eligibleDirectStaffIds: new Set() }).qualifyingGroupCount).toBe(0)
  })
})

describe('IR Full Spec qualification', () => {
  const personalRevenue = new Map([['leader', 200_000], ['one', 800_000], ['two', 800_000], ['three', 800_000]])

  it('requires three qualifying direct groups, each with three immediate children', () => {
    const result = calculate({ hierarchy: fullSpecHierarchy(), personalRevenue })

    expect(result.fullSpec).toBe(true)
    expect(result.qualifyingGroupCount).toBe(3)
    expect(result.groupIncentive).toBe(18_000)
    expect(result.subsidyCap).toBe(6_000)
  })

  it('does not award Full Spec when one target fails or one qualifying direct is ineligible', () => {
    const belowTarget = new Map(personalRevenue)
    belowTarget.set('three', 799_999.99)
    expect(calculate({ hierarchy: fullSpecHierarchy(), personalRevenue: belowTarget }).fullSpec).toBe(false)
    expect(calculate({
      hierarchy: fullSpecHierarchy(),
      personalRevenue,
      eligibleDirectStaffIds: new Set(['one', 'two']),
    }).fullSpec).toBe(false)
  })

  it('requires the three-by-three structure even when all sales targets pass', () => {
    const incomplete = fullSpecHierarchy().filter(person => person.staffId !== 'three-c')
    expect(calculate({ hierarchy: incomplete, personalRevenue }).fullSpec).toBe(false)
    const tooManyChildren = [...fullSpecHierarchy(), member('three-d', 'three')]
    expect(calculate({ hierarchy: tooManyChildren, personalRevenue }).fullSpec).toBe(false)
    const fourthDirect = [...fullSpecHierarchy(), member('four', 'leader')]
    expect(calculate({ hierarchy: fourthDirect, personalRevenue }).fullSpec).toBe(false)
  })

  it('pays expanded groups even though the team no longer has the initial three-by-three shape', () => {
    const revenue = new Map(personalRevenue)
    revenue.set('four', 800_000)
    revenue.set('five', 800_000)
    const result = calculate({
      hierarchy: [...fullSpecHierarchy(), member('four', 'leader'), member('five', 'leader')],
      personalRevenue: revenue,
    })

    expect(result.fullSpec).toBe(false)
    expect(result.qualifyingGroupCount).toBe(5)
    expect(result.groupIncentive).toBe(30_000)
    expect(result.subsidyCap).toBe(10_000)
    expect(result.groups.slice(3).map(group => group.totalRevenue)).toEqual([1_000_000, 1_000_000])
    expect(result.groups.slice(3).map(group => group.secondLayer)).toEqual([[], []])
  })
})

describe('IR hierarchy integrity', () => {
  it('blocks a two-person cycle without counting the leader again as a child', () => {
    const result = calculate({ hierarchy: [member('leader', 'one'), member('one', 'leader')] })

    expect(result.groups[0].secondLayer).toEqual([])
    expect(result.groups[0].totalRevenue).toBe(1_000_000)
    expect(result.groups[0].valid).toBe(false)
    expect(result.qualifyingGroupCount).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/cycle/)
  })

  it('also detects a cycle that returns below the included revenue layers', () => {
    const result = calculate({
      hierarchy: [member('leader', 'deep'), member('one', 'leader'), member('child', 'one'), member('deep', 'child')],
    })

    expect(result.groups[0].secondLayer.map(child => child.staffId)).toEqual(['child'])
    expect(result.qualifyingGroupCount).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/cycle/)
  })

  it('does not treat a self-loop as a direct group', () => {
    const result = calculate({ hierarchy: [member('leader', 'leader')] })

    expect(result.directLineCount).toBe(0)
    expect(result.groupIncentive).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/cycle/)
  })

  it('refuses duplicate memberships rather than counting the same child twice', () => {
    const result = calculate({ hierarchy: [member('leader', null), member('one', 'leader'), member('one', 'leader')] })

    expect(result.directLineCount).toBe(1)
    expect(result.qualifyingGroupCount).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/more than one/)
  })
})
