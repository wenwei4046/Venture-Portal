/**
 * Transfer from the waiting list (2026-10-10, the HR revamp): People
 * Management's employee form, started from an applicant HR accepted. The
 * applicant's name and phone are carried over; NRIC and the first bank
 * account are what HR fills in, and "Add to company" files the employee and
 * takes the applicant off the list together (`member_transfer_waiting`, mig
 * 20261010150000).
 *
 * Pure, so the form stays thin and this is tested.
 */

/** `member_waiting_transfer(request)`'s answer: what the form starts from. */
export interface WaitingTransferFacts {
  requestId: string
  requestNo: string | null
  status: string
  newPerson: string | null
  contact: string | null
  /** The preferred joining date (YYYY-MM-DD). */
  start: string | null
  subDepartmentId: string
  subDepartment: string | null
  departmentId: string | null
  submittedById: string | null
  submittedBy: string | null
  capacity: number | null
  occupied: number
  held: number
  seatFree: boolean
}

export function transferFactsFromRow(raw: unknown): WaitingTransferFacts | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  if (!text(r.requestId) || !text(r.subDepartmentId)) return null
  return {
    requestId: r.requestId as string,
    requestNo: text(r.requestNo),
    status: text(r.status) ?? '',
    newPerson: text(r.newPerson),
    contact: text(r.contact),
    start: text(r.start),
    subDepartmentId: r.subDepartmentId as string,
    subDepartment: text(r.subDepartment),
    departmentId: text(r.departmentId),
    submittedById: text(r.submittedById),
    submittedBy: text(r.submittedBy),
    capacity: typeof r.capacity === 'number' ? r.capacity : null,
    occupied: Number(r.occupied ?? 0) || 0,
    held: Number(r.held ?? 0) || 0,
    seatFree: r.seatFree === true,
  }
}

/** Still on the waiting list: the only applicants a transfer takes. */
export function onTheList(status: string): boolean {
  return status === 'waiting' || status === 'reserved' || status === 'accepted'
}

/** "Fair is full — 28 of 28 places are taken." — or null while there is room. */
export function fullText(f: Pick<WaitingTransferFacts, 'seatFree' | 'capacity' | 'occupied' | 'held' | 'subDepartment'>): string | null {
  if (f.seatFree || f.capacity === null) return null
  return `${f.subDepartment ?? 'This sub-department'} is full — ${f.occupied + f.held} of ${f.capacity} places are taken.`
}

/** The handoff's line over the form. */
export function transferBanner(f: Pick<WaitingTransferFacts, 'requestNo' | 'submittedBy' | 'subDepartment'>): string {
  return [
    'Transfer from waiting list',
    f.requestNo,
    f.submittedBy ? `submitted by ${f.submittedBy}` : null,
    `joins Revenue · ${f.subDepartment ?? '—'} only`,
  ].filter(Boolean).join(' · ')
}

/** The hire date it opens on: the preferred start, unless that has passed — today for "Any time ready". */
export function defaultHireDate(start: string | null, today: string): string {
  return start && /^\d{4}-\d{2}-\d{2}$/.test(start) && start > today ? start : today
}

export interface TransferInput {
  requestId: string
  name: string
  titleId: string
  reportsTo: string | null
  hireDate: string
  nric: string
  bankName: string
  bankAccountNo: string
  contact: string
  email: string
}

/** NRIC as the roster keeps it: digits, no dashes or spaces (People's own form does the same). */
export function nricDigits(raw: string): string {
  return raw.replace(/[-\s]/g, '')
}

/** An account number as the bank file wants it: no spaces or dashes. */
export function accountDigits(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/** The required fields left blank — the form rims them red. */
export function missingFields(input: Pick<TransferInput, 'nric' | 'bankName' | 'bankAccountNo'>): Array<'nric' | 'bankName' | 'bankAccountNo'> {
  return (['nric', 'bankName', 'bankAccountNo'] as const).filter(k => input[k].trim() === '')
}

/** Why "Add to company" cannot go yet, in the handoff's words — or null. */
export function transferRefusal(input: TransferInput): string | null {
  const name = input.name.trim()
  if (!name) return 'Enter the full name.'
  if (missingFields(input).length) return `Fill in NRIC and the bank account to add ${name}.`
  if (!input.titleId) return 'Pick the joining title.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) return 'Pick the hire date.'
  if (!/^\d+$/.test(accountDigits(input.bankAccountNo))) return 'An account number is its digits.'
  const email = input.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email does not look right.'
  return null
}

/** The roster triggers' and the transfer's refusals carry their own sentence. */
const OWN_SENTENCE = new Set(['22023', 'P0001', '23HOM', '23BND', '23REC', '23LAD', '23RNK', '23DIR', '23514'])

/** `member_transfer_waiting`'s refusal in words. */
export function transferErrorWords(error: { code?: string | null; message?: string | null }): string {
  if (error.code === '42501') return 'Transferring needs HR request management and People › Create access.'
  if (error.code === '23505') return 'Somebody on the roster already has that number.'
  if (OWN_SENTENCE.has(error.code ?? '') && error.message) return error.message
  return 'The employee could not be added. Please try again.'
}
