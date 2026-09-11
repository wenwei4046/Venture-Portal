// What the Add Staff form has to satisfy before anybody touches the database.
//
// Split out of the Server Action so it can be tested on its own, the way
// `invite.ts` is. Pure: it normalises as well as checks, so the action writes
// exactly what came back and nothing it re-derives itself.
import { validateSecondaryStaffBankAccount } from './staff-bank-accounts'

export type StaffEmploymentType = 'salaried' | 'commission_eligible'

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
  basicSalary?: string | null
  allowances?: string | null
  nonStatutoryAllowance?: string | null
  bankName?: string | null
  bankAccountNo?: string | null
  bankName2?: string | null
  bankAccountNo2?: string | null
  contactNumber?: string | null
  email?: string | null
  address?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelationship?: string | null
}

export interface ValidStaffForm {
  name: string
  departmentId: string
  titleId: string | null
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
  address: string | null
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

  // Full commission means exactly that: no basic and no allowance of either
  // kind, whatever the (disabled) fields still held when the form went in.
  // The statutory base is basic + statutory allowance, so with both at 0
  // EPF / SOCSO / EIS come out at 0 without any further flag.
  const basicSalary = fullCommission ? 0 : money('Basic salary', raw.basicSalary)
  const allowances = fullCommission ? 0 : money('Statutory allowance', raw.allowances)
  const nonStatutoryAllowance = fullCommission
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
    employmentType: fullCommission ? 'commission_eligible' : 'salaried',
    basicSalary,
    allowances,
    nonStatutoryAllowance,
    bankName: clean(raw.bankName),
    bankAccountNo,
    ...validateSecondaryStaffBankAccount(raw),
    contactNumber: clean(raw.contactNumber),
    email: clean(raw.email),
    address: clean(raw.address),
    emergencyContactName: clean(raw.emergencyContactName),
    emergencyContactPhone: clean(raw.emergencyContactPhone),
    emergencyContactRelationship: clean(raw.emergencyContactRelationship),
  }
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

export const EPF_PARTS = ['A', 'C', 'E', 'F'] as const
export const SOCSO_CATEGORIES = ['first', 'second'] as const
export const PCB_CATEGORIES = ['KA1', 'KA2', 'KA3'] as const

export type EpfPart = (typeof EPF_PARTS)[number]
export type SocsoCategory = (typeof SOCSO_CATEGORIES)[number]
export type PcbCategory = (typeof PCB_CATEGORIES)[number]

export interface RawPayFields {
  /** The "Fully commission based" tick on the Edit form. */
  fullCommission: boolean
  employmentType?: string | null
  basicSalary?: string | null
  allowances?: string | null
  nonStatutoryAllowance?: string | null
  epfCategory?: string | null
  socsoCategory?: string | null
  isEpfExempt?: boolean
  pcbCategory?: string | null
  childrenCount?: string | null
}

export interface FullCommissionPay {
  employment_type: 'commission_eligible'
  basic_salary: 0
  allowances: 0
  non_statutory_allowance: 0
}

export interface SalariedPay {
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

function oneOf<T extends string>(label: string, value: string | null | undefined, choices: readonly T[]): T {
  const v = (value ?? '').trim()
  if (v === '') throw new Error(`${label} is required`)
  if (!(choices as readonly string[]).includes(v)) throw new Error(`${label} is not a valid choice`)
  return v as T
}

/**
 * The pay and statutory columns an Edit save writes.
 *
 * Fully commission based writes exactly the four columns that say so and
 * leaves the statutory categories as they were: with a 0 base they decide
 * nothing, and the fields were not on the form to be read. Otherwise every
 * field is on the form and every one is written, checked rather than cast.
 */
export function payFieldsForUpdate(raw: RawPayFields): FullCommissionPay | SalariedPay {
  if (raw.fullCommission) {
    return { employment_type: 'commission_eligible', basic_salary: 0, allowances: 0, non_statutory_allowance: 0 }
  }

  const childrenText = (raw.childrenCount ?? '').trim()
  const children = childrenText === '' ? 0 : Number(childrenText)
  if (!Number.isInteger(children) || children < 0) {
    throw new Error('Children must be a whole number')
  }

  return {
    // The Employment Type select is not on the form for a commission
    // department (the tick replaces it), so nothing read means salaried.
    employment_type: raw.employmentType === 'commission_eligible' ? 'commission_eligible' : 'salaried',
    basic_salary: money('Basic salary', raw.basicSalary),
    allowances: money('Statutory allowance', raw.allowances),
    non_statutory_allowance: money('Non-statutory allowance', raw.nonStatutoryAllowance),
    epf_category: oneOf('EPF category', raw.epfCategory, EPF_PARTS),
    socso_category: oneOf('SOCSO category', raw.socsoCategory, SOCSO_CATEGORIES),
    is_epf_exempt: raw.isEpfExempt === true,
    pcb_category: oneOf('PCB category', raw.pcbCategory, PCB_CATEGORIES),
    children_count: children,
  }
}
