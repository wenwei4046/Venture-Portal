/**
 * Sales Groups › Waiting list's "+" (2026-10-11, the user: "我点击「加」了过后，我可以直接加人进去这个
 * waiting list 里面"): what the window asks and what is sent. `member_waiting_add` (mig 20261011230000)
 * puts the applicant at the END of the list, as if accepted now — no member form, no Member services
 * review.
 *
 * The user's answers the same day: "Submitted by" is always somebody from the Revenue team (the member
 * Transfer puts the new member under); only the basics are asked — name, phone, joining date — and HR's
 * own questions may stay blank; the signed application form follows Form settings (asked for once
 * "Members must upload the signed form" is on, and may be attached before that).
 *
 * Pure, so the window and the Server Action share it and it is tested.
 */

import { answersFor, fillIn, type WaitingAnswer } from '@/lib/member/waiting-answers'
import type { WaitingForm } from './waiting-form'

export interface WaitingAddDraft {
  name: string
  contact: string
  /** The joining date, YYYY-MM-DD. */
  start: string
  /** The Revenue-team member who brought them in: their staff id. */
  submittedBy: string
  /** HR's own questions' answers, by question id. */
  answers: Record<string, string>
}

/** What the window sends: the draft and the sub-department whose list it is. */
export interface WaitingAddInput extends WaitingAddDraft {
  subDepartmentId: string
}

export const EMPTY_ADD: WaitingAddDraft = { name: '', contact: '', start: '', submittedBy: '', answers: {} }

/** The window's own fields, in its order — what "Fill in …" names when they are blank. */
const FIELDS: ReadonlyArray<{ key: keyof Omit<WaitingAddDraft, 'answers'>; label: string }> = [
  { key: 'name', label: 'New member name' },
  { key: 'contact', label: 'Phone number' },
  { key: 'start', label: 'Joining date' },
  { key: 'submittedBy', label: 'Submitted by' },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "2026-11-01" and a day the calendar has. */
export function isDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** What the browser sent, read on the server: only strings where strings belong. */
export function waitingAddInputFrom(raw: unknown): WaitingAddInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const answers: Record<string, string> = {}
  if (o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers)) {
    for (const [id, value] of Object.entries(o.answers as Record<string, unknown>).slice(0, 40)) {
      if (typeof value === 'string') answers[id] = value
    }
  }
  return {
    subDepartmentId: str(o.subDepartmentId),
    name: str(o.name),
    contact: str(o.contact),
    start: str(o.start),
    submittedBy: str(o.submittedBy),
    answers,
  }
}

/**
 * What stops an add, in words — the first problem in the window's order — or null. `form` is the
 * waiting list's form as saved: its "Members must upload the signed form" holds "+" too.
 */
export function waitingAddRefusal(
  input: WaitingAddInput,
  form: Pick<WaitingForm, 'requireUpload'> | null,
  attached: boolean,
): string | null {
  const blank = FIELDS.filter(f => !input[f.key].trim())
  if (blank.length) return fillIn(blank)
  if (input.name.trim().length > 160) return 'Keep the name under 160 characters.'
  if (input.contact.trim().length > 60) return 'Keep the phone number under 60 characters.'
  if (!isDay(input.start)) return 'Pick the joining date.'
  if (!UUID.test(input.submittedBy) || !UUID.test(input.subDepartmentId)) return 'Reload the page and try again.'
  if (Object.values(input.answers).some(v => v.trim().length > 500)) return 'An answer is too long — keep it under 500 characters.'
  if (form?.requireUpload && !attached) return 'Upload the signed application form — Form settings asks for it.'
  return null
}

/**
 * The request's detail, as a member's carries it: the three built-ins, every one of HR's own questions
 * in the form's order with its label as the form words it (blank ones included), the form's version,
 * and the signed form when one is attached (its name and the server's sha256 of the bytes it checked).
 */
export function waitingAddDetail(
  input: WaitingAddDraft,
  form: Pick<WaitingForm, 'fields' | 'version'> | null,
  signed: { name: string; hash: string } | null,
): { newPerson: string; contact: string; start: string; answers: WaitingAnswer[]; formVersion?: number; signedFormName?: string; signedFormHash?: string } {
  return {
    newPerson: input.name.trim(),
    contact: input.contact.trim(),
    start: input.start,
    answers: answersFor(form, input.answers),
    ...(form && form.version > 0 ? { formVersion: form.version } : {}),
    ...(signed ? { signedFormName: signed.name.slice(0, 200), signedFormHash: signed.hash } : {}),
  }
}

// ─── The signed application form ────────────────────────────────────────────

/** The member app's rule (`verifiedUpload`): a PDF, PNG or JPG of 3 MB or less. */
export const SIGNED_FORM_ACCEPT = '.pdf,.png,.jpg,.jpeg'
export const SIGNED_FORM_MAX_BYTES = 3 * 1024 * 1024

/** What the window can tell before sending: the size. The bytes are checked on the server. */
export function signedFormRefusal(file: { size: number }): string | null {
  if (file.size < 1) return 'That file is empty — attach the signed form again.'
  if (file.size > SIGNED_FORM_MAX_BYTES) return 'The signed form must be 3 MB or smaller.'
  return null
}

/**
 * The file looked at byte by byte, whatever its name says — the member app's check: PNG, JPEG or PDF
 * by their first bytes, and a type the browser declared must agree. Null = not one of them.
 */
export function signedFormKind(bytes: Uint8Array, declared: string): { mime: string; extension: 'png' | 'jpg' | 'pdf' } | null {
  const starts = (sig: readonly number[]) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b)
  const kind = starts([137, 80, 78, 71, 13, 10, 26, 10])
    ? ({ mime: 'image/png', extension: 'png' } as const)
    : starts([255, 216, 255])
      ? ({ mime: 'image/jpeg', extension: 'jpg' } as const)
      : starts([37, 80, 68, 70, 45])
        ? ({ mime: 'application/pdf', extension: 'pdf' } as const)
        : null
  if (!kind || (declared && declared !== kind.mime)) return null
  return kind
}

// ─── "Submitted by" ─────────────────────────────────────────────────────────

export interface SubmitterGroup {
  /** The sub-department ("Fair"). */
  group: string
  people: Array<{ id: string; name: string; title: string | null }>
}

/**
 * Who may have brought them in: the Revenue team as the page charts it — this sub-department first,
 * then its siblings — each person once (where they come first), by name. The database asks the same
 * (an active placement in a sub-department of the department).
 */
export function submitterGroups(
  departments: ReadonlyArray<{ name: string; people: ReadonlyArray<{ staffId: string; name: string; titleName?: string | null }> }>,
  current: string,
): SubmitterGroup[] {
  const ordered = [...departments].sort((a, b) => Number(b.name === current) - Number(a.name === current))
  const seen = new Set<string>()
  const groups: SubmitterGroup[] = []
  for (const d of ordered) {
    const people = d.people
      .filter(p => !seen.has(p.staffId))
      .map(p => ({ id: p.staffId, name: p.name, title: p.titleName ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const p of people) seen.add(p.id)
    if (people.length) groups.push({ group: d.name, people })
  }
  return groups
}
