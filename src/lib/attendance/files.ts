/**
 * HR › Attendance's files and reminders (2026-10-15, the user's answers: the
 * `attendance` bucket "现在开好", Remind all "现在就做"). Pure — the actions
 * (lib/attendance/actions.ts) and the pages share it.
 */

/** The private bucket an app files MC attachments and punch photos in: punch/<login>/…, request/<login>/… (mig 20261015200000). */
export const ATT_BUCKET = 'attendance'

export type Preview = 'pdf' | 'image' | 'none'

/** A file's short signed link, its name, and how the side panel shows it. */
export interface FileLink {
  url: string
  name: string
  preview: Preview
}

/** What the browser can draw inline: a PDF, a picture (not HEIC — most browsers cannot); anything else is downloaded. */
export function previewOf(name: string): Preview {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? 'image' : 'none'
}

/** att_remind's answer: notices left, people with no login, of those reached how many have no phone signed up, and who was reminded under ten minutes ago. */
export interface RemindOutcome {
  sent: number
  noLogin: number
  noPhone: number
  recent: number
  asked: number
}

/**
 * Remind all's toast: the prototype's words when everyone not in gets it;
 * otherwise who did, and who cannot yet — no login, or no phone signed up for
 * notifications — so HR knows to call them.
 */
export function remindWords(r: RemindOutcome): string {
  const reached = Math.max(0, r.sent - r.noPhone)
  const cannot = r.noLogin + r.noPhone
  if (reached > 0 && cannot === 0 && r.recent === 0) return 'Reminder sent to everyone not in'
  if (r.asked === 0) return 'Everyone is in now'
  const parts = [
    reached ? `Reminder sent to ${reached}` : null,
    r.recent ? `${r.recent} reminded a moment ago` : null,
    cannot ? `${cannot} can’t get one yet — no app notifications` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}
