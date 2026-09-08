/**
 * The boundary a reporting line may not cross.
 *
 * Until 2026-09-08 the reporting line was free to go anywhere. `lib/ladder.ts`
 * said how HIGH a manager had to stand and deliberately said nothing about
 * WHERE they worked, so a salesperson could be dropped under a Finance manager
 * and the chart would draw it without complaint.
 *
 * That freedom is wrong for one kind of department, and the user's ruling on
 * 2026-09-08 is what this file enforces:
 *
 *   **Inside a commission department, the reporting line IS the commission
 *   upline. One graph, drawn twice.**
 *
 * A commission department is one the commission engine pays —
 * `departments.payroll_source = 'commission'`, today only Revenue. The
 * consequences of a line leaving it are not cosmetic:
 *
 *   - The Revenue chart loads that department and no other, so a manager
 *     outside it is not drawn. The edge to them is not drawn either — it is
 *     DROPPED, and the person under them renders as the top of their own tree.
 *   - The run does not agree. `run-actions.ts` reads `comm_hierarchy` by scheme
 *     and by date, with no department filter at all, so that same invisible
 *     manager still earns the override.
 *
 * Together those two make the money and the picture disagree with nothing on
 * screen saying so. Refusing the line is cheaper than reconciling it after a
 * month has been run.
 *
 * The rule is SYMMETRIC. Somebody outside reporting to a manager inside breaks
 * the same equality from the other side: the manager grows a report the
 * commission chart cannot show, so the two shapes differ again.
 *
 * Departments that are NOT paid by commission keep the old freedom entirely.
 * Nothing here constrains a Finance clerk reporting to an HR lead; there is no
 * second graph over those two, so there is nothing to keep in step.
 *
 * Pure, and separate from `hierarchy-mirror.ts` on purpose. That file decides
 * what to do about the OTHER hierarchy once a move is allowed; this one decides
 * whether the move is allowed at all, and it has to answer before any write.
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

/** How to name a department that has none, mid-sentence. */
function where(p: BoundaryPerson): string {
  return p.department ?? 'no department'
}

/**
 * Why this reporting line is refused, or null when it is allowed.
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
