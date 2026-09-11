/**
 * Matching a row of an InfoTech file to a person on the roster.
 *
 * Two files carry people — the payroll summary (`infotech-payroll.ts`) and the
 * employee list (`infotech-staff.ts`) — and both name a person the same two
 * ways: InfoTech's own employee number (its "Code" column) and the name.
 * Until 2026-09-12 the portal's `employee_code` WAS that number, so matching
 * on it was exact; the renumbering (HV001 from the top of the ladder) ended
 * that, and the number now lives in `hr_staff_costs.infotech_code`, kept
 * separate from the portal's HV code.
 *
 * The order is InfoTech's number first, the name second (user, 2026-09-12:
 * "能不能用名字去来对标"). The number is the identity and a name is only a
 * spelling of one, so the name is trusted only where the number has nothing
 * to say: a person whose number is already known is never re-identified by
 * name under a different number — that row is far more likely a namesake
 * than a renumbering, and a guess would put one person's pay or contract on
 * another's record. A name two people share matches nobody either. Both
 * misses say what they saw, so the fix (the InfoTech No on the right
 * person's card) is one step away.
 */

export interface MatchableStaff {
  id: string
  employee_name: string
  /** InfoTech's employee number, or null when it has never been learnt. */
  infotech_code: string | null
}

export type StaffMatchedBy = 'infotech_code' | 'employee_name'

/**
 * Why a row matched nobody. `none` is the ordinary case — a person the
 * roster does not have — and the only one an import may treat as a new
 * person; the other two are conflicts to be read by somebody.
 */
export type StaffMissKind = 'none' | 'ambiguous_name' | 'number_conflict'

export type StaffMatch<T extends MatchableStaff> =
  | { staff: T; matchedBy: StaffMatchedBy; miss?: undefined; reason?: undefined }
  | { staff: null; matchedBy?: undefined; miss: StaffMissKind; reason: string }

/** A name as the comparison sees it: case, spacing and punctuation ignored. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A code as the comparison sees it: trimmed, upper-cased; blank is nothing. */
export function normaliseInfotechCode(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toUpperCase()
  return c === '' ? null : c
}

export interface FileRowIdentity {
  employeeCode: string
  employeeName: string
}

/**
 * Builds the matcher once for a roster, then answers per file row. The
 * roster passed in decides the scope — the payroll import passes active
 * people only, the employee list everybody, since somebody who left may be
 * back on it.
 */
export function buildStaffMatcher<T extends MatchableStaff>(
  staff: readonly T[],
): (row: FileRowIdentity) => StaffMatch<T> {
  const byCode = new Map<string, T>()
  const byName = new Map<string, T[]>()
  for (const s of staff) {
    const code = normaliseInfotechCode(s.infotech_code)
    if (code && !byCode.has(code)) byCode.set(code, s)
    const key = normaliseName(s.employee_name)
    if (key === '') continue
    const list = byName.get(key)
    if (list) list.push(s)
    else byName.set(key, [s])
  }

  return row => {
    const code = normaliseInfotechCode(row.employeeCode)
    const hit = code ? byCode.get(code) : undefined
    if (hit) return { staff: hit, matchedBy: 'infotech_code' }

    const same = byName.get(normaliseName(row.employeeName)) ?? []
    if (same.length > 1) {
      return {
        staff: null,
        miss: 'ambiguous_name',
        reason:
          `${same.length} people on the roster share this name (${same.map(s => s.employee_name).join(', ')}) — ` +
          'set the InfoTech No on the right person and import again',
      }
    }
    if (same.length === 1) {
      const person = same[0]
      const known = normaliseInfotechCode(person.infotech_code)
      if (known && code && known !== code) {
        return {
          staff: null,
          miss: 'number_conflict',
          reason:
            `${person.employee_name} is InfoTech No ${person.infotech_code} on the roster, but the file says ${row.employeeCode.trim()} — ` +
            'correct one of them and import again',
        }
      }
      return { staff: person, matchedBy: 'employee_name' }
    }
    return { staff: null, miss: 'none', reason: 'No matching staff' }
  }
}
