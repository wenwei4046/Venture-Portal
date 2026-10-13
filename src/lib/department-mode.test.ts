import { describe, expect, it } from 'vitest'
import {
  centralizedSplitMessage,
  costModelOf,
  hasMode,
  switchConsequence,
  switchedNote,
  toDepartmentModes,
} from './department-mode'

// User 2026-09-30: a department is a cost center (its cost is split across
// the subsidiaries, its pool nets to zero) or centralized (bills by invoice,
// runs its own pool, not on Billing Allocation).

describe('costModelOf', () => {
  it('reads the two modes and anything else as a cost center, the column default', () => {
    expect(costModelOf('centralized')).toBe('centralized')
    expect(costModelOf('cost_center')).toBe('cost_center')
    expect(costModelOf(undefined)).toBe('cost_center')
    expect(costModelOf('shared')).toBe('cost_center')
  })
})

describe('toDepartmentModes', () => {
  it('turns department_modes() rows into what the switch reads', () => {
    expect(
      toDepartmentModes([
        { id: 'd1', name: 'Revenue Department', segment_key: 'revenue_department', is_internal: false, cost_model: 'centralized', open_split_people: null, can_switch: true },
        { id: 'd2', name: 'Venture Office', segment_key: null, is_internal: true, cost_model: 'cost_center', open_split_people: 0, can_switch: null },
      ]),
    ).toEqual([
      { id: 'd1', name: 'Revenue Department', segmentKey: 'revenue_department', isInternal: false, costModel: 'centralized', openSplitPeople: 0, canSwitch: true },
      { id: 'd2', name: 'Venture Office', segmentKey: null, isInternal: true, costModel: 'cost_center', openSplitPeople: 0, canSwitch: false },
    ])
    expect(toDepartmentModes(null)).toEqual([])
  })
})

describe('hasMode', () => {
  it('only a full department, never HOUZS Venture’s own office or a lightweight one', () => {
    expect(hasMode({ isInternal: false, segmentKey: 'hr' })).toBe(true)
    expect(hasMode({ isInternal: true, segmentKey: null })).toBe(false)
    expect(hasMode({ isInternal: false, segmentKey: null })).toBe(false)
  })
})

describe('switchConsequence', () => {
  it('says what going centralized clears', () => {
    expect(switchConsequence({ name: 'HR', openSplitPeople: 3 }, 'centralized')).toBe(
      'HR leaves Billing Allocation — it bills the subsidiaries by invoice and runs its own pool. 3 splits on payroll still in draft will be cleared; months already Completed keep theirs.',
    )
    expect(switchConsequence({ name: 'IT', openSplitPeople: 1 }, 'centralized')).toContain('1 split on payroll still in draft')
    expect(switchConsequence({ name: 'Marketing', openSplitPeople: 0 }, 'centralized')).toBe(
      'Marketing leaves Billing Allocation — it bills the subsidiaries by invoice and runs its own pool.',
    )
  })

  it('says what going back to a cost center means', () => {
    expect(switchConsequence({ name: 'Marketing', openSplitPeople: 0 }, 'cost_center')).toBe(
      'Marketing joins Billing Allocation — its payroll is split across the subsidiaries there, and its pool should net to zero.',
    )
  })
})

describe('switchedNote', () => {
  it('says what the switch did', () => {
    expect(switchedNote('IT', 'centralized', 1)).toBe('IT is now centralized. Cleared 1 draft split.')
    expect(switchedNote('IT', 'cost_center', 0)).toBe('IT is now a cost center.')
  })
})

describe('centralizedSplitMessage', () => {
  // Word for word what guard_staff_allocation_follows_payroll raised in the
  // 2026-09-30 dry run against the live schema.
  it('matches the database', () => {
    expect(centralizedSplitMessage('Marketing', 'WONG JOEY')).toBe(
      "Marketing is centralized — it bills the subsidiaries by invoice, so WONG JOEY's pay is not split. Switch Marketing to Cost center first",
    )
  })
})
