import { describe, it, expect } from 'vitest'
import {
  baseUnavailableReason,
  designationForTitle,
  isFullyCommissionBased,
  isVariablePay,
  managersForDepartment,
  offersVariablePay,
  payFieldsForUpdate,
  subDepartmentsForDepartment,
  titlesForDepartment,
  type RawPayFields,
  type RawStaffForm,
  validateStaffForm,
} from './staff-form'

const ok: RawStaffForm = {
  name: '  Lim Mei Ling ',
  departmentId: 'dept-marketing',
  titleId: 'title-1',
  fullCommission: false,
  basicSalary: '3500',
  allowances: '200.5',
  nonStatutoryAllowance: '0.00',
  bankName: ' Maybank ',
  bankAccountNo: '1234 5678 90',
  contactNumber: '012-345 6789',
  email: 'mei@example.com',
  address: 'Street, city',
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
      basicSalary: 3500,
      allowances: 200.5,
      nonStatutoryAllowance: 0,
      bankName: 'Maybank',
      bankAccountNo: '1234567890',
      bankName2: null,
      bankAccountNo2: null,
      contactNumber: '012-345 6789',
      email: 'mei@example.com',
      address: 'Street, city',
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
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
    })
    expect(out.titleId).toBeNull()
    expect(out.bankName).toBeNull()
    expect(out.bankAccountNo).toBeNull()
    expect(out.contactNumber).toBeNull()
    expect(out.email).toBeNull()
    expect(out.address).toBeNull()
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

describe('payFieldsForUpdate', () => {
  const salaried: RawPayFields = {
    fullCommission: false,
    employmentType: 'salaried',
    basicSalary: '3500',
    allowances: '200',
    nonStatutoryAllowance: '50',
    epfCategory: 'A',
    socsoCategory: 'first',
    isEpfExempt: false,
    pcbCategory: 'KA1',
    childrenCount: '2',
  }

  it('fully commission based writes the four pay columns and nothing else', () => {
    // The statutory fields were not on the form; whatever the row holds stays.
    expect(payFieldsForUpdate({ ...salaried, fullCommission: true })).toEqual({
      employment_type: 'commission_eligible',
      basic_salary: 0,
      allowances: 0,
      non_statutory_allowance: 0,
    })
  })

  it('otherwise writes every pay and statutory field', () => {
    expect(payFieldsForUpdate(salaried)).toEqual({
      employment_type: 'salaried',
      basic_salary: 3500,
      allowances: 200,
      non_statutory_allowance: 50,
      epf_category: 'A',
      socso_category: 'first',
      is_epf_exempt: false,
      pcb_category: 'KA1',
      children_count: 2,
    })
  })

  it('variable pay writes zero pay and the statutory categories with it', () => {
    // The month's keyed figure still attracts statutory, so the categories
    // stay on the form and are written — unlike fully commission based.
    expect(payFieldsForUpdate({ ...salaried, variablePay: true, basicSalary: '14400' })).toEqual({
      employment_type: 'variable',
      basic_salary: 0,
      allowances: 0,
      non_statutory_allowance: 0,
      epf_category: 'A',
      socso_category: 'first',
      is_epf_exempt: false,
      pcb_category: 'KA1',
      children_count: 2,
    })
  })

  it('variable pay still checks the statutory categories', () => {
    expect(() => payFieldsForUpdate({ ...salaried, variablePay: true, epfCategory: 'Z' })).toThrow(
      /EPF category is not a valid choice/,
    )
  })

  it('reads a missing Employment Type select as salaried', () => {
    expect(payFieldsForUpdate({ ...salaried, employmentType: null }).employment_type).toBe('salaried')
    expect(payFieldsForUpdate({ ...salaried, employmentType: 'commission_eligible' }).employment_type).toBe(
      'commission_eligible',
    )
  })

  it('checks the statutory categories instead of casting them', () => {
    expect(() => payFieldsForUpdate({ ...salaried, epfCategory: 'Z' })).toThrow(
      /EPF category is not a valid choice/,
    )
    expect(() => payFieldsForUpdate({ ...salaried, socsoCategory: null })).toThrow(
      /SOCSO category is required/,
    )
    expect(() => payFieldsForUpdate({ ...salaried, pcbCategory: '' })).toThrow(/PCB category is required/)
  })

  it('reads children as a whole number, blank as 0', () => {
    expect(payFieldsForUpdate({ ...salaried, childrenCount: '' })).toMatchObject({ children_count: 0 })
    expect(() => payFieldsForUpdate({ ...salaried, childrenCount: '1.5' })).toThrow(/whole number/)
    expect(() => payFieldsForUpdate({ ...salaried, childrenCount: '-1' })).toThrow(/whole number/)
  })

  it('refuses a negative amount by field name', () => {
    expect(() => payFieldsForUpdate({ ...salaried, allowances: '-5' })).toThrow(
      /Statutory allowance cannot be negative/,
    )
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
