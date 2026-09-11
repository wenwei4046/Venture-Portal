/**
 * Employee codes — HV001, HV002, … (user, 2026-09-12).
 *
 * The database hands them out and owns the rule: `hr_staff_costs_assign_code`
 * gives a person saved without a code the largest HV number on the table plus
 * one, and `staff_code_number()` is how it reads a code (migration
 * 20260915040000). This is the same reading on the app side, so the roster
 * can put a title's holders in the order of their numbers — the numbers were
 * given from the top of the ladder down, so inside one title the code IS the
 * order.
 */

/**
 * `HV` then digits, the prefix in either case, whitespace either side
 * tolerated — the database's `staff_code_number()` reads exactly this. Nine
 * digits is the ceiling there too.
 */
const HV_CODE = /^\s*HV\s*(\d{1,9})\s*$/i

/** The number inside an HV code: HV007 → 7. Null for anything else — HVI001, TEST-SEP26-B01, a blank. */
export function staffCodeNumber(code: string | null | undefined): number | null {
  if (code == null) return null
  const m = HV_CODE.exec(code)
  return m ? Number(m[1]) : null
}
