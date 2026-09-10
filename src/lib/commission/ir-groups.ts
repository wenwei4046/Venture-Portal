/**
 * IR group packages, confirmed by the user on 2026-09-11.
 *
 * Each direct line is judged independently on the leader's own sales PLUS
 * that direct's own sales PLUS its immediate children's own sales. The
 * leader's personal sales intentionally count again in every group. These
 * overlapping qualification figures must never replace personal sales or be
 * added together as actual revenue. Anything below the second layer is out.
 * Earned fourth and subsequent direct lines use the same monthly package.
 * The membership rules enforce expansion capacity separately from payouts.
 *
 * The caller supplies one month's eligible personal revenue and this scheme's
 * hierarchy. This helper does not select orders, resolve ranks or pay payroll.
 */

export interface IrGroupMember {
  staffId: string
  uplineStaffId: string | null
}

export interface IrGroupsInput {
  leaderStaffId: string
  hierarchy: readonly IrGroupMember[]
  personalRevenue: ReadonlyMap<string, number>
  groupSalesThreshold: number
  incentivePerGroup: number
  subsidyPerGroup: number
  /** Omitted = all directs eligible; supplied = only these directs qualify.
   *  Title/structure eligibility belongs to the caller, not an assumed title. */
  eligibleDirectStaffIds?: ReadonlySet<string>
}

export interface IrRevenueContribution {
  staffId: string
  personalRevenue: number
}

export interface IrGroup {
  directStaffId: string
  leaderPersonalRevenue: number
  directPersonalRevenue: number
  secondLayer: IrRevenueContribution[]
  secondLayerRevenue: number
  totalRevenue: number
  /** Snapshot of the target used in this run, so later rule edits cannot change its explanation. */
  targetRevenue: number
  eligible: boolean
  /** Corrupt hierarchy is reported, but cannot qualify for a payment. */
  valid: boolean
  qualifies: boolean
  incentive: number
  /** A non-cash claim limit, never part of groupIncentive. */
  subsidyCap: number
}

export interface IrGroupsResult {
  leaderStaffId: string
  groups: IrGroup[]
  directLineCount: number
  qualifyingGroupCount: number
  groupIncentive: number
  subsidyCap: number
  /** Initial three-by-three structure and three independent monthly targets.
   *  Expanded teams do not need to recreate this initial qualification;
   *  permanent expansion entitlements are recorded separately. */
  fullSpec: boolean
  warnings: string[]
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function sumMoney(values: readonly number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0))
}

export function computeIrGroups(input: IrGroupsInput): IrGroupsResult {
  const { leaderStaffId } = input
  if (!Number.isFinite(input.groupSalesThreshold) || input.groupSalesThreshold <= 0) {
    throw new Error('IR group sales threshold must be greater than zero')
  }
  for (const amount of [input.incentivePerGroup, input.subsidyPerGroup]) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('IR group incentive and subsidy must be non-negative amounts')
    }
  }

  const warnings: string[] = []
  const members = new Map<string, IrGroupMember>()
  let validHierarchy = true
  for (const member of input.hierarchy) {
    if (members.has(member.staffId)) {
      warnings.push(`Staff ${member.staffId} has more than one IR hierarchy row.`)
      validHierarchy = false
      continue
    }
    members.set(member.staffId, member)
  }

  if (!members.has(leaderStaffId)) {
    warnings.push(`Staff ${leaderStaffId} has no IR hierarchy row.`)
    validHierarchy = false
  }

  // A cycle can return to the leader after the two included layers. Check
  // the parent chain independently of the revenue depth, so that such a
  // cycle cannot masquerade as an ordinary two-layer group.
  const ancestors = new Set<string>()
  let cursor: string | null = leaderStaffId
  while (cursor !== null) {
    if (ancestors.has(cursor)) {
      warnings.push(`Hierarchy cycle detected at staff ${cursor} — IR groups cannot qualify.`)
      validHierarchy = false
      break
    }
    ancestors.add(cursor)
    cursor = members.get(cursor)?.uplineStaffId ?? null
  }

  const children = new Map<string, IrGroupMember[]>()
  for (const member of members.values()) {
    if (member.uplineStaffId === null) continue
    const siblings = children.get(member.uplineStaffId) ?? []
    siblings.push(member)
    children.set(member.uplineStaffId, siblings)
  }

  const revenueOf = (staffId: string): number => {
    const revenue = input.personalRevenue.get(staffId) ?? 0
    if (!Number.isFinite(revenue)) {
      throw new Error(`Staff ${staffId} has an invalid personal revenue amount`)
    }
    return roundMoney(revenue)
  }
  const leaderPersonalRevenue = revenueOf(leaderStaffId)
  const directs = children.get(leaderStaffId) ?? []
  const groups: IrGroup[] = directs.filter(direct => direct.staffId !== leaderStaffId).map(direct => {
    const directPersonalRevenue = revenueOf(direct.staffId)
    const secondLayer = (children.get(direct.staffId) ?? [])
      .filter(child => child.staffId !== leaderStaffId && child.staffId !== direct.staffId)
      .map(child => ({ staffId: child.staffId, personalRevenue: revenueOf(child.staffId) }))
    const secondLayerRevenue = sumMoney(secondLayer.map(child => child.personalRevenue))
    const totalRevenue = sumMoney([leaderPersonalRevenue, directPersonalRevenue, secondLayerRevenue])
    const eligible = input.eligibleDirectStaffIds?.has(direct.staffId) ?? true
    const qualifies = validHierarchy && eligible && totalRevenue >= roundMoney(input.groupSalesThreshold)

    return {
      directStaffId: direct.staffId,
      leaderPersonalRevenue,
      directPersonalRevenue,
      secondLayer,
      secondLayerRevenue,
      totalRevenue,
      targetRevenue: roundMoney(input.groupSalesThreshold),
      eligible,
      valid: validHierarchy,
      qualifies,
      // One package per group, including when revenue exceeds the target.
      incentive: qualifies ? roundMoney(input.incentivePerGroup) : 0,
      subsidyCap: qualifies ? roundMoney(input.subsidyPerGroup) : 0,
    }
  })

  return {
    leaderStaffId,
    groups,
    directLineCount: groups.length,
    qualifyingGroupCount: groups.filter(group => group.qualifies).length,
    groupIncentive: sumMoney(groups.map(group => group.incentive)),
    subsidyCap: sumMoney(groups.map(group => group.subsidyCap)),
    fullSpec: groups.length === 3 && groups.every(group => group.qualifies && group.secondLayer.length === 3),
    warnings,
  }
}
