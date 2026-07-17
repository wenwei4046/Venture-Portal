/**
 * Match an InfoTech payroll row to a director record by name.
 *
 * The director-only InfoTech export carries full legal names (e.g.
 * "CHEW WEN WEI"); the directors table may hold a shorter or differently
 * spaced/cased variant. Matching order:
 *   1. exact normalised name (case/punctuation/space-insensitive)
 *   2. containment either way, guarded to ≥ 6 normalised chars so short
 *      fragments can't false-hit
 *
 * Pure function — unit tested in director-payroll-match.test.ts.
 */

export interface DirectorRef {
  id: string
  code: string
  name: string
}

export function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function matchDirector(
  employeeName: string,
  directors: DirectorRef[],
): DirectorRef | null {
  const n = normaliseName(employeeName)
  if (!n) return null

  const exact = directors.find(d => normaliseName(d.name) === n)
  if (exact) return exact

  const contained = directors.find(d => {
    const dn = normaliseName(d.name)
    if (dn.length < 6 || n.length < 6) return false
    return n.includes(dn) || dn.includes(n)
  })
  return contained ?? null
}
