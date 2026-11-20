/**
 * Add Staff remembers the waiting list (2026-11-20, the user: "以后直接新建员工时，
 * 提醒我 waiting list 有同一个人"). CHEAH SHU HUI was filed on People's own Add
 * Staff form on 9 Nov while her waiting-list request RQ-2610-004 stayed open —
 * only Transfer (`/team/people/new?waiting=<id>`) closes a request. So the plain
 * form looks for the person it is filing among the open waiting lists, by phone
 * or by name, and says where to transfer them from instead.
 *
 * Pure, so the form stays thin and this is tested.
 */

export interface WaitingApplicant {
  /** The request — Transfer opens `/team/people/new?waiting=<id>`. */
  id: string
  requestNo: string | null
  name: string | null
  contact: string | null
  /** The sub-department whose waiting list holds them. */
  subName: string
  /** Their place on that list (#1 …). */
  position: number
}

/** A phone as digits alone, Malaysia's +60 read as the leading 0. */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.startsWith('60') && digits.length >= 10 ? `0${digits.slice(2)}` : digits
}

/** A name in capitals with single spaces — the roster writes it every way. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Fewer digits than a Malaysian number has are still being typed. */
const MIN_PHONE_DIGITS = 9

/**
 * The open applicants the form's name or phone points at: the same phone
 * (once nine digits are typed), or the same whole name.
 */
export function waitingMatches(
  name: string | null | undefined,
  phone: string | null | undefined,
  applicants: readonly WaitingApplicant[],
): WaitingApplicant[] {
  const n = nameKey(name)
  const p = phoneKey(phone)
  return applicants.filter(a =>
    (p.length >= MIN_PHONE_DIGITS && phoneKey(a.contact) === p)
    || (n !== '' && nameKey(a.name) === n),
  )
}
