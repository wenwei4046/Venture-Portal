import type { AttLedger, AttLeaveType, AttMonth, AttOtRate, AttPolicy, AttRequest } from '@/lib/attendance/types'
import type { MeData, MeOrg, MePayslip, MeRecord, MeTeam, MeToday, OrgStatus } from './types'

/**
 * The readers' answers (mig 20261017100000) as typed values — numbers the database may hand as strings made numbers,
 * a missing list an empty one, the way lib/attendance/server.ts reads HR's own. Pure.
 */

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export const leaveTypesOf = (v: unknown): AttLeaveType[] =>
  arr<AttLeaveType>(v).map(t => ({
    ...t,
    groups: arr<AttLeaveType['groups'][number]>(t.groups).map(g => ({
      ...g,
      titles: arr<string>(g.titles),
      levels: arr<string>(g.levels).map(String),
      base: num(g.base),
      steps: arr<{ yrs: unknown; days: unknown }>(g.steps).map(s => ({ yrs: num(s.yrs), days: num(s.days) })),
    })),
  }))

export const otRatesOf = (v: unknown): AttOtRate[] =>
  arr<AttOtRate>(v).map(x => ({ ...x, multiplier: num(x.multiplier), minimum: num(x.minimum) }))

export const policiesOf = (v: unknown): AttPolicy[] =>
  arr<AttPolicy>(v).map(p => ({ ...p, graceMin: num(p.graceMin), correctionsPerMonth: num(p.correctionsPerMonth), otWageCap: num(p.otWageCap) }))

export const requestsOf = (v: unknown): AttRequest[] =>
  arr<AttRequest>(v).map(r => ({
    ...r,
    days: numOrNull(r.days),
    hours: numOrNull(r.hours),
    detail: obj(r.detail),
    steps: arr(r.steps),
    events: arr(r.events),
  }))

export function monthOf(v: unknown): AttMonth {
  const m = obj(v)
  return {
    month: str(m.month),
    punches: arr(m.punches),
    marks: arr(m.marks),
    overrides: arr(m.overrides),
    leave: arr(m.leave),
    decisions: arr(m.decisions),
    close: (m.close as AttMonth['close']) ?? null,
  }
}

export function ledgerOf(v: unknown): AttLedger {
  const l = obj(v)
  return {
    year: num(l.year),
    entries: arr<AttLedger['entries'][number]>(l.entries).map(e => ({ ...e, days: num(e.days), detail: obj(e.detail), events: arr(e.events) })),
    leave: arr<AttLedger['leave'][number]>(l.leave).map(x => ({ ...x, days: numOrNull(x.days), steps: arr(x.steps) })),
    marks: arr(l.marks),
  }
}

export function meDataOf(raw: unknown): MeData | null {
  const d = obj(raw)
  if (!d.today) return null
  return {
    today: str(d.today),
    workDay: str(d.workDay) || str(d.today),
    now: str(d.now) || '00:00:00',
    me: d.me ? (d.me as MeData['me']) : null,
    reports: num(d.reports),
    schedules: arr(d.schedules),
    locations: arr<MeData['locations'][number]>(d.locations).map(l => ({ ...l, radius: num(l.radius), lat: numOrNull(l.lat), lng: numOrNull(l.lng) })),
    holidays: arr(d.holidays),
    assignments: arr(d.assignments),
    leaveTypes: leaveTypesOf(d.leaveTypes),
    otRates: otRatesOf(d.otRates),
    policies: policiesOf(d.policies),
    routes: arr(d.routes),
    month: monthOf(d.month),
    requests: requestsOf(d.requests),
    ledger: ledgerOf(d.ledger),
    correctionsUsed: num(d.correctionsUsed),
    noticeRead: d.noticeRead === true,
    fairs: arr<MeData['fairs'][number]>(d.fairs).map(f => ({ key: str(f.key), name: str(f.name), from: str(f.from), to: str(f.to) })),
  }
}

export function meTodayOf(raw: unknown): MeToday | null {
  const d = obj(raw)
  if (typeof d.me !== 'boolean') return null
  return {
    me: d.me,
    name: strOrNull(d.name),
    workDay: str(d.workDay),
    now: str(d.now),
    mode: (strOrNull(d.mode) as MeToday['mode']) ?? null,
    day: d.day ? (d.day as MeToday['day']) : null,
    dayType: d.dayType === 'off' || d.dayType === 'rest' ? d.dayType : 'work',
    holiday: strOrNull(d.holiday),
    grace: numOrNull(d.grace),
    onLeave: strOrNull(d.onLeave),
    onLeaveName: strOrNull(d.onLeaveName),
    punches: arr(d.punches),
    noticeRead: d.noticeRead === true,
  }
}

export function meTeamOf(raw: unknown): MeTeam {
  const d = obj(raw)
  return {
    today: str(d.today),
    reports: arr(d.reports),
    assignments: arr(d.assignments),
    punches: arr(d.punches),
    marks: arr(d.marks),
    leave: arr(d.leave),
    waiting: requestsOf(d.waiting).map((r, i) => ({ ...r, nth: numOrNull(arr<Record<string, unknown>>(d.waiting)[i]?.nth) })),
    otHours: Object.fromEntries(Object.entries(obj(d.otHours)).map(([k, v]) => [k, num(v)])),
    ledger: ledgerOf(d.ledger),
  }
}

const STATUS = new Set<OrgStatus>(['present', 'late', 'leave', 'out', 'none'])

export function meOrgOf(raw: unknown): MeOrg {
  const d = obj(raw)
  return {
    me: strOrNull(d.me),
    departmentId: strOrNull(d.departmentId),
    people: arr<Record<string, unknown>>(d.people).map(p => ({
      id: str(p.id),
      name: str(p.name),
      title: strOrNull(p.title),
      rank: numOrNull(p.rank),
      level: strOrNull(p.level),
      departmentId: strOrNull(p.departmentId),
      department: strOrNull(p.department),
      reportsTo: strOrNull(p.reportsTo),
      inLine: p.inLine === true,
      status: STATUS.has(p.status as OrgStatus) ? (p.status as OrgStatus) : 'none',
      phone: strOrNull(p.phone),
    })),
  }
}

export function meRecordOf(raw: unknown): MeRecord | null {
  const d = obj(raw)
  if (!d.id) return null
  return {
    id: str(d.id),
    name: str(d.name),
    code: strOrNull(d.code),
    title: strOrNull(d.title),
    department: strOrNull(d.department),
    hireDate: strOrNull(d.hireDate),
    upline: strOrNull(d.upline),
    phone: strOrNull(d.phone),
    email: strOrNull(d.email),
    address: strOrNull(d.address),
    ecName: strOrNull(d.ecName),
    ecPhone: strOrNull(d.ecPhone),
    ecRel: strOrNull(d.ecRel),
    bank: strOrNull(d.bank),
    accountLast4: strOrNull(d.accountLast4),
    nric: strOrNull(d.nric),
    photo: strOrNull(d.photo),
  }
}

export const payslipsOf = (raw: unknown): MePayslip[] =>
  arr<Record<string, unknown>>(raw).map(p => ({
    month: str(p.month),
    status: str(p.status),
    paidOn: strOrNull(p.paidOn),
    bank: strOrNull(p.bank),
    accountLast4: strOrNull(p.accountLast4),
    basic: num(p.basic),
    statutoryAllowance: num(p.statutoryAllowance),
    nonStatutoryAllowance: num(p.nonStatutoryAllowance),
    otHours: num(p.otHours),
    otAmount: num(p.otAmount),
    commission: num(p.commission),
    unpaidLeaveDays: num(p.unpaidLeaveDays),
    deduction: num(p.deduction),
    epf: num(p.epf),
    socso: num(p.socso),
    eis: num(p.eis),
    pcb: num(p.pcb),
    withholding: num(p.withholding),
    skbbk: num(p.skbbk),
    payLineEarnings: num(p.payLineEarnings),
    payLineDeductions: num(p.payLineDeductions),
    gross: num(p.gross),
    net: num(p.net),
    attendance: p.attendance && typeof p.attendance === 'object' ? (p.attendance as Record<string, unknown>) : null,
  }))
