import { addDays, dayMon, firstOfMonth, monthLabel, monthName } from '@/lib/attendance/engine'
import { fmtN, rm } from './format'
import type { MePayslip } from './types'

/**
 * Me › Payslip (2026-10-17, the handoff's `isPayA` list and its Payslip sheet): one's paid months, newest first, the
 * month still open, and each slip's lines — what the payroll row holds (`my_payslips()`), never a sum the phone makes
 * up. Pure.
 */

export interface SlipLine {
  label: string
  value: string
  kind: 'band' | 'line' | 'total' | 'net'
}

const money = (n: number) => rm(n)
const minus = (n: number) => `− ${rm(n)}`

/** The OT lines a close wrote on the row (`attendance_figures.lines`), as the slip names them. */
function otLines(p: MePayslip): Array<{ ref: string; hours: number; approved: number; multiplier: number; amount: number; paid: boolean; restDay: boolean }> {
  const lines = Array.isArray(p.attendance?.lines) ? (p.attendance.lines as Array<Record<string, unknown>>) : []
  return lines.map(l => ({
    ref: typeof l.ref === 'string' ? l.ref : '',
    // The hours paid — since 2026-10-17 the smaller of approved and punched — and the hours approved (a line closed
    // before then paid what was approved).
    hours: Number(l.hours) || 0,
    approved: l.approved == null ? Number(l.hours) || 0 : Number(l.approved) || 0,
    multiplier: Number(l.multiplier) || 0,
    amount: Number(l.amount) || 0,
    paid: l.paid !== false,
    restDay: l.dayType === 'rest',
  }))
}

/** "Overtime · 2 h × 1.5" — every hour at one rate; several rates, or a rest day's half / whole day, the hours alone. */
function otLabel(p: MePayslip): string {
  const paid = otLines(p).filter(l => l.paid)
  const rates = [...new Set(paid.map(l => l.multiplier))]
  const hours = paid.reduce((a, l) => a + l.hours, 0) || p.otHours
  if (rates.length === 1 && hours && !paid.some(l => l.restDay)) return `Overtime · ${fmtN(hours)} h × ${fmtN(rates[0])}`
  return hours ? `Overtime · ${fmtN(hours)} h` : 'Overtime'
}

/** EPF's share, named when it is the usual 11% of the wages it is taken on. */
function epfLabel(p: MePayslip): string {
  const wages = p.basic + p.statutoryAllowance
  return wages > 0 && Math.abs((p.epf / wages) * 100 - 11) < 0.6 ? 'EPF · 11%' : 'EPF'
}

/** The slip's table: Earnings, Gross, Deductions, Net pay — a line only where the row holds an amount. */
export function slipLines(p: MePayslip): SlipLine[] {
  const earn: SlipLine[] = [
    { label: 'Basic salary', value: money(p.basic), kind: 'line' },
    ...(p.statutoryAllowance ? [{ label: 'Fixed allowance', value: money(p.statutoryAllowance), kind: 'line' as const }] : []),
    ...(p.nonStatutoryAllowance ? [{ label: 'Allowance', value: money(p.nonStatutoryAllowance), kind: 'line' as const }] : []),
    ...(p.otAmount ? [{ label: otLabel(p), value: money(p.otAmount), kind: 'line' as const }] : []),
    ...(p.commission ? [{ label: 'Commission', value: money(p.commission), kind: 'line' as const }] : []),
    ...(p.payLineEarnings ? [{ label: 'Other earnings', value: money(p.payLineEarnings), kind: 'line' as const }] : []),
    // Taken off before the gross, as the HR payslip lists it (hr-costing › payslip).
    ...(p.deduction ? [{ label: 'Deduction', value: minus(p.deduction), kind: 'line' as const }] : []),
  ]
  const ded: SlipLine[] = [
    ...(p.epf ? [{ label: epfLabel(p), value: minus(p.epf), kind: 'line' as const }] : []),
    ...(p.socso ? [{ label: 'SOCSO', value: minus(p.socso), kind: 'line' as const }] : []),
    ...(p.eis ? [{ label: 'EIS', value: minus(p.eis), kind: 'line' as const }] : []),
    ...(p.pcb ? [{ label: 'PCB · income tax', value: minus(p.pcb), kind: 'line' as const }] : []),
    ...(p.withholding ? [{ label: 'Withholding tax', value: minus(p.withholding), kind: 'line' as const }] : []),
    ...(p.skbbk ? [{ label: 'SKBBK', value: minus(p.skbbk), kind: 'line' as const }] : []),
    ...(p.payLineDeductions ? [{ label: 'Other deductions', value: minus(p.payLineDeductions), kind: 'line' as const }] : []),
  ]
  return [
    { label: 'Earnings', value: '', kind: 'band' },
    ...earn,
    { label: 'Gross', value: money(p.gross), kind: 'total' },
    { label: 'Deductions', value: '', kind: 'band' },
    ...ded,
    { label: 'Net pay', value: money(p.net), kind: 'net' },
  ]
}

/** The note under the table: where the OT and unpaid days came from, and when attendance closed. */
export function slipNote(p: MePayslip): string {
  const paid = otLines(p).filter(l => l.paid && l.approved > 0)
  const refs = [...new Set(paid.map(l => l.ref).filter(Boolean))]
  const hours = paid.reduce((a, l) => a + l.hours, 0)
  const approved = paid.reduce((a, l) => a + l.approved, 0)
  const unpaid = Number(p.unpaidLeaveDays) || 0
  const closedAt = typeof p.attendance?.closedAt === 'string' ? p.attendance.closedAt.slice(0, 10) : null
  const parts: string[] = []
  // The punches held it lower: the hours paid, of those approved.
  if (refs.length) parts.push(`OT from ${refs.join(', ')} · ${hours === approved ? `${fmtN(hours)} h approved` : `${fmtN(hours)} h paid of ${fmtN(approved)} h approved`}`)
  if (unpaid) parts.push(`${fmtN(unpaid)} unpaid day${unpaid === 1 ? '' : 's'}`)
  if (!parts.length) return 'No OT or unpaid leave this month.'
  return `${parts.join(' · ')}.${closedAt ? ` Attendance closed ${dayMon(closedAt)}.` : ''}`
}

/** "Paid 30 Sep · Maybank ···3376". */
export function slipSub(p: MePayslip): string {
  const bank = [p.bank, p.accountLast4 ? `···${p.accountLast4}` : null].filter(Boolean).join(' ')
  return [p.paidOn ? `Paid ${dayMon(p.paidOn)}` : 'Paid', bank].filter(Boolean).join(' · ')
}

/** "September 2026". */
export const slipTitle = (p: MePayslip) => monthLabel(p.month)

/** "Payslip_September_2026.pdf". */
export const slipFile = (p: MePayslip) => `Payslip_${monthLabel(p.month).replace(' ', '_')}.pdf`

/** The list's years, newest first, each with its months. */
export function slipYears(list: readonly MePayslip[]): Array<{ year: string; slips: MePayslip[] }> {
  const out: Array<{ year: string; slips: MePayslip[] }> = []
  for (const p of [...list].sort((a, b) => b.month.localeCompare(a.month))) {
    const year = p.month.slice(0, 4)
    let g = out.find(x => x.year === year)
    if (!g) out.push((g = { year, slips: [] }))
    g.slips.push(p)
  }
  return out
}

/** The month still open: this month, until its payslip is paid — "October · Open · made after 3 Nov". */
export function openMonth(list: readonly MePayslip[], workDay: string): { name: string; line: string } | null {
  const month = firstOfMonth(workDay)
  if (list.some(p => p.month === month)) return null
  const after = addDays(firstOfMonth(addDays(month, 40)), 2)
  return { name: monthName(month), line: `Open · made after ${dayMon(after)}` }
}
