import { describe, expect, it } from 'vitest'
import { REF_SOURCES, refKey, refKindOf, refsWanted } from './refs'

describe('refKindOf', () => {
  it('a column points where it always does', () => {
    expect(refKindOf('hr_monthly_payroll', 'staff_id')).toBe('staff')
    expect(refKindOf('payment_vouchers', 'created_by')).toBe('user')
    expect(refKindOf('invoices', 'company_id')).toBe('company')
    expect(refKindOf('comm_hierarchy', 'upline_staff_id')).toBe('staff')
    expect(refKindOf('payment_vouchers', 'payee_name')).toBeNull()
  })

  it('…except in the tables where the same name means another table', () => {
    expect(refKindOf('alloc_staff_splits', 'staff_id')).toBe('alloc_staff')
    expect(refKindOf('alloc_template_splits', 'template_id')).toBe('alloc_template')
    expect(refKindOf('titles', 'template_id')).toBe('template')
    expect(refKindOf('dp_inputs', 'company_id')).toBe('dp_company')
    expect(refKindOf('dp_contra', 'director_id')).toBe('dp_director')
    expect(refKindOf('director_ctc', 'director_id')).toBe('director')
  })
})

describe('refsWanted', () => {
  it('every id on the page, by kind, from before and after, once', () => {
    const wanted = refsWanted([
      { table_name: 'hr_monthly_payroll', old_row: { staff_id: 's1' }, new_row: { staff_id: 's1', created_by: 'u1' } },
      { table_name: 'hr_staff_costs', old_row: { reports_to: 's2' }, new_row: { reports_to: 's3', department_id: null } },
      { table_name: 'alloc_staff_splits', old_row: null, new_row: { staff_id: 'a1', company_id: 'c1' } },
    ])
    expect(Object.fromEntries([...wanted].map(([k, v]) => [k, [...v].sort()]))).toEqual({
      staff: ['s1', 's2', 's3'], user: ['u1'], alloc_staff: ['a1'], company: ['c1'],
    })
  })
})

describe('REF_SOURCES', () => {
  it('says each kind of row the way the portal does', () => {
    expect(REF_SOURCES.staff.label({ employee_code: 'HV010', employee_name: 'TAN AH KOW' })).toBe('HV010 · TAN AH KOW')
    expect(REF_SOURCES.user.label({ name: null, email: 'hr@venture.my' })).toBe('hr@venture.my')
    expect(REF_SOURCES.company.label({ short_code: 'AK', name: 'Akemi' })).toBe('AK')
    expect(REF_SOURCES.dp_month.label({ month: '2026-09-01' })).toBe('2026-09')
    expect(refKey('staff', 's1')).toBe('staff:s1')
  })
})
