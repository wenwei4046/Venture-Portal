// The itemised lines of a director CTC invoice (user 2026-10-06: "director 要
// bill back 的我要拆 detail 可以吗？"). HR keys each subsidiary's director CTC
// as basic, KPI, allowance and the employer EPF / SOCSO / EIS (director_ctc,
// summed per company by get_director_ctc_by_company); Create Invoice used to
// bill the total as one line. The lines read like the consolidated payroll
// invoice's, so a subsidiary sees the same shape for staff and directors.
// Since 2026-10-30 each line carries its kind, and Create invoice puts each
// kind on an account of its own (the user: "往后 director 的我也要 split category").
import { periodShortLabel } from './staff-allocation'

export interface DirectorCtcComponents {
  basic: number
  kpi: number
  allowance: number
  epf: number
  socso: number
  eis: number
}

export interface DirectorCtcPart {
  /** Salary, KPI, Allowance, EPF, SOCSO or EIS. */
  kind: string
  description: string
  amount: number
}

const COMPONENTS: Array<[keyof DirectorCtcComponents, string]> = [
  ['basic', 'Salary'],
  ['kpi', 'KPI'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]

const cents = (n: number) => Math.round(n * 100)

/** The component lines ("Salary - Sep'26"), zero components left out, as on
 *  the payroll invoice. An amount Finance changed is not their sum, and a
 *  split HR did not give cannot be read off it — the caller bills it as one
 *  line. */
export function directorCtcParts(c: DirectorCtcComponents, period: string): DirectorCtcPart[] {
  const periodShort = periodShortLabel(period)
  return COMPONENTS.filter(([key]) => cents(c[key]) > 0).map(([key, label]) => ({
    kind: label,
    description: `${label} - ${periodShort}`,
    amount: c[key],
  }))
}
