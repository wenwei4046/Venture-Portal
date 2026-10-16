/**
 * A person's page saves who they report to apart from the rest of their
 * record (2026-10-16): through `moveReportingLine`, the one writer both charts
 * use — never inside the record's own update, which would skip the
 * department-edge and recruit rules and the head → top-of-tree rule.
 *
 * When their title changes in the same save, which goes first matters. A
 * promotion past their current manager only holds once the new, higher
 * manager is in place; a demotion under a lower manager only once the new,
 * lower title is. So the line goes first, and only when it is refused while a
 * title is changing too does the record go first and the line try again.
 */

export type SaveStep = { ok: true } | { ok: false; reason: string }

export async function saveRecordAndLine(steps: {
  /** The page sent a new upline. */
  lineSent: boolean
  /** The page sent a new title. */
  titleSent: boolean
  /** The line, by `moveReportingLine` — a refusal comes back in words. */
  moveLine: () => Promise<SaveStep>
  /** The rest of the record — a refusal is thrown in words. */
  writeRecord: () => Promise<void>
}): Promise<SaveStep> {
  if (!steps.lineSent) {
    await steps.writeRecord()
    return { ok: true }
  }
  const first = await steps.moveLine()
  if (first.ok) {
    await steps.writeRecord()
    return first
  }
  if (!steps.titleSent) return first
  await steps.writeRecord()
  return steps.moveLine()
}
