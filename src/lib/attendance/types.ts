/**
 * HR › Attendance (2026-10-15, the Claude Design handoff "Attendance Prototype
 * Design"): the shapes `att_config()` and `att_month()` answer (migs
 * 20261015030100 / 030200), as the pages read them. Dates are 'YYYY-MM-DD',
 * times 'HH:MM' (the office's clock).
 */

export type Route = 'upline_only' | 'hr_only' | 'upline_then_hr'
export type ClockMode = 'clock' | 'no_clock' | 'off'
export type OtEligibility = 'by_wage' | 'statutory' | 'none'
export type DayType = 'work' | 'off' | 'rest'

export interface AttPerson {
  id: string
  name: string
  code: string | null
  titleId: string | null
  title: string | null
  level: number | null
  levelName: string | null
  departmentId: string | null
  department: string | null
  hireDate: string | null
  hasLogin: boolean
  uplineId: string | null
  upline: string | null
  uplineHasLogin: boolean | null
  templateId: string | null
}

export interface AttTitle {
  id: string
  name: string
  level: number | null
  departmentId: string | null
  hasTemplate: boolean
}

export interface ScheduleDay {
  day: string
  type: DayType
  start?: string
  end?: string
  break?: number
}

export interface AttSchedule {
  id: string
  name: string
  days: ScheduleDay[]
}

export interface AttLocation {
  id: string
  name: string
  /** The six parts put together on one line (the database's `address_compose`), or the old one-box text. */
  address: string
  /** The address in its six parts (2026-10-20, mig 20261020233000) — `addressFromJson` reads them. */
  addressLine1?: string | null
  addressLine2?: string | null
  addressPostcode?: string | null
  addressCity?: string | null
  addressState?: string | null
  addressCountry?: string | null
  /** Whose public holidays cover its people — Settings › Holidays' states (`HOLIDAY_STATES`), not the address's. */
  state: string
  radius: number
  lat: number | null
  lng: number | null
}

export type HolidayKind = 'compulsory' | 'chosen' | 'replacement'

export interface AttHoliday {
  id: string
  day: string
  name: string
  kind: HolidayKind
  states: string
}

export interface AttAssignment {
  id: string
  level: 'company' | 'title' | 'person'
  titleId: string | null
  staffId: string | null
  label: string
  mode: ClockMode
  scheduleId: string | null
  locationId: string | null
  anywhere: boolean
  ot: OtEligibility | null
  from: string
}

/** An entitlement group: first matching group wins. `titles` / `levels` hold 'all' or ids / ranks. */
export interface LeaveGroup {
  titles: string[]
  levels: string[]
  base: number
  steps: Array<{ yrs: number; days: number }>
}

export interface AttLeaveType {
  id: string
  code: string
  name: string
  groups: LeaveGroup[]
  rules: string
  route: Route
  counts: 'working' | 'calendar'
  accrues: boolean
  unpaid: boolean
  drawsFrom: string | null
}

export interface AttOtRate {
  dayType: 'work' | 'off' | 'rest' | 'ph'
  multiplier: number
  minimum: number
}

export interface AttPolicy {
  id: string
  from: string
  fenceMode: 'flag' | 'refuse'
  photoRequired: boolean
  earliestInMin: number
  cutover: string
  graceMin: number
  correctionsPerMonth: number
  otWarnH: number
  otFlagH: number
  otBase: 'basic' | 'fixed'
  photoKeepDays: number
  /** Who clocks › OT "by wage": monthly wages (basic + fixed allowance) above this are not paid overtime (2026-10-15). */
  otWageCap: number
}

export interface AttRoute {
  id: string
  scope: 'company' | 'title'
  kinds: string[]
  label: string
  titleId: string | null
  route: Route
  why: string
}

export interface AttConfig {
  today: string
  now: string
  canCreate: boolean
  canEdit: boolean
  canApprove: boolean
  me: string
  people: AttPerson[]
  titles: AttTitle[]
  levels: Array<{ rank: number; name: string }>
  departments: Array<{ id: string; name: string }>
  schedules: AttSchedule[]
  locations: AttLocation[]
  holidays: AttHoliday[]
  assignments: AttAssignment[]
  leaveTypes: AttLeaveType[]
  otRates: AttOtRate[]
  policies: AttPolicy[]
  routes: AttRoute[]
}

export interface AttPunch {
  id: string
  staffId: string
  day: string
  dir: 'in' | 'out'
  time: string
  source: 'app' | 'web' | 'hr'
  locationId: string | null
  distance: number | null
  inside: boolean | null
  accuracy: number | null
  device: string
  photo: boolean
  reason: string
  invalid: boolean
  invalidReason: string
}

export interface AttMark {
  staffId: string
  day: string
  code: string
  in: string | null
  out: string | null
  note: string
  by: string
  at: string
}

export interface AttOverride {
  day: string
  code: 'H' | 'CH' | 'SO' | 'WD'
  name: string
}

export interface AttLeaveSpan {
  id: string
  ref: string
  staffId: string
  code: string
  from: string
  to: string
  status: 'pending' | 'approved'
}

export interface AttDecision {
  staffId: string
  day: string
  decision: 'Unpaid' | 'Excused' | 'Corrected'
  by: string
}

export interface AttMonth {
  month: string
  punches: AttPunch[]
  marks: AttMark[]
  overrides: AttOverride[]
  leave: AttLeaveSpan[]
  decisions: AttDecision[]
  close: { status: 'open' | 'closed'; closedAt: string | null; closedBy: string | null; people: number | null; reopenedAt: string | null } | null
}

export type StepState = 'waiting' | 'queued' | 'approved' | 'rejected' | 'skipped'

export interface AttStep {
  id: string
  seq: number
  role: 'upline' | 'hr'
  approverId: string | null
  approver: string
  state: StepState
  decidedBy: string | null
  onBehalf: boolean
  note: string
  arrivedAt: string | null
  decidedAt: string | null
}

export interface AttEvent {
  what: string
  who: string
  at: string
  note: string
}

export interface AttRequest {
  id: string
  ref: string
  staffId: string
  who: string
  /** `manpower` — Extra manpower for a fair (2026-10-17, Me › Submit request): detail { for, role, count }. */
  kind: 'leave' | 'ot' | 'correction' | 'profile' | 'manpower'
  leaveCode: string | null
  from: string | null
  to: string | null
  days: number | null
  hours: number | null
  detail: Record<string, unknown>
  reason: string
  attachment: string | null
  hasAttachment: boolean
  route: Route
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  onBehalf: boolean
  by: string
  sentAt: string
  decidedAt: string | null
  steps: AttStep[]
  events: AttEvent[]
}

export interface AttLedgerEntry {
  id: string
  ref: string
  staffId: string
  code: string
  kind: 'opening' | 'adjust'
  days: number
  date: string
  note: string
  detail: Record<string, unknown>
  by: string
  at: string
  events: AttEvent[]
}

export interface AttLedgerLeave {
  id: string
  ref: string
  staffId: string
  code: string
  from: string
  to: string
  days: number | null
  status: 'pending' | 'approved'
  onBehalf: boolean
  by: string
  reason: string
  sentAt: string
  decidedAt: string | null
  steps: Array<Pick<AttStep, 'role' | 'approver' | 'state' | 'decidedBy' | 'onBehalf' | 'decidedAt' | 'arrivedAt'>>
}

export interface AttLedger {
  year: number
  entries: AttLedgerEntry[]
  leave: AttLedgerLeave[]
  marks: Array<{ staffId: string; day: string; code: string; note: string; by: string; at: string }>
}
