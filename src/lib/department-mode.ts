// A department is a COST CENTER or CENTRALIZED (user 2026-09-30).
//
//   Cost center — only passes its cost through. Whatever it spends is split
//   across the subsidiaries on Billing Allocation, so its pool should net to
//   zero. HR, Finance, IT, Director Office.
//
//   Centralized — bills a service to the subsidiaries by INVOICE, collects
//   into its own pool and pays its own people and expenses from it. It is not
//   split, so its people are not on Billing Allocation. Director, Marketing,
//   Revenue Department.
//
// The mode decides who is on Billing Allocation — nothing else. Whether a
// cost center's leftover is charged to Venture Office stays Finance's own
// tick per run (`own_share_billback`): the user wants to SEE a cost center
// that did not net to zero, not have Venture absorb it silently.
//
// The database is the authority (departments.cost_model, the switch
// department_set_cost_model, the split guard); this module decides what the
// pages say, so it can be tested without Supabase.

export type CostModel = 'cost_center' | 'centralized'

export function isCostModel(value: unknown): value is CostModel {
  return value === 'cost_center' || value === 'centralized'
}

/** Anything unknown reads as a cost center — the column's own default. */
export function costModelOf(value: unknown): CostModel {
  return isCostModel(value) ? value : 'cost_center'
}

export const COST_MODEL_LABEL: Record<CostModel, string> = {
  cost_center: 'Cost center',
  centralized: 'Centralized',
}

/** One line on what the mode means for this department. */
export function costModelSummary(model: CostModel): string {
  return model === 'centralized'
    ? 'Bills the subsidiaries by invoice · runs its own pool · not on Billing Allocation'
    : 'Its payroll is split across the subsidiaries on Billing Allocation · its pool should net to zero'
}

/** A department as the switch sees it (`department_modes()`). */
export interface DepartmentMode {
  id: string
  name: string
  segmentKey: string | null
  isInternal: boolean
  costModel: CostModel
  /** People (per month) whose split is still on draft payroll — what centralized would clear. */
  openSplitPeople: number
  /** Whether the person SIGNED IN may switch it — not the view they look through. */
  canSwitch: boolean
}

/** Rows of `department_modes()` as the app reads them. */
export function toDepartmentModes(
  rows: ReadonlyArray<{
    id: string
    name: string
    segment_key: string | null
    is_internal: boolean
    cost_model: string
    open_split_people: number | null
    can_switch: boolean | null
  }> | null | undefined,
): DepartmentMode[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    segmentKey: r.segment_key,
    isInternal: r.is_internal,
    costModel: costModelOf(r.cost_model),
    openSplitPeople: Number(r.open_split_people ?? 0),
    canSwitch: r.can_switch === true,
  }))
}

/**
 * Only a full department has a mode: HOUZS Venture's own office bears the
 * bill-backs, and a lightweight department books under Venture with no pool
 * of its own to run.
 */
export function hasMode(d: Pick<DepartmentMode, 'isInternal' | 'segmentKey'>): boolean {
  return !d.isInternal && d.segmentKey != null
}

/** What switching `d` to `to` will do — said before it is done. */
export function switchConsequence(d: Pick<DepartmentMode, 'name' | 'openSplitPeople'>, to: CostModel): string {
  if (to === 'centralized') {
    const cleared =
      d.openSplitPeople > 0
        ? ` ${d.openSplitPeople} split${d.openSplitPeople === 1 ? '' : 's'} on payroll still in draft will be cleared; months already Completed keep theirs.`
        : ''
    return `${d.name} leaves Billing Allocation — it bills the subsidiaries by invoice and runs its own pool.${cleared}`
  }
  return `${d.name} joins Billing Allocation — its payroll is split across the subsidiaries there, and its pool should net to zero.`
}

/**
 * The refusal for a split on a centralized department's person — word for word
 * what the database raises (guard_staff_allocation_follows_payroll).
 */
export function centralizedSplitMessage(department: string, name: string): string {
  return `${department} is centralized — it bills the subsidiaries by invoice, so ${name}'s pay is not split. Switch ${department} to Cost center first`
}

/** What the switch did, in a line. */
export function switchedNote(name: string, to: CostModel, clearedPeople: number): string {
  const base = `${name} is now ${to === 'centralized' ? 'centralized' : 'a cost center'}.`
  return clearedPeople > 0
    ? `${base} Cleared ${clearedPeople} draft split${clearedPeople === 1 ? '' : 's'}.`
    : base
}
