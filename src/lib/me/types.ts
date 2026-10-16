import type {
  AttAssignment,
  AttHoliday,
  AttLeaveType,
  AttLedger,
  AttLocation,
  AttMonth,
  AttOtRate,
  AttPerson,
  AttPolicy,
  AttRequest,
  AttRoute,
  AttSchedule,
  ClockMode,
  ScheduleDay,
} from '@/lib/attendance/types'

/**
 * "Me" — a person's own attendance, leave, payslips, record and line (2026-10-17, the Claude Design handoff
 * `design_handoff_staff_app`, `Staff App v2.dc.html`): the shapes the database's readers answer (mig 20261017100000),
 * each for the caller's own People record only.
 */

/** A fair coming up: Extra manpower's "For". */
export interface MeFair {
  key: string
  name: string
  from: string
  to: string
}

/** `att_me()`: one's own month, requests, leave ledger and the company's settings the engine reads. */
export interface MeData {
  today: string
  /** The work day it is now — before the policy's cutover, still yesterday's. */
  workDay: string
  /** The server's clock when this was read, "HH:MM:SS" (the office's). */
  now: string
  me: AttPerson | null
  /** How many people report to them: an upline gets My team. */
  reports: number
  schedules: AttSchedule[]
  locations: AttLocation[]
  holidays: AttHoliday[]
  assignments: AttAssignment[]
  leaveTypes: AttLeaveType[]
  otRates: AttOtRate[]
  policies: AttPolicy[]
  routes: AttRoute[]
  month: AttMonth
  requests: AttRequest[]
  ledger: AttLedger
  correctionsUsed: number
  noticeRead: boolean
  fairs: MeFair[]
}

export interface MeTodayPunch {
  dir: 'in' | 'out'
  time: string
  inside: boolean | null
  source: 'app' | 'web' | 'hr'
}

/** `att_me_today()`: just today, for the button and the card that open Me. */
export interface MeToday {
  me: boolean
  workDay: string
  now: string
  mode: ClockMode | null
  day: ScheduleDay | null
  grace: number | null
  onLeave: string | null
  punches: MeTodayPunch[]
  noticeRead: boolean
}

export type TeamPerson = AttPerson & { reportsToMe: boolean }

/** `att_my_team()`: an upline's reports today, and what waits at their step. */
export interface MeTeam {
  today: string
  reports: TeamPerson[]
  assignments: AttAssignment[]
  punches: AttMonth['punches']
  marks: AttMonth['marks']
  leave: AttMonth['leave']
  waiting: AttRequest[]
  ledger: AttLedger
}

export type OrgStatus = 'present' | 'late' | 'leave' | 'out' | 'none'

export interface OrgPerson {
  id: string
  name: string
  title: string | null
  rank: number | null
  departmentId: string | null
  department: string | null
  reportsTo: string | null
  inLine: boolean
  status: OrgStatus
  phone: string | null
}

/** `att_my_org()`: one's line, department and reports — a status word each, never a time. */
export interface MeOrg {
  me: string | null
  departmentId: string | null
  people: OrgPerson[]
}

/** `my_record()`: one's People record, the NRIC and the account to their last four. */
export interface MeRecord {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  hireDate: string | null
  upline: string | null
  phone: string | null
  email: string | null
  address: string | null
  ecName: string | null
  ecPhone: string | null
  ecRel: string | null
  bank: string | null
  accountLast4: string | null
  nric: string | null
  photo: string | null
}

/** `my_payslips()`: one paid month. */
export interface MePayslip {
  month: string
  status: string
  paidOn: string | null
  bank: string | null
  accountLast4: string | null
  basic: number
  statutoryAllowance: number
  nonStatutoryAllowance: number
  otHours: number
  otAmount: number
  commission: number
  unpaidLeaveDays: number
  deduction: number
  epf: number
  socso: number
  eis: number
  pcb: number
  withholding: number
  skbbk: number
  payLineEarnings: number
  payLineDeductions: number
  gross: number
  net: number
  attendance: Record<string, unknown> | null
}

export type Read<T> = { ok: true; data: T } | { ok: false; reason: string }
