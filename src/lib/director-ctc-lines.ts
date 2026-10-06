// The itemised lines of a director CTC invoice (user 2026-10-06: "director 要
// bill back 的我要拆 detail 可以吗？"). HR keys each subsidiary's director CTC
// as basic, KPI, allowance and the employer EPF / SOCSO / EIS (director_ctc,
// summed per company by get_director_ctc_by_company); Create Invoice used to
// bill the total as one line. The lines read like the consolidated payroll
// invoice's, so a subsidiary sees the same shape for staff and directors.
import { periodShortLabel } from './staff-allocation'

export interface DirectorCtcComponents {
  basic: number
  kpi: number
  allowance: number
  epf: number
  socso: number
  eis: number
}

export interface DirectorCtcLine {
  description: string
  amount: number
  categoryCode: string
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

/** The component lines for `amount`, or null when `amount` is not the sum of
 *  the components to the sen — Finance changed the figure in the table, and a
 *  split HR did not give cannot be read off it, so that invoice stays one
 *  line. Zero components are left out, as on the payroll invoice. */
export function directorCtcInvoiceLines(
  c: DirectorCtcComponents,
  amount: number,
  period: string,
  categoryCode: string,
): DirectorCtcLine[] | null {
  const total = COMPONENTS.reduce((sum, [key]) => sum + cents(c[key]), 0)
  if (total !== cents(amount)) return null
  const periodShort = periodShortLabel(period)
  return COMPONENTS.filter(([key]) => cents(c[key]) > 0).map(([key, label]) => ({
    description: `${label} - ${periodShort}`,
    amount: c[key],
    categoryCode,
  }))
}
