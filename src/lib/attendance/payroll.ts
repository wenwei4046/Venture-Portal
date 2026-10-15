import { indexMonth, monthGrid, policyOn, toMin, type Ctx, type DayInfo, type OtHours } from './engine'
import { otRates } from './settings'
import type { AttRequest, AttSchedule } from './types'
import { seedPayrollRows, type PayrollSeedRow, type PayrollSeedStaff } from '@/lib/payroll-period'

/**
 * Month close → the month's payroll (2026-10-15 — the user, asked whether a
 * close should write OT and unpaid days into payroll: "要，自动写进去", and
 * "will no longer use infotech": the portal works HQ's pay out itself). What a
 * closed month sends to each person's payroll row: their approved overtime,
 * priced at its day's rate, and the days they are not paid. Pure — the close's
 * action reads the facts and the rows, `lib/attendance/payroll-write.ts`
 * writes what this works out.
 *
 * - ORP = the base ÷ 26 and HRP = ORP ÷ a full day's normal hours (Settings ›
 *   OT rules' own `otRates`); the base is what the policy in force that day
 *   names — basic, or basic + the row's fixed (statutory) allowance.
 * - A full day's hours: the person's schedule's longest work day, 8 without
 *   one (the user: "时薪的小时数用那个人班表的一天工时，没有班表就用 8 小时").
 * - A line = its hours × HRP × its day type's multiplier, to the sen; HRP is
 *   kept to 4 decimals, so a line can be worked again from what is stored.
 * - Unpaid days: days on an unpaid leave type, and absent / incomplete days
 *   Month close decided Unpaid. The payroll's own trigger takes them off the
 *   basic (× the days left ÷ the month's days) and works out the rest.
 * - Who clocks › OT: none keeps the hours on the line, unpaid.
 * - HQ only (the user: "先只做 HQ"): a Revenue team row is Comm Cal's; a
 *   director's pay is Director Salary's. A row already Completed, with Finance
 *   or paid is left and named (the user: "跳过，列出来").
 */

export type OtDayType = 'work' | 'off' | 'rest' | 'ph'
const OT_DAY_TYPES: ReadonlySet<string> = new Set<OtDayType>(['work', 'off', 'rest', 'ph'])

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

/** A full day's normal hours: the schedule's longest work day (a half Saturday does not double the hourly rate); 8 without one. */
export function hoursADay(schedule: AttSchedule | null | undefined): number {
  let most = 0
  for (const d of schedule?.days ?? []) {
    if (d.type !== 'work' || !d.start || !d.end) continue
    most = Math.max(most, (toMin(d.end) - toMin(d.start) - (d.break ?? 0)) / 60)
  }
  return most > 0 ? most : 8
}

/** The rate an OT line is paid at: the day type on the request (HR picks it), else what the day is. */
export function otDayType(r: Pick<AttRequest, 'detail'>, info: Pick<DayInfo, 'code' | 'sday'>): OtDayType {
  const picked = typeof r.detail?.dayType === 'string' ? r.detail.dayType : ''
  if (OT_DAY_TYPES.has(picked)) return picked as OtDayType
  if (info.code === 'H') return 'ph'
  if (info.code === 'CH' || info.code === 'SO') return 'off'
  if (info.sday?.type === 'rest') return 'rest'
  if (info.sday?.type === 'off') return 'off'
  return 'work'
}

/** One approved OT request, before it is priced. */
export interface OtFact {
  ref: string
  day: string
  hours: number
  dayType: OtDayType
  multiplier: number
  hoursADay: number
  base: 'basic' | 'fixed'
  /** Who clocks › OT on that day is not "none". */
  paid: boolean
}

/** A person of a closed month, as payroll will hear it. */
export interface AttendanceFact {
  staffId: string
  name: string
  ot: OtFact[]
  unpaidDates: string[]
}

/** Each counted person's approved OT requests of the month, oldest first, each with what its day is. */
function approvedOt(ctx: Ctx, requests: readonly AttRequest[]) {
  const g = monthGrid(ctx)
  const first = g.days[0]
  const last = g.days[g.days.length - 1]
  const mine = new Map<string, AttRequest[]>()
  for (const r of requests) {
    if (r.kind !== 'ot' || r.status !== 'approved' || !r.from || r.from < first || r.from > last || !((r.hours ?? 0) > 0)) continue
    mine.set(r.staffId, [...(mine.get(r.staffId) ?? []), r])
  }
  const sorted = (rs: AttRequest[]) => [...rs].sort((a, b) => (a.from === b.from ? a.ref.localeCompare(b.ref) : (a.from as string) < (b.from as string) ? -1 : 1))
  return {
    g,
    rows: g.rows.map(row => ({
      ...row,
      ot: sorted(mine.get(row.person.id) ?? []).map(r => ({ r, day: r.from as string, info: row.cells[g.days.indexOf(r.from as string)] })),
    })),
  }
}

/** The register's overtime columns: approved hours on work and off days, on rest days, on public holidays. */
export function otHoursOf(ctx: Ctx, requests: readonly AttRequest[]): Map<string, OtHours> {
  const out = new Map<string, OtHours>()
  for (const { person, ot } of approvedOt(ctx, requests).rows) {
    const h: OtHours = { ot: 0, rest: 0, ph: 0 }
    for (const { r, info } of ot) {
      const t = otDayType(r, info)
      const k = t === 'rest' ? 'rest' : t === 'ph' ? 'ph' : 'ot'
      h[k] = round2(h[k] + Number(r.hours))
    }
    out.set(person.id, h)
  }
  return out
}

/** The month's facts for every person it counts (the register's people). Throws when an OT day type has no rate. */
export function attendanceFacts(ctx: Ctx, requests: readonly AttRequest[]): AttendanceFact[] {
  const idx = indexMonth(ctx.month)
  const { g, rows } = approvedOt(ctx, requests)
  const unpaidCodes = new Set(ctx.config.leaveTypes.filter(t => t.unpaid).map(t => t.code))
  const multiplierOf = new Map(ctx.config.otRates.map(r => [r.dayType, r.multiplier]))
  return rows.map(({ person, cells, ot }) => {
    const unpaidDates = g.days.filter((day, i) => {
      const code = cells[i].code
      if (unpaidCodes.has(code)) return true
      return (code === 'A' || code === 'I') && idx.decisions.get(idx.key(person.id, day))?.decision === 'Unpaid'
    })
    return {
      staffId: person.id,
      name: person.name,
      unpaidDates,
      ot: ot.map(({ r, day, info }): OtFact => {
        const dayType = otDayType(r, info)
        const multiplier = multiplierOf.get(dayType)
        if (multiplier == null) throw new Error(`Settings › OT rules has no rate for ${dayType} days.`)
        return {
          ref: r.ref,
          day,
          hours: Number(r.hours),
          dayType,
          multiplier,
          hoursADay: hoursADay(info.schedule),
          base: policyOn(day, ctx.config.policies)?.otBase ?? 'basic',
          paid: info.assignment?.ot !== 'none',
        }
      }),
    }
  })
}

/** What one row's pay is worked out from: its basic and its fixed (statutory) allowance. */
export interface PaySalary {
  basic: number
  statutoryAllowance: number
}

export interface OtLine extends OtFact {
  orp: number
  hrp: number
  amount: number
}

/** What a close writes on a payroll row (`hr_monthly_payroll.attendance_figures`, beside its three columns). */
export interface AttendancePay {
  month: string
  /** The close it came from (`att_months.closed_at`) — a later close makes it stale. */
  closedAt: string
  otHours: number
  otAmount: number
  unpaidDays: number
  unpaidDates: string[]
  lines: OtLine[]
}

/** A person's facts, priced on a row's salary. */
export function priceFact(month: string, closedAt: string, fact: AttendanceFact, salary: PaySalary): AttendancePay {
  const lines = fact.ot.map((o): OtLine => {
    const base = salary.basic + (o.base === 'fixed' ? salary.statutoryAllowance : 0)
    const { orp, hrp } = otRates(base, o.hoursADay)
    const hrp4 = round4(hrp)
    return { ...o, orp: round4(orp), hrp: hrp4, amount: o.paid ? round2(o.hours * hrp4 * o.multiplier) : 0 }
  })
  const paid = lines.filter(l => l.paid)
  return {
    month,
    closedAt,
    otHours: round2(paid.reduce((a, l) => a + l.hours, 0)),
    otAmount: round2(paid.reduce((a, l) => a + l.amount, 0)),
    unpaidDays: fact.unpaidDates.length,
    unpaidDates: fact.unpaidDates,
    lines,
  }
}

// ── Which rows take it ──────────────────────────────────────────────────────

export type PayrollStatus = 'draft' | 'completed' | 'submitted' | 'paid'

/** The month's payroll row of a person, as the close reads it. */
export interface PayrollRowLite {
  id: string
  staffId: string
  status: PayrollStatus
  source: string
  basic: number
  statutoryAllowance: number
  attendance: AttendancePay | null
}

/** The staff record, for a row that does not exist yet (what Create period would seed). */
export interface StaffLite extends PayrollSeedStaff {
  active: boolean
}

/** Why a person's payroll did not take the close. */
export type SkipReason = 'completed' | 'submitted' | 'paid' | 'no_row' | 'changed' | 'failed'

export type PayrollStep =
  | { kind: 'update'; staffId: string; name: string; rowId: string; pay: AttendancePay }
  | { kind: 'create'; staffId: string; name: string; seed: PayrollSeedRow; pay: AttendancePay }
  | { kind: 'skip'; staffId: string; name: string; reason: SkipReason }

/** Not HQ's payroll: the Revenue team's row is Comm Cal's, a director's pay Director Salary's. */
export function outsideHq(row: Pick<PayrollRowLite, 'source'> | undefined, staff: Pick<StaffLite, 'payroll_source' | 'employment_type'> | undefined): boolean {
  return row?.source === 'commission' || staff?.payroll_source === 'commission' || (!row && staff?.employment_type === 'variable')
}

/**
 * Each HQ person of the close → update their draft row, create the row Create
 * period would (an active staff record, while the account may create rows),
 * or leave it with its reason. People outside HQ are not steps at all.
 */
export function planPayroll(
  month: string,
  closedAt: string,
  facts: readonly AttendanceFact[],
  rows: ReadonlyMap<string, PayrollRowLite>,
  staff: ReadonlyMap<string, StaffLite>,
  opts: { mayCreate: boolean },
): PayrollStep[] {
  const steps: PayrollStep[] = []
  for (const f of facts) {
    const row = rows.get(f.staffId)
    const rec = staff.get(f.staffId)
    if (outsideHq(row, rec)) continue
    const who = { staffId: f.staffId, name: f.name }
    if (row) {
      if (row.status !== 'draft') steps.push({ kind: 'skip', ...who, reason: row.status })
      else steps.push({ kind: 'update', ...who, rowId: row.id, pay: priceFact(month, closedAt, f, row) })
      continue
    }
    const seed = rec?.active && opts.mayCreate ? seedPayrollRows([rec], month)[0] : undefined
    if (!seed) {
      steps.push({ kind: 'skip', ...who, reason: 'no_row' })
      continue
    }
    steps.push({ kind: 'create', ...who, seed, pay: priceFact(month, closedAt, f, { basic: seed.basic_salary, statutoryAllowance: 0 }) })
  }
  return steps
}

/** The three payroll columns and the figures they came from. */
export function payrollFields(pay: AttendancePay) {
  return { ot_hours: pay.otHours, ot_amount: pay.otAmount, unpaid_leave_days: pay.unpaidDays, attendance_figures: pay }
}

// ── Where each person's payroll stands after a close ────────────────────────

export type PayrollMark = 'in' | SkipReason | 'not_sent'

/**
 * Each HQ person of the month, as payroll holds them now: `in` when their row
 * carries THIS close's figures; else why not — the row's state, no row, or
 * `not_sent` (a draft the close did not reach: another account closed it, or it
 * was written before the month was reopened and closed again).
 */
export function payrollMarks(
  closedAt: string,
  people: ReadonlyArray<{ staffId: string; name: string }>,
  rows: ReadonlyMap<string, Pick<PayrollRowLite, 'status' | 'source' | 'attendance'>>,
  staff: ReadonlyMap<string, Pick<StaffLite, 'payroll_source' | 'employment_type'>>,
): Array<{ staffId: string; name: string; mark: PayrollMark }> {
  const out: Array<{ staffId: string; name: string; mark: PayrollMark }> = []
  for (const p of people) {
    const row = rows.get(p.staffId)
    if (outsideHq(row, staff.get(p.staffId))) continue
    const mark: PayrollMark = !row ? 'no_row'
      : row.attendance?.closedAt === closedAt ? 'in'
        : row.status !== 'draft' ? row.status
          : 'not_sent'
    out.push({ ...p, mark })
  }
  return out
}

/** A mark as the page says it (2–4 words). */
export const MARK_WORDS: Readonly<Record<Exclude<PayrollMark, 'in'>, string>> = {
  completed: 'Completed — unlock it',
  submitted: 'With Finance — resubmit',
  paid: 'Paid — resubmit',
  no_row: 'No payroll row',
  changed: 'Payroll changed — close again',
  failed: 'Not saved',
  not_sent: 'Not sent',
}
