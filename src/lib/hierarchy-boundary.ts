/**
 * The two rules of a reporting line inside a commission department.
 *
 * Until 2026-09-08 the reporting line was free to go anywhere. `lib/ladder.ts`
 * said how HIGH a manager had to stand and deliberately said nothing about
 * WHERE they worked, so a salesperson could be dropped under a Finance manager
 * and the chart would draw it without complaint.
 *
 * That freedom is wrong for one kind of department. The user's ruling on
 * 2026-09-08, made structural on 2026-09-10:
 *
 *   **Inside a commission department, the reporting line IS the commission
 *   upline. One line.**
 *
 * A commission department is one the commission engine pays —
 * `departments.payroll_source = 'commission'`, today only Revenue. The
 * position the engine reads (`comm_hierarchy`) is derived from the roster by
 * trigger (migration 20260910120000): its upline is `reports_to`, always. So
 * a line that would put the override somewhere the engine cannot pay it has
 * to be refused before it is drawn. Two rules do that:
 *
 *   BOUNDARY  a line may not cross the department's edge, in either
 *             direction. The Revenue chart loads that department and no
 *             other, so a manager outside it is not drawn, and the run does
 *             not agree with the picture. Symmetric: an outsider reporting
 *             in gives the manager a report the commission chart cannot show.
 *
 *   RECRUIT   inside the department you may only report to somebody whose
 *             TITLE may hold downlines. A Revenue Specialist cannot lead
 *             anyone — only Senior Revenue Specialist and above can (user,
 *             2026-09-10) — so an RS reporting to an RS is not a line that
 *             exists. The ladder rule allows it (same level); this one does
 *             not.
 *
 * Departments that are NOT paid by commission keep the old freedom entirely.
 * Nothing here constrains a Finance clerk reporting to an HR lead; there is no
 * second graph over those two, so there is nothing to keep in step.
 *
 * Pure. The database triggers `hr_staff_costs_commission_line` refuse the same
 * lines with the same sentences (SQLSTATE 23BND / 23REC); this is what the
 * pages say before the round trip.
 */

export interface BoundaryPerson {
  /** What to call them in the refusal. A refusal nobody can act on is noise. */
  name: string
  /** True when their department is paid by the commission engine. */
  commissionDept: boolean
  /**
   * The department's name, for the sentence. Null is tolerated rather than
   * treated as an error: a person filed with no department is a real row, and
   * the refusal still has to read as English without one.
   */
  department: string | null
}

/** A manager, as the recruit rule needs to see them. */
export interface LineManager extends BoundaryPerson {
  /** The title they hold, for the sentence. Null = no title. */
  title: string | null
  /**
   * May that title hold downlines in this department? True when any rung of
   * it may, false when it has rungs and none may, null when the department's
   * ladder does not carry the title — which the rule reads as "no".
   */
  canRecruit: boolean | null
}

/** How to name a department that has none, mid-sentence. */
function where(p: BoundaryPerson): string {
  return p.department ?? 'no department'
}

/**
 * Why this reporting line would cross the edge, or null when it does not.
 *
 * A string rather than a boolean because the caller has no way to reconstruct
 * the reason: which of the two people is inside the commission department
 * changes both the explanation and the way out, and "that move is not allowed"
 * on its own sends somebody hunting for a rule nobody wrote down.
 *
 * A DETACH — `target` null — is always allowed. Taking somebody to the top of
 * the chart crosses no boundary; they are still in their own department, and
 * the top of a commission department reporting to nobody is exactly the shape
 * the user described.
 */
export function boundaryRefusal(mover: BoundaryPerson, target: BoundaryPerson | null): string | null {
  if (!target) return null
  if (mover.commissionDept === target.commissionDept) return null

  if (mover.commissionDept) {
    return `${mover.name} is in ${where(mover)} and ${target.name} is not — ${target.name} is in ${where(target)}. Inside a commission department the reporting line is also the commission upline, so this would put the override on somebody the Revenue chart cannot show. Pick a manager in ${where(mover)}, or move ${target.name} into it first.`
  }

  return `${target.name} is in ${where(target)} and ${mover.name} is not — ${mover.name} is in ${where(mover)}. The Revenue chart draws ${where(target)} and nothing else, so ${mover.name} would be a report that never appears on it. Move ${mover.name} into ${where(target)} first if they belong there.`
}

/**
 * Why this manager may not hold the mover, or null when they may.
 *
 * Only asked inside a commission department: elsewhere a title says nothing
 * about who may lead. Asked AFTER the boundary, so a manager on the wrong
 * side of the edge is refused for that and not for a title the other
 * department's ladder happens not to carry.
 */
export function recruitRefusal(mover: BoundaryPerson, manager: LineManager | null): string | null {
  if (!manager || !mover.commissionDept) return null
  if (manager.canRecruit === true) return null

  if (!manager.title) {
    return `${mover.name} cannot report to ${manager.name}: ${manager.name} holds no title on the commission ladder, so nobody can earn under them. Give them a title first.`
  }
  return `${mover.name} cannot report to ${manager.name}: a ${manager.title} cannot hold downlines. Inside a commission department the reporting line is also the commission upline, so pick somebody whose title may recruit.`
}

/** Both rules, in the order the trigger applies them. Null when the line may be drawn. */
export function lineRefusal(mover: BoundaryPerson, manager: LineManager | null): string | null {
  return boundaryRefusal(mover, manager) ?? recruitRefusal(mover, manager)
}
