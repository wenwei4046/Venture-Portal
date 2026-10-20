// What the Add Staff form has to satisfy before anybody touches the database.
//
// Split out of the Server Action so it can be tested on its own, the way
// `invite.ts` is. Pure: it normalises as well as checks, so the action writes
// exactly what came back and nothing it re-derives itself.
import { validateSecondaryStaffBankAccount } from './staff-bank-accounts'

/**
 * `hr_employment_type`. `variable` (2026-09-11) is the Director department's:
 * no fixed basic on the record, the month's figure is keyed each month.
 */
export type StaffEmploymentType = 'salaried' | 'commission_eligible' | 'variable'

export interface RawStaffForm {
  name?: string | null
  departmentId?: string | null
  titleId?: string | null
  /**
   * The "Full commission" tick. The form offers it only for a department
   * whose payroll comes from the commission engine (Revenue), where staff
   * have no basic and no statutory allowance — 100% of pay is commission.
   */
  fullCommission?: boolean
  /**
   * The "Variable pay" tick. Offered for the Director department only
   * (`offersVariablePay`): a director's pay is worked out every month by the
   * Director Salary engine and keyed in for that month, so the record carries
   * no basic and no allowance — the way a commission department's staff carry
   * none. Statutory categories still apply to whatever is keyed.
   */
  variablePay?: boolean
  /**
   * The sub-department a commission hire is BASED in (2026-09-20). Blank for a
   * department that has none, and blank means the department's default.
   */
  homeSubDepartmentId?: string | null
  /** Who they report to. Blank is allowed: a line can be drawn later on the chart. */
  reportsTo?: string | null
  basicSalary?: string | null
  allowances?: string | null
  nonStatutoryAllowance?: string | null
  bankName?: string | null
  bankAccountNo?: string | null
  bankName2?: string | null
  bankAccountNo2?: string | null
  contactNumber?: string | null
  email?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelationship?: string | null
}

export interface ValidStaffForm {
  name: string
  departmentId: string
  titleId: string | null
  homeSubDepartmentId: string | null
  reportsTo: string | null
  employmentType: StaffEmploymentType
  basicSalary: number
  allowances: number
  nonStatutoryAllowance: number
  bankName: string | null
  bankAccountNo: string | null
  bankName2: string | null
  bankAccountNo2: string | null
  contactNumber: string | null
  email: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Blank means 0: the form pre-fills the allowances with 0.00, and a field
 * somebody cleared means the same thing as one they left alone.
 */
function money(label: string, value: string | null | undefined): number {
  const text = (value ?? '').trim()
  if (text === '') return 0
  const n = Number(text)
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`)
  if (n < 0) throw new Error(`${label} cannot be negative`)
  return Math.round(n * 100) / 100
}

export function validateStaffForm(raw: RawStaffForm): ValidStaffForm {
  const name = clean(raw.name)
  if (!name) throw new Error('Name is required')

  const departmentId = clean(raw.departmentId)
  if (!departmentId) throw new Error('Pick a department')

  const fullCommission = raw.fullCommission === true
  // The form offers one tick or the other, never both; should both arrive,
  // full commission is the stronger claim (no statutory at all) and wins.
  const variablePay = !fullCommission && raw.variablePay === true

  // Either tick means exactly that: no basic and no allowance of either
  // kind, whatever the (disabled) fields still held when the form went in.
  // Full commission: the statutory base is basic + statutory allowance, so
  // with both at 0 EPF / SOCSO / EIS come out at 0 without any further flag.
  // Variable pay: the month's figure is keyed on that month's payroll row.
  const noFixedPay = fullCommission || variablePay
  const basicSalary = noFixedPay ? 0 : money('Basic salary', raw.basicSalary)
  const allowances = noFixedPay ? 0 : money('Statutory allowance', raw.allowances)
  const nonStatutoryAllowance = noFixedPay
    ? 0
    : money('Non-statutory allowance', raw.nonStatutoryAllowance)

  // An account number is digits; spaces and dashes are just how people type
  // them, and the bank transfer file wants neither.
  const accountDigits = (raw.bankAccountNo ?? '').replace(/[\s-]/g, '')
  const bankAccountNo = accountDigits === '' ? null : accountDigits

  return {
    name,
    departmentId,
    titleId: clean(raw.titleId),
    homeSubDepartmentId: clean(raw.homeSubDepartmentId),
    reportsTo: clean(raw.reportsTo),
    employmentType: fullCommission ? 'commission_eligible' : variablePay ? 'variable' : 'salaried',
    basicSalary,
    allowances,
    nonStatutoryAllowance,
    bankName: clean(raw.bankName),
    bankAccountNo,
    ...validateSecondaryStaffBankAccount(raw),
    contactNumber: clean(raw.contactNumber),
    email: clean(raw.email),
    emergencyContactName: clean(raw.emergencyContactName),
    emergencyContactPhone: clean(raw.emergencyContactPhone),
    emergencyContactRelationship: clean(raw.emergencyContactRelationship),
  }
}

/** A sub-department, as the Add Staff form offers it. */
export interface SubDepartmentOption {
  id: string
  name: string
  departmentId: string
  /** The department's default: where somebody lands who chooses nothing. */
  isHome: boolean
  /** The titles with a rung on this sub-department's ladder. */
  titleIds: string[]
}

/**
 * The sub-departments of one department, the default first.
 *
 * A department with none — Marketing, Finance — gets an empty list and the
 * form leaves the field blank: the question does not arise there.
 */
export function subDepartmentsForDepartment(
  subs: readonly SubDepartmentOption[],
  departmentId: string,
): SubDepartmentOption[] {
  if (!departmentId) return []
  return subs
    .filter(sub => sub.departmentId === departmentId)
    .sort((a, b) => Number(b.isHome) - Number(a.isHome) || a.name.localeCompare(b.name))
}

/**
 * Why a sub-department cannot be somebody's base, or null when it can.
 *
 * The base carries the COMPANY title, so that title needs a rung on that
 * ladder — the database says the same thing (23HOM) and the form would rather
 * not let anybody reach it. No title chosen yet: no rung to want.
 */
export function baseUnavailableReason(sub: SubDepartmentOption, titleId: string | null): string | null {
  if (!titleId) return null
  return sub.titleIds.includes(titleId) ? null : 'no rung for this title'
}

/** Somebody already on the roster, as the Add Staff form offers them as a manager. */
export interface ManagerOption {
  id: string
  name: string
  code: string | null
  departmentId: string | null
  departmentName: string | null
}

/**
 * Who a new hire may be filed as reporting to.
 *
 * Inside a commission department the reporting line IS the commission upline,
 * so it may not leave the department (23BND) — there the list is the
 * department's own people and nobody else. Everywhere else a line across
 * departments is ordinary, so everybody is on offer with their department
 * named. The database checks the ladder and the recruiting title again.
 */
export function managersForDepartment(
  people: readonly ManagerOption[],
  departmentId: string,
  commission: boolean,
): ManagerOption[] {
  if (!departmentId) return []
  const own = people.filter(person => person.departmentId === departmentId)
  if (commission) return own
  return [...own, ...people.filter(person => person.departmentId !== departmentId)]
}

export interface TitleOption {
  id: string
  name: string
  /** Null is a title any department may use. */
  department_id: string | null
}

/**
 * The titles a person in `departmentId` may hold: the department's own plus
 * any that belong to no department. Department is chosen before title on
 * purpose — a Marketing hire cannot be filed as an Accounts Executive.
 */
export function titlesForDepartment<T extends TitleOption>(titles: T[], departmentId: string): T[] {
  return titles.filter(t => !t.department_id || t.department_id === departmentId)
}

export interface TitleRow extends TitleOption {
  is_active: boolean
}

/**
 * A person's record as the edit fields start from it (a person's full page,
 * `team/people/[id]`). NRIC and the account numbers arrive as their reader
 * gave them — •••• for an editor whose title does not tick them — and the
 * pay figures as 0 to a reader who may not see salaries.
 */
export interface StaffRow {
  id: string
  employee_name: string
  /** What the apps call them (2026-10-17): filled from the full name's first word and the rest, HR's to change. */
  first_name?: string | null
  last_name?: string | null
  designation: string | null
  department_id: string
  department_name: string
  /** True in a department the commission engine pays (`payroll_source = 'commission'`). */
  commission_dept: boolean
  /** True in the Director department (`segment_key = 'director'`) — the one
   *  that offers "Variable pay" in place of the pay fields. */
  director_dept: boolean
  /** Authoritative since 2026-09-01; `designation` is the text it mirrors. */
  title_id: string | null
  basic_salary: number
  allowances: number
  non_statutory_allowance: number | null
  employee_code: string | null
  /** InfoTech's own employee number — what the imports match on (2026-09-12). */
  infotech_code?: string | null
  hire_date: string | null
  resignation_date: string | null
  epf_category: string
  socso_category: string
  is_epf_exempt: boolean
  pcb_category: string
  children_count: number
  employment_type: string
  bank_name: string | null
  bank_account_no: string | null
  bank_name_2?: string | null
  bank_account_no_2?: string | null
  nric: string | null
  contact_number: string | null
  email: string | null
  /** The one line the database puts together from the six parts below (2026-10-20), or an older record's own. */
  address: string | null
  address_line1?: string | null
  address_line2?: string | null
  address_postcode?: string | null
  address_city?: string | null
  address_state?: string | null
  address_country?: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
}

/**
 * The name `hr_staff_costs.designation` mirrors for a chosen title — or the
 * reason the choice cannot stand. `title_id` is authoritative since
 * 2026-09-01; the free-text column stays because the InfoTech import writes
 * it and the payroll export reads it, so the two must say the same thing.
 */
export function designationForTitle(title: TitleRow | null, departmentId: string): string {
  if (!title) throw new Error('That title no longer exists')
  if (!title.is_active) throw new Error(`${title.name} is no longer an active title`)
  if (title.department_id && title.department_id !== departmentId) {
    throw new Error(`${title.name} belongs to another department`)
  }
  return title.name
}

/**
 * Whether a person is paid 100% on commission: filed as commission-eligible
 * AND sitting in a department the commission engine pays. Outside such a
 * department `commission_eligible` keeps its older meaning — a basic plus
 * commission rules — and the pay fields stay on show.
 */
export function isFullyCommissionBased(row: {
  employment_type: string
  commission_dept: boolean
}): boolean {
  return row.commission_dept && row.employment_type === 'commission_eligible'
}

/**
 * The department whose people are paid by the Director Salary engine — the
 * one the Add / Edit forms offer "Variable pay" in. Matched on the segment
 * the department was provisioned with (`departments.segment_key`, mig
 * 20260824020000: the Director department is `director`), which survives a
 * rename where the name would not.
 */
export function offersVariablePay(
  dept: { segment_key?: string | null } | null | undefined,
): boolean {
  return dept?.segment_key === 'director'
}

/**
 * Paid a figure worked out every month rather than a fixed basic:
 * `employment_type = 'variable'` (2026-09-11, the Director department). No
 * department check, unlike `isFullyCommissionBased` — the value exists for
 * exactly this meaning and nothing else writes it.
 */
export function isVariablePay(row: { employment_type: string }): boolean {
  return row.employment_type === 'variable'
}

export const EPF_PARTS = ['A', 'C', 'E', 'F'] as const
export const SOCSO_CATEGORIES = ['first', 'second'] as const
export const PCB_CATEGORIES = ['KA1', 'KA2', 'KA3'] as const

export type EpfPart = (typeof EPF_PARTS)[number]
export type SocsoCategory = (typeof SOCSO_CATEGORIES)[number]
export type PcbCategory = (typeof PCB_CATEGORIES)[number]

/**
 * What a save of a person's record sends about their pay — only what changed
 * (2026-10-14). A field left out (`undefined`) is not touched, so the save
 * never writes back what somebody else changed after the page was opened.
 */
export interface RawPayPatch {
  /**
   * The pay basis, sent only when it changed: the old Edit form's ticks
   * (`full_commission`, `variable_pay`) or its select (`salaried`,
   * `commission_eligible`).
   */
  mode?: string | null
  /** Whether the record is on a fixed pay now (Salaried or Commission-eligible). */
  fixedPayNow: boolean
  basicSalary?: string
  allowances?: string
  nonStatutoryAllowance?: string
  epfCategory?: string
  socsoCategory?: string
  isEpfExempt?: boolean
  pcbCategory?: string
  childrenCount?: string
}

/** The pay and statutory columns, each written only when its field was sent. */
export interface PayColumns {
  employment_type: StaffEmploymentType
  basic_salary: number
  allowances: number
  non_statutory_allowance: number
  epf_category: EpfPart
  socso_category: SocsoCategory
  is_epf_exempt: boolean
  pcb_category: PcbCategory
  children_count: number
}

const PAY_MODES = ['full_commission', 'variable', 'salaried', 'commission_eligible'] as const

function oneOf<T extends string>(label: string, value: string | null | undefined, choices: readonly T[]): T {
  const v = (value ?? '').trim()
  if (v === '') throw new Error(`${label} is required`)
  if (!(choices as readonly string[]).includes(v)) throw new Error(`${label} is not a valid choice`)
  return v as T
}

/**
 * The pay and statutory columns a save writes: what was sent, checked rather
 * than cast — and nothing else.
 *
 * A new pay basis writes what it means. Fully commission based: the type and
 * the three amounts at 0, and nothing more — the statutory categories decide
 * nothing on a 0 base, so they stay as they were. Variable pay (the Director
 * department): the type and the three amounts at 0; the categories still
 * decide what the month's keyed figure attracts, so any sent are written.
 * Salaried / Commission-eligible: the type, then the amounts sent.
 *
 * Amounts sent with no new basis must land on a fixed pay: a record somebody
 * moved to commission or variable pay after the page was opened is refused
 * rather than given a basic it does not have.
 */
export function payPatchForUpdate(raw: RawPayPatch): Partial<PayColumns> {
  const mode = raw.mode == null || raw.mode.trim() === '' ? null : oneOf('Employment type', raw.mode, PAY_MODES)
  if (mode === 'full_commission') {
    return { employment_type: 'commission_eligible', basic_salary: 0, allowances: 0, non_statutory_allowance: 0 }
  }

  const out: Partial<PayColumns> = {}
  if (mode === 'variable') Object.assign(out, { employment_type: 'variable', basic_salary: 0, allowances: 0, non_statutory_allowance: 0 })
  else if (mode) out.employment_type = mode

  const fixedPay = mode ? mode === 'salaried' || mode === 'commission_eligible' : raw.fixedPayNow
  if ([raw.basicSalary, raw.allowances, raw.nonStatutoryAllowance].some(v => v !== undefined)) {
    if (!fixedPay) throw new Error('Their pay basis changed since this page was opened — reload it to see the record as it is now.')
    if (raw.basicSalary !== undefined) out.basic_salary = money('Basic salary', raw.basicSalary)
    if (raw.allowances !== undefined) out.allowances = money('Statutory allowance', raw.allowances)
    if (raw.nonStatutoryAllowance !== undefined) out.non_statutory_allowance = money('Non-statutory allowance', raw.nonStatutoryAllowance)
  }

  if (raw.epfCategory !== undefined) out.epf_category = oneOf('EPF category', raw.epfCategory, EPF_PARTS)
  if (raw.socsoCategory !== undefined) out.socso_category = oneOf('SOCSO category', raw.socsoCategory, SOCSO_CATEGORIES)
  if (raw.isEpfExempt !== undefined) out.is_epf_exempt = raw.isEpfExempt
  if (raw.pcbCategory !== undefined) out.pcb_category = oneOf('PCB category', raw.pcbCategory, PCB_CATEGORIES)
  if (raw.childrenCount !== undefined) {
    const text = raw.childrenCount.trim()
    const children = text === '' ? 0 : Number(text)
    if (!Number.isInteger(children) || children < 0) throw new Error('Children must be a whole number')
    out.children_count = children
  }
  return out
}
