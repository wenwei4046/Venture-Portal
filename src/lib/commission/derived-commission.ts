/**
 * Whether a payroll row's Commission is HR's to type.
 *
 * For a salesperson in a `payroll_source = 'commission'` department it is not:
 * the commission run computes it from the ERP sales orders and
 * `apply_commission_run` writes it, and every Apply rewrites the field. A hand
 * edit there would not be rejected by the database — it would simply be
 * silently replaced the next time the month is recomputed, after a spell of
 * disagreeing with the statement that is supposed to explain it.
 *
 * Pulled out of the Server Action so it can be tested: the interesting case is
 * not the malicious one, it is the ordinary one. The payroll grid posts the
 * WHOLE row when any cell changes, so an untouched `commission_amount` rides
 * along with a legitimate edit to Deduction and must pass quietly.
 */

export interface DerivedCommissionRow {
  /** The staff member sits in a commission-payroll department. */
  isDerived: boolean
  /** What the database currently holds, to tell "unchanged" from "moved". */
  stored: number
  /** For the error message — a UUID tells the reader nothing. */
  name: string
}

/** Sub-cent differences are float noise, not an edit. */
const EPSILON = 0.005

export class DerivedCommissionError extends Error {}

/**
 * Returns the fields that may actually be written.
 *
 * - not a derived row, or no commission in the payload → unchanged
 * - derived and the value is unchanged → the field is dropped (writing it
 *   would fire the recompute trigger for nothing)
 * - derived and the value MOVED → throws, naming who and what to do instead
 */
export function resolveCommissionWrite<T extends { commission_amount?: number }>(
  fields: T,
  row: DerivedCommissionRow | undefined,
): T {
  if (!row?.isDerived || fields.commission_amount === undefined) return fields

  if (Math.abs(Number(fields.commission_amount) - row.stored) > EPSILON) {
    throw new DerivedCommissionError(
      `${row.name}'s commission source comes from the commission run. ` +
        `Use the Gross Commission adjustment editor to record a payroll increase or decrease, or recalculate the Revenue source.`,
    )
  }

  const { commission_amount: _derived, ...rest } = fields
  return rest as T
}
