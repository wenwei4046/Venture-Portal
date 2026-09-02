import { describe, it, expect } from 'vitest'
import {
  validateStaffForm,
  titlesForDepartment,
  designationForTitle,
  isFullyCommissionBased,
  payFieldsForUpdate,
  type RawStaffForm,
  type RawPayFields,
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
      basicSalary: 3500,
      allowances: 200.5,
      nonStatutoryAllowance: 0,
      bankName: 'Maybank',
      bankAccountNo: '1234567890',
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
