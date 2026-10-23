/**
 * HR's reminder before a probation ends (2026-10-23 — the user: "if the probation is almost end, then it will
 * notification hr acknowledge for further action"; then, circling HR view's bell: "at least show up in this
 * notification side, in desktop view"). The bell asks `probation_reviews()` (mig 20261024031500) for everybody active
 * on probation and lists those ending within PROBATION_NOTICE_DAYS or past; each waits for Acknowledge until HR
 * acknowledges it, then stays listed until they are confirmed, extended past the window or their employment ends.
 * Computed when the bell reads, never stored as notices: whoever may act sees it, on whichever computer.
 */
import type { User } from '@/types'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage } from '@/lib/page-tabs'
import { fullNameOf } from '@/lib/person-name'
import { daysFrom, probationDue } from '@/lib/employment-status'

export interface ProbationReview {
  id: string
  /** Their full name as the roster lists it — last name, then first (`fullNameOf`). */
  name: string
  code: string | null
  department: string | null
  title: string | null
  hireDate: string | null
  months: number | null
  /** The probation's last day (YYYY-MM-DD); null without a hire date. */
  endsOn: string | null
  /** The end the reminder was acknowledged for — the one it stands at, or an earlier one before an extension. */
  ackEnd: string | null
  ackName: string | null
  ackAt: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

/** `probation_reviews()`'s answer, read defensively (it postdates database.types.ts). */
export function reviewsFromRow(raw: unknown): ProbationReview[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(v => {
    if (!isObj(v) || !text(v.id)) return []
    const months = Number(v.months)
    return [{
      id: v.id as string,
      name: fullNameOf({ employee_name: text(v.name) ?? '', first_name: text(v.firstName), last_name: text(v.lastName) }),
      code: text(v.code),
      department: text(v.department),
      title: text(v.title),
      hireDate: text(v.hireDate),
      months: Number.isInteger(months) && months > 0 ? months : null,
      endsOn: text(v.endsOn),
      ackEnd: text(v.ackEnd),
      ackName: text(v.ackName),
      ackAt: text(v.ackAt),
    }]
  })
}

/** Acknowledged for the end it stands at now. */
export const acknowledged = (r: Pick<ProbationReview, 'endsOn' | 'ackEnd'>): boolean => !!r.endsOn && r.ackEnd === r.endsOn

/** What the bell lists: ending within the window or past — those waiting for Acknowledge first, soonest first. */
export function dueReviews(list: readonly ProbationReview[], today: string): ProbationReview[] {
  return list
    .filter(r => probationDue(r.endsOn, today))
    .sort((a, b) => Number(acknowledged(a)) - Number(acknowledged(b)) || daysFrom(b.endsOn!, a.endsOn!) || a.name.localeCompare(b.name))
}

/** The bell's count: the ones still waiting for Acknowledge. */
export function waitingCount(list: readonly ProbationReview[], today: string): number {
  return dueReviews(list, today).filter(r => !acknowledged(r)).length
}

/**
 * Who is told, in HR view's bell: whoever may edit people on a person's page (People · Edit, with that page's box
 * open) — the page where they confirm, extend or end a probation, and the box Acknowledge asks. Never while viewing as
 * somebody (read-only, and not their bell).
 */
export function seesProbationReminders(user: Pick<User, 'actions' | 'closed' | 'permissions' | 'viewingAs'>): boolean {
  if (user.viewingAs) return false
  const onPage = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/team/people/[id]') } : user
  return canDo(onPage, 'team', 'edit')
}
