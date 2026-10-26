import { describe, it, expect } from 'vitest'
import {
  baseUnavailableReason,
  designationForTitle,
  isFullyCommissionBased,
  isVariablePay,
  managersForDepartment,
  offersVariablePay,
  payPatchForUpdate,
  subDepartmentsForDepartment,
  titlesForDepartment,
  type RawStaffForm,
  validateStaffForm,
} from './staff-form'

const ok: RawStaffForm = {
  name: '  Lim Mei Ling ',
  departmentId: 'dept-marketing',
  titleId: 'title-1',
  hireDate: '2026-11-02',
  employmentStatus: 'probation',
  probationMonths: '3',
  fullCommission: false,
  basicSalary: '3500',
  allowances: '200.5',
  nonStatutoryAllowance: '0.00',
  bankName: ' Maybank ',
  bankAccountNo: '1234 5678 90',
  contactNumber: '012-345 6789',
  email: 'mei@example.com',
  emergencyContactName: 'Lim Ah Kow',
  emergencyContactPhone: '019-000 0000',
  emergencyContactRelationship: 'Parent',
}

describe('validateStaffForm', () => {
  it('normalises a good salaried form', () => {
    expect(validateStaffForm(ok)).toEqual({
      name: 'Lim Mei Ling',
      departmentId: 'dept-marketing',
      titleId: 'title-1',
      employmentType: 'salaried',
      homeSubDepartmentId: null,
      reportsTo: null,
      hireDate: '2026-11-02',
      employmentStatus: 'probation',
      probationMonths: 3,
      contractMonths: null,
      basicSalary: 3500,
      allowances: 200.5,
      nonStatutoryAllowance: 0,
      bankName: 'Maybank',
      bankAccountNo: '1234567890',
      bankName2: null,
      bankAccountNo2: null,
      contactNumber: '012-345 6789',
      email: 'mei@example.com',
      emergencyContactName: 'Lim Ah Kow',
      emergencyContactPhone: '019-000 0000',
      emergencyContactRelationship: 'Parent',
    })
  })

  it('turns blank optional fields into null, not empty strings', () => {
    const out = validateStaffForm({
      ...ok,
      titleId: '  ',
      bankName: '',
      bankAccountNo: null,
      contactNumber: undefined,
      email: ' ',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
    })
    expect(out.titleId).toBeNull()
    expect(out.bankName).toBeNull()
    expect(out.bankAccountNo).toBeNull()
    expect(out.contactNumber).toBeNull()
    expect(out.email).toBeNull()
    expect(out.emergencyContactName).toBeNull()
    expect(out.emergencyContactPhone).toBeNull()
    expect(out.emergencyContactRelationship).toBeNull()
  })

  it('reads a blank money field as 0 and rounds to cents', () => {
    const out = validateStaffForm({
      ...ok,
      basicSalary: '',
      allowances: '  ',
      nonStatutoryAllowance: '10.005',
    })
    expect(out.basicSalary).toBe(0)
    expect(out.allowances).toBe(0)
    expect(out.nonStatutoryAllowance).toBe(10.01)
  })

  it('refuses a negative or non-numeric amount by field name', () => {
    expect(() => validateStaffForm({ ...ok, basicSalary: '-1' })).toThrow(
      /Basic salary cannot be negative/,
    )
    expect(() => validateStaffForm({ ...ok, allowances: 'abc' })).toThrow(
      /Statutory allowance must be a number/,
    )
    expect(() => validateStaffForm({ ...ok, nonStatutoryAllowance: '-0.01' })).toThrow(
      /Non-statutory allowance cannot be negative/,
    )
  })

  it('full commission zeroes every pay field and marks them commission-eligible', () => {
    // The disabled fields may still carry whatever was typed before the tick;
    // the tick wins, and a stale negative in one of them is not an error.
    const out = validateStaffForm({
      ...ok,
      fullCommission: true,
      basicSalary: '5000',
      allowances: '300',
      nonStatutoryAllowance: '-7',
    })
    expect(out.employmentType).toBe('commission_eligible')
    expect(out.basicSalary).toBe(0)
    expect(out.allowances).toBe(0)
    expect(out.nonStatutoryAllowance).toBe(0)
  })

  it('is salaried unless the tick is exactly true', () => {
    expect(validateStaffForm({ ...ok, fullCommission: undefined }).employmentType).toBe('salaried')
    expect(validateStaffForm({ ...ok, fullCommission: false }).employmentType).toBe('salaried')
  })

  it('variable pay zeroes every pay field and files them as variable', () => {
    // A director: the month's figure is keyed on payroll, so whatever the
    // (disabled) fields still held is discarded, not checked.
    const out = validateStaffForm({
      ...ok,
      departmentId: 'dept-director',
      variablePay: true,
      basicSalary: '14400',
      allowances: '300',
      nonStatutoryAllowance: '-7',
    })
    expect(out.employmentType).toBe('variable')
    expect(out.basicSalary).toBe(0)
    expect(out.allowances).toBe(0)
    expect(out.nonStatutoryAllowance).toBe(0)
  })

  it('full commission outranks variable pay should both ticks arrive', () => {
    expect(
      validateStaffForm({ ...ok, fullCommission: true, variablePay: true }).employmentType,
    ).toBe('commission_eligible')
  })

  it('keeps only the digits of an account number', () => {
    expect(validateStaffForm({ ...ok, bankAccountNo: ' 1234-5678-90 ' }).bankAccountNo).toBe(
      '1234567890',
    )
    expect(validateStaffForm({ ...ok, bankAccountNo: ' - ' }).bankAccountNo).toBeNull()
  })

  it('demands a name and a department', () => {
    expect(() => validateStaffForm({ ...ok, name: '   ' })).toThrow(/Name is required/)
    expect(() => validateStaffForm({ ...ok, departmentId: '' })).toThrow(/Pick a department/)
  })

  // 2026-10-23 — the user: "when people add in, will need to fill up one more, is status … then is select probation,
  // needs to select with probation period".
  it('demands the hire date and the employment status — and a probation’s period', () => {
    expect(() => validateStaffForm({ ...ok, hireDate: '' })).toThrow(/Pick the hire date/)
    expect(() => validateStaffForm({ ...ok, hireDate: '2026-02-30' })).toThrow(/Pick the hire date/)
    expect(() => validateStaffForm({ ...ok, employmentStatus: '' })).toThrow(/Pick the employment status/)
    expect(() => validateStaffForm({ ...ok, probationMonths: '' })).toThrow(/Pick the probation period/)
  })

  it('a permanent or part-time hire carries no period, whatever the hidden field held', () => {
    expect(validateStaffForm({ ...ok, employmentStatus: 'permanent', probationMonths: '3', contractMonths: '12' })).toMatchObject({ employmentStatus: 'permanent', probationMonths: null, contractMonths: null })
    expect(validateStaffForm({ ...ok, employmentStatus: 'part_time', probationMonths: null })).toMatchObject({ employmentStatus: 'part_time', probationMonths: null, contractMonths: null })
  })

  // Contract (2026-10-24 — the user: "can add with one is Contract, then need pick time period as well").
  it('a contract hire carries its period, never a probation’s — and is refused without one', () => {
    expect(validateStaffForm({ ...ok, employmentStatus: 'contract', probationMonths: '3', contractMonths: '18' })).toMatchObject({ employmentStatus: 'contract', probationMonths: null, contractMonths: 18 })
    expect(() => validateStaffForm({ ...ok, employmentStatus: 'contract', contractMonths: '' })).toThrow(/Pick the contract period/)
  })
})

describe('titlesForDepartment', () => {
  const titles = [
    { id: 'a', name: 'Team Leader', department_id: 'dept-revenue' },
    { id: 'b', name: 'HR Executive', department_id: 'dept-hr' },
    { id: 'c', name: 'Intern', department_id: null },
  ]

  it("offers the department's own titles plus the department-less ones", () => {
    expect(titlesForDepartment(titles, 'dept-revenue').map(t => t.id)).toEqual(['a', 'c'])
  })

  it('offers only the department-less ones before a department is picked', () => {
    expect(titlesForDepartment(titles, '').map(t => t.id)).toEqual(['c'])
  })
})

describe('designationForTitle', () => {
  const title = { id: 'a', name: 'Team Leader', department_id: 'dept-revenue', is_active: true }

  it('mirrors the title name', () => {
    expect(designationForTitle(title, 'dept-revenue')).toBe('Team Leader')
  })

  it('accepts a title that belongs to no department', () => {
    expect(designationForTitle({ ...title, department_id: null }, 'dept-hr')).toBe('Team Leader')
  })

  it('refuses a title that is gone, retired, or from another department', () => {
    expect(() => designationForTitle(null, 'dept-revenue')).toThrow(/no longer exists/)
    expect(() => designationForTitle({ ...title, is_active: false }, 'dept-revenue')).toThrow(
      /no longer an active title/,
    )
    expect(() => designationForTitle(title, 'dept-hr')).toThrow(/belongs to another department/)
  })
})

describe('isFullyCommissionBased', () => {
  it('needs both the flag and a commission department', () => {
    expect(
      isFullyCommissionBased({ employment_type: 'commission_eligible', commission_dept: true }),
    ).toBe(true)
    // Outside a commission department the flag still means basic + commission.
    expect(
      isFullyCommissionBased({ employment_type: 'commission_eligible', commission_dept: false }),
    ).toBe(false)
    expect(isFullyCommissionBased({ employment_type: 'salaried', commission_dept: true })).toBe(false)
  })
})

describe('offersVariablePay', () => {
  it('is the Director department, by segment, and nobody else', () => {
    expect(offersVariablePay({ segment_key: 'director' })).toBe(true)
    expect(offersVariablePay({ segment_key: 'director_office' })).toBe(false)
    expect(offersVariablePay({ segment_key: 'revenue_department' })).toBe(false)
    expect(offersVariablePay({ segment_key: null })).toBe(false)
    expect(offersVariablePay(null)).toBe(false)
  })
})

describe('isVariablePay', () => {
  it('reads the employment type alone', () => {
    expect(isVariablePay({ employment_type: 'variable' })).toBe(true)
    expect(isVariablePay({ employment_type: 'salaried' })).toBe(false)
    expect(isVariablePay({ employment_type: 'commission_eligible' })).toBe(false)
  })
})

/**
 * A person's record saves only what changed (2026-10-14): a field not sent is
 * not written, so a save never puts back what somebody else changed after
 * the page was opened.
 */
describe('payPatchForUpdate', () => {
  it('writes nothing when nothing was sent', () => {
    expect(payPatchForUpdate({ fixedPayNow: true })).toEqual({})
  })

  it('writes one amount sent, alone', () => {
    expect(payPatchForUpdate({ fixedPayNow: true, allowances: '200' })).toEqual({ allowances: 200 })
  })

  it('fully commission based writes the four pay columns and nothing else', () => {
    // The statutory categories decide nothing on a 0 base: whatever the row holds stays.
    expect(payPatchForUpdate({ mode: 'full_commission', fixedPayNow: true, basicSalary: '3500', epfCategory: 'A' })).toEqual({
      employment_type: 'commission_eligible',
      basic_salary: 0,
      allowances: 0,
      non_statutory_allowance: 0,
    })
  })

  it('variable pay writes zero pay and the categories sent with it', () => {
    // The month's keyed figure still attracts statutory, so a category sent is written.
    expect(payPatchForUpdate({ mode: 'variable', fixedPayNow: true, epfCategory: 'A', childrenCount: '2' })).toEqual({
      employment_type: 'variable',
      basic_salary: 0,
      allowances: 0,
      non_statutory_allowance: 0,
      epf_category: 'A',
      children_count: 2,
    })
  })

  it('a fixed pay writes its type and the amounts sent — from commission too', () => {
    expect(payPatchForUpdate({ mode: 'salaried', fixedPayNow: false, basicSalary: '3500' })).toEqual({
      employment_type: 'salaried',
      basic_salary: 3500,
    })
    expect(payPatchForUpdate({ mode: 'commission_eligible', fixedPayNow: true })).toEqual({ employment_type: 'commission_eligible' })
  })

  it('refuses an amount for a record moved off a fixed pay since the page was opened', () => {
    expect(() => payPatchForUpdate({ fixedPayNow: false, basicSalary: '3500' })).toThrow(/pay basis changed since this page was opened/)
    expect(() => payPatchForUpdate({ mode: 'variable', fixedPayNow: true, allowances: '10' })).toThrow(/pay basis changed/)
  })

  it('checks the categories and the basis instead of casting them', () => {
    expect(() => payPatchForUpdate({ fixedPayNow: true, epfCategory: 'Z' })).toThrow(/EPF category is not a valid choice/)
    expect(() => payPatchForUpdate({ fixedPayNow: true, socsoCategory: '' })).toThrow(/SOCSO category is required/)
    expect(() => payPatchForUpdate({ fixedPayNow: true, pcbCategory: '' })).toThrow(/PCB category is required/)
    expect(() => payPatchForUpdate({ mode: 'bogus', fixedPayNow: true })).toThrow(/Employment type is not a valid choice/)
  })

  it('writes the EPF exempt tick either way when it was sent', () => {
    expect(payPatchForUpdate({ fixedPayNow: true, isEpfExempt: false })).toEqual({ is_epf_exempt: false })
    expect(payPatchForUpdate({ fixedPayNow: false, isEpfExempt: true })).toEqual({ is_epf_exempt: true })
  })

  it('reads children as a whole number, blank as 0', () => {
    expect(payPatchForUpdate({ fixedPayNow: true, childrenCount: '' })).toEqual({ children_count: 0 })
    expect(() => payPatchForUpdate({ fixedPayNow: true, childrenCount: '1.5' })).toThrow(/whole number/)
    expect(() => payPatchForUpdate({ fixedPayNow: true, childrenCount: '-1' })).toThrow(/whole number/)
  })

  it('refuses a negative amount by field name', () => {
    expect(() => payPatchForUpdate({ fixedPayNow: true, allowances: '-5' })).toThrow(/Statutory allowance cannot be negative/)
  })
})

/**
 * A divided department asks one more question on Add Staff (2026-09-20):
 * which sub-department the person is BASED in. The rules the form obeys are
 * the ones the database enforces, so nobody reaches a refusal it could have
 * shown them first.
 */
describe('the base a new hire is filed under', () => {
  const subs = [
    { id: 'ir', name: 'IR', departmentId: 'revenue', isHome: false, titleIds: ['rs', 'tl'] },
    { id: 'fair', name: 'Fair', departmentId: 'revenue', isHome: true, titleIds: ['rs', 'srs', 'tl'] },
    { id: 'roadshow', name: 'Roadshow', departmentId: 'events', isHome: true, titleIds: [] },
  ]

  it('offers one department’s own sub-departments, its default first', () => {
    expect(subDepartmentsForDepartment(subs, 'revenue').map(sub => sub.id)).toEqual(['fair', 'ir'])
  })

  it('has nothing to offer a department that is not divided, or before one is picked', () => {
    expect(subDepartmentsForDepartment(subs, 'marketing')).toEqual([])
    expect(subDepartmentsForDepartment(subs, '')).toEqual([])
  })

  it('refuses a base whose ladder has no rung for the chosen title, and asks nothing without one', () => {
    const ir = subs[0]!
    expect(baseUnavailableReason(ir, 'rs')).toBeNull()
    expect(baseUnavailableReason(ir, 'srs')).toBe('no rung for this title')
    expect(baseUnavailableReason(ir, null)).toBeNull()
  })
})

describe('who a new hire may be filed as reporting to', () => {
  const people = [
    { id: 'chea', name: 'Chea Huan', code: 'HV009', departmentId: 'revenue', departmentName: 'Revenue Department' },
    { id: 'ken', name: 'Ken', code: 'HV002', departmentId: 'marketing', departmentName: 'Marketing' },
  ]

  it('keeps a commission department’s line inside it — the line is also the commission upline', () => {
    expect(managersForDepartment(people, 'revenue', true).map(person => person.id)).toEqual(['chea'])
  })

  it('lets an ordinary department report across the company, its own people first', () => {
    expect(managersForDepartment(people, 'marketing', false).map(person => person.id)).toEqual(['ken', 'chea'])
  })

  it('offers nobody before a department is picked', () => {
    expect(managersForDepartment(people, '', false)).toEqual([])
  })
})
