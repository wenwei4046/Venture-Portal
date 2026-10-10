/**
 * Rules › Capacity (2026-10-10, the HR revamp): how many people a
 * sub-department can hold. The limit moved here from Member services, because
 * it is the sub-department's own rule; the figures are the member back
 * office's, read by `member_capacity_of(sub)` (mig 20261010120000): the limit
 * HR set, the active members on a seat today, the positions held for an
 * applicant, and the waiting-list queue.
 *
 * Pure, so the panel and its server action stay thin and this is tested.
 */

export interface SubDepartmentCapacity {
  /** The headcount limit; null = never set. */
  capacity: number | null
  /** Active members holding a seat today. */
  occupied: number
  /** Seats held for an applicant who has not joined yet. */
  reserved: number
  /** What is left (never below 0); null while no limit is set. */
  free: number | null
  /** Waiting-list applicants still waiting for a seat. */
  waiting: number
}

/** The most a limit may be — `member_admin_action('set_capacity')` refuses above it. */
export const CAPACITY_MAX = 10000

const count = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * `member_capacity_of`'s answer as the panel's figures, or null when the
 * function had nothing to say (a sub-department it does not know, or closed).
 */
export function capacityFromRow(row: unknown): SubDepartmentCapacity | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const occupied = count(r.occupied)
  const reserved = count(r.reserved)
  const capacity = r.capacity === null || r.capacity === undefined ? null : count(r.capacity)
  return {
    capacity,
    occupied,
    reserved,
    free: capacity === null ? null : Math.max(0, capacity - occupied - reserved),
    waiting: count(r.waiting),
  }
}

/**
 * Why a typed limit cannot be saved, or null when it can. A limit below the
 * seats already taken would leave somebody without one, so it is refused —
 * the prototype's words, and the database's rule.
 */
export function capacityRefusal(raw: string, now: Pick<SubDepartmentCapacity, 'occupied' | 'reserved'>): string | null {
  const typed = raw.trim()
  const n = Number(typed)
  if (!typed || !Number.isInteger(n) || n < 1 || n > CAPACITY_MAX) return 'Give the limit as a whole number from 1 to 10,000.'
  if (n < now.occupied + now.reserved) return 'Capacity cannot be lower than active members plus reserved positions.'
  return null
}

/** The four cards, in the prototype's order and words. */
export function capacityCards(c: SubDepartmentCapacity): Array<{ label: string; value: string }> {
  return [
    { label: 'Capacity', value: c.capacity === null ? 'not set' : String(c.capacity) },
    { label: 'Active', value: String(c.occupied) },
    { label: 'Reserved', value: String(c.reserved) },
    { label: 'Free', value: c.free === null ? '—' : String(c.free) },
  ]
}
