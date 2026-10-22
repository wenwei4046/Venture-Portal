import { computeRevenuePay, type TaxMode } from "@/lib/revenue-pay";

/**
 * What the member's month pays — HR's payroll for a Revenue row, worked out
 * live (2026-10-20, the user, of Today's "Fixed salary RM 7,000.00 +
 * commission RM 9,746.00": "the basic is deduct from the commission … you can
 * get it from hr code base"; then "basic is follow by the hr side settings …
 * if got any hr got change any amount in epf socso or pcb, all need include
 * with live the deduction").
 *
 * The fixed salary is paid OUT OF the commission, and so is the employer's
 * EPF / SOCSO / EIS on it; the member's own EPF / SOCSO / EIS and the PCB come
 * off the fixed salary — the net basic; what the commission leaves is the
 * balance commission. Net basic + balance commission is what reaches the bank
 * (HR's "Total to employee"). `computeRevenuePay` — the twin of
 * `compute_hr_monthly_payroll` for `source = 'commission'` — does the
 * arithmetic, as it does for HR's own pay board.
 *
 * The salary and the statutory figures are HR's: the month's payroll row as HR
 * keeps it — its basic, allowances, unpaid days, SKBBK and every EPF / SOCSO /
 * EIS / PCB figure on it, a figure HR typed over the schedule included (the
 * row holds the typed one until Reset to JADUAL) — and, before the row
 * exists, what the close will write into it: the People record's basic, no
 * allowance, and the schedules' figures on that basic.
 */

type Num = number | string | null | undefined;
const num = (value: Num): number => (value === null || value === undefined || value === "" ? 0 : Number(value));
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The month's salary and statutory figures, as payroll reads them. */
export interface PaySalary {
  basicSalary: number;
  statutoryAllowance: number;
  nonStatutoryAllowance: number;
  otAmount: number;
  /** The RM taken off for unpaid days. */
  deductionAmount: number;
  skbbkAmount: number;
  daysWorked: number;
  daysInMonth: number;
  epfEr: number;
  epfEe: number;
  socsoEr: number;
  socsoEe: number;
  eisEr: number;
  eisEe: number;
  pcb: number;
  /** HR's adjustment to the month's commission, on the payroll row. */
  commissionAdjustment: number;
}

/** The payroll row's own columns, as the database returns them. */
export interface PayrollRowFacts {
  basic_salary: Num;
  statutory_allowance: Num;
  non_statutory_allowance: Num;
  ot_amount: Num;
  deduction_amount: Num;
  skbbk_amount: Num;
  prorata_days_worked: Num;
  prorata_days_in_month: Num;
  epf_er: Num;
  epf_ee: Num;
  socso_er: Num;
  socso_ee: Num;
  eis_er: Num;
  eis_ee: Num;
  pcb: Num;
  commission_adjustment_amount: Num;
}

/**
 * The payroll row as HR keeps it. Its statutory figures are the ones payroll
 * will pay — what the schedules gave, or what HR typed over them — and they
 * stand for the live commission too: a Revenue row's EPF / SOCSO / EIS are on
 * the basic and its allowances, its PCB on the basic alone, and the row is
 * worked out again whenever HR changes any of them.
 */
export function salaryFromRow(row: PayrollRowFacts): PaySalary {
  return {
    basicSalary: num(row.basic_salary),
    statutoryAllowance: num(row.statutory_allowance),
    nonStatutoryAllowance: num(row.non_statutory_allowance),
    otAmount: num(row.ot_amount),
    deductionAmount: num(row.deduction_amount),
    skbbkAmount: num(row.skbbk_amount),
    daysWorked: num(row.prorata_days_worked),
    daysInMonth: num(row.prorata_days_in_month),
    epfEr: num(row.epf_er),
    epfEe: num(row.epf_ee),
    socsoEr: num(row.socso_er),
    socsoEe: num(row.socso_ee),
    eisEr: num(row.eis_er),
    eisEe: num(row.eis_ee),
    pcb: num(row.pcb),
    commissionAdjustment: num(row.commission_adjustment_amount),
  };
}

/**
 * Before the month has a payroll row: what the close will write into it — the
 * People record's basic, no allowance — with the schedules' figures on it
 * (`scheduleStatutory`) over the days the member is employed that month.
 */
export function salaryFromSchedule(
  basicSalary: number,
  window: { daysWorked: number; daysInMonth: number },
  statutory: { epfEr: number; epfEe: number; socsoEr: number; socsoEe: number; eisEr: number; eisEe: number; pcb: number },
): PaySalary {
  return {
    basicSalary, statutoryAllowance: 0, nonStatutoryAllowance: 0, otAmount: 0, deductionAmount: 0, skbbkAmount: 0,
    daysWorked: window.daysWorked, daysInMonth: window.daysInMonth, ...statutory, commissionAdjustment: 0,
  };
}

/** The payroll's tax mode, as the trigger reads `hr_staff_costs.tax_mode`: anything else is PCB. */
export function taxModeOf(value: string | null | undefined): TaxMode {
  return value === "withholding" || value === "none" ? value : "pcb";
}

export interface MemberPay {
  /** The month's commission as payroll holds it: this sub-department's, the member's other ones', HR's adjustment. */
  commission: number;
  /** The member's commission in their other sub-departments this month — payroll pays it in the same row. */
  elsewhere: number;
  /** Those sub-departments, by name. */
  elsewhereFrom: string[];
  /** HR's adjustment to the commission, on the payroll row. */
  adjustment: number;
  /** The fixed salary for the days employed. */
  fixed: number;
  /** Statutory and non-statutory allowance on the payroll row. */
  allowance: number;
  overtime: number;
  /** The RM taken off for unpaid days. */
  unpaid: number;
  /** The employer's EPF + SOCSO + EIS — funded from the commission. */
  employer: number;
  /** The member's own EPF + SOCSO + EIS. */
  employee: number;
  pcb: number;
  withholding: number;
  skbbk: number;
  /** The fixed salary less the member's EPF / SOCSO / EIS and PCB — the salary PV's basic. */
  netBasic: number;
  /** What the commission leaves once everything above is paid — the salary PV's second line. */
  balance: number;
  /** Net basic + balance commission: what reaches the bank. */
  net: number;
}

export interface MemberPayInput {
  /** This sub-department's commission for the month — live, or its close. */
  commission: number;
  /** The member's other sub-departments' commission for the month: a standing close's, else their engine's now. */
  elsewhere: number;
  elsewhereFrom?: readonly string[];
  /** The month's pay lines (Special claim / Allowance / Incentive add; Deduction takes off). */
  payLines: readonly { kind: string; amount: number }[];
  salary: PaySalary;
  taxMode: TaxMode;
  /** `hr_staff_costs.withholding_rate`; the trigger's 2% when none. */
  withholdingRate: number | null;
}

export function memberPay(input: MemberPayInput): MemberPay {
  const s = input.salary;
  const commission = round2(input.commission + input.elsewhere + s.commissionAdjustment);
  const earnings = input.payLines.filter(l => l.kind !== "deduction").reduce((a, l) => a + l.amount, 0);
  const deductions = input.payLines.filter(l => l.kind === "deduction").reduce((a, l) => a + Math.abs(l.amount), 0);
  const pay = computeRevenuePay({
    commission,
    basicSalary: s.basicSalary,
    statutoryAllowance: s.statutoryAllowance,
    nonStatutoryAllowance: s.nonStatutoryAllowance,
    otAmount: s.otAmount,
    deductionAmount: s.deductionAmount,
    skbbkAmount: s.skbbkAmount,
    daysWorked: s.daysWorked,
    daysInMonth: s.daysInMonth,
    epfEr: s.epfEr,
    epfEe: s.epfEe,
    socsoEr: s.socsoEr,
    socsoEe: s.socsoEe,
    eisEr: s.eisEr,
    eisEe: s.eisEe,
    pcb: s.pcb,
    taxMode: input.taxMode,
    withholdingRate: input.withholdingRate ?? 0.02,
    payLineEarnings: round2(earnings),
    payLineDeductions: round2(deductions),
  });
  return {
    commission,
    elsewhere: round2(input.elsewhere),
    elsewhereFrom: [...(input.elsewhereFrom ?? [])],
    adjustment: round2(s.commissionAdjustment),
    fixed: round2(s.basicSalary * pay.ratio),
    allowance: round2(pay.proratedStatutoryAllowance + s.nonStatutoryAllowance),
    overtime: pay.proratedOt,
    unpaid: round2(s.deductionAmount),
    employer: pay.employerContributions,
    employee: pay.employeeContributions,
    pcb: pay.pcb,
    withholding: pay.withholdingTax,
    skbbk: round2(s.skbbkAmount),
    netBasic: pay.basicPayNet,
    balance: pay.commissionBalance,
    net: pay.net,
  };
}
