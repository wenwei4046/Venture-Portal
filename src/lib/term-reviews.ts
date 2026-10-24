/**
 * HR's reminders before a probation or a contract ends — a TERM's (2026-10-23 — the user: "if the probation is almost
 * end, then it will notification hr acknowledge for further action"; then, circling HR view's bell: "at least show up
 * in this notification side, in desktop view"; 2026-10-24: "need 30 days and 15 days before remind, 2 reminder, then
 * for probation need same as well"). The bell asks `probation_reviews()` (mig 20261024214500) and `contract_reviews()`
 * (mig 20261025046500) for everybody active on either, and lists those ending within NOTICE_DAYS or past. Each waits
 * for Acknowledge at the first reminder (30 days before) and again at the second (15 days before) — the first's
 * acknowledgement never answers the second — then stays listed until they are confirmed, extended or renewed past the
 * window, or their employment ends. Computed when the bell reads: whoever may act sees it, on whichever computer. The
 * phone (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送，以及 HR Overview 首页上的数字"): the
 * HR app's Home lists the same ones and its person page acknowledges them, and the hourly sweep tells each phone once
 * per reminder (`notify_term_ends`); HR's Overview counts them on its People tiles.
 */
import type { User } from '@/types'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage } from '@/lib/page-tabs'
import { fullNameOf } from '@/lib/person-name'
import { officeTime } from '@/lib/office-time'
import { ackWords, daysFrom, reminderAcknowledged, reminderDue } from '@/lib/employment-status'

/** The two terms whose end HR is reminded of. */
export type TermKind = 'probation' | 'contract'
export const TERM_KINDS: readonly TermKind[] = ['probation', 'contract']
export const TERM_LABEL: Readonly<Record<TermKind, string>> = { probation: 'Probation', contract: 'Contract' }

export interface TermReview {
  kind: TermKind
  id: string
  /** Their full name as the roster lists it — last name, then first (`fullNameOf`). */
  name: string
  code: string | null
  department: string | null
  title: string | null
  hireDate: string | null
  months: number | null
  /** The term's last day (YYYY-MM-DD); null without a hire date. */
  endsOn: string | null
  /** The end the reminder was acknowledged for — the one it stands at, or an earlier one before an extension. */
  ackEnd: string | null
  ackName: string | null
  ackAt: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

/** `probation_reviews()`'s or `contract_reviews()`'s answer, read defensively (they postdate database.types.ts). */
export function reviewsFromRow(raw: unknown, kind: TermKind): TermReview[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(v => {
    if (!isObj(v) || !text(v.id)) return []
    const months = Number(v.months)
    return [{
      kind,
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

/** Acknowledged for the reminder standing today (the first's acknowledgement does not answer the second). */
export const acknowledged = (r: Pick<TermReview, 'endsOn' | 'ackEnd' | 'ackAt'>, today: string): boolean => reminderAcknowledged(r.endsOn, r, today)

/**
 * "Acknowledged by HR Manager · 24 Oct", "30-day reminder acknowledged by HR Manager · 24 Oct" while the second waits —
 * or null. `format` is the day's (`D MMM`, `D MMM YYYY`).
 */
export function ackLine(r: Pick<TermReview, 'endsOn' | 'ackEnd' | 'ackAt' | 'ackName'>, today: string, format = 'D MMM'): string | null {
  const words = ackWords(r.endsOn, r, today)
  if (!words) return null
  return `${words} by ${r.ackName ?? 'HR'}${r.ackAt ? ` · ${officeTime(r.ackAt).format(format)}` : ''}`
}

/** What the bell lists: ending within the window or past — those waiting for Acknowledge first, soonest first. */
export function dueReviews(list: readonly TermReview[], today: string): TermReview[] {
  return list
    .filter(r => reminderDue(r.endsOn, today))
    .sort((a, b) => Number(acknowledged(a, today)) - Number(acknowledged(b, today)) || daysFrom(b.endsOn!, a.endsOn!) || a.name.localeCompare(b.name))
}

/** The bell's count: the ones still waiting for Acknowledge. */
export function waitingCount(list: readonly TermReview[], today: string): number {
  return dueReviews(list, today).filter(r => !acknowledged(r, today)).length
}

/** A summary line's part for them (HR's Overview, the HR app's Home): "1 probation ending", "3 contracts ending". */
export const endingWords = (kind: TermKind, n: number): string => `${n} ${kind}${n === 1 ? '' : 's'} ending`

/**
 * Who is told, in HR view's bell: whoever may edit people on a person's page (People · Edit, with that page's box
 * open) — the page where they confirm, extend, renew or end a term, and the box Acknowledge asks. Never while viewing
 * as somebody (read-only, and not their bell).
 */
export function seesTermReminders(user: Pick<User, 'actions' | 'closed' | 'permissions' | 'viewingAs'>): boolean {
  if (user.viewingAs) return false
  const onPage = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/team/people/[id]') } : user
  return canDo(onPage, 'team', 'edit')
}
