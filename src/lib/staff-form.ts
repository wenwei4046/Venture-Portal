// What the Add Staff form has to satisfy before anybody touches the database.
//
// Split out of the Server Action so it can be tested on its own, the way
// `invite.ts` is. Pure: it normalises as well as checks, so the action writes
// exactly what came back and nothing it re-derives itself.

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
