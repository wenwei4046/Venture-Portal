import { describe, it, expect } from 'vitest'
import { validateInvite, type RawInvite } from './invite'

const ok: RawInvite = {
  name: 'Chew Wee Ho',
  email: 'Chew@Venture.my',
  password: 'test123456',
  role: 'finance',
  departmentId: 'dept-1',
  titleId: 'title-1',
  reportsTo: 'staff-9',
  phone: '012-3456789',
  staffId: 'staff-1',
}

describe('validateInvite', () => {
  it('normalises a good invite', () => {
    expect(validateInvite(ok)).toEqual({
      name: 'Chew Wee Ho',
      email: 'chew@venture.my',
      password: 'test123456',
      role: 'finance',
      departmentId: 'dept-1',
      titleId: 'title-1',
      reportsTo: 'staff-9',
      phone: '012-3456789',
      staffId: 'staff-1',
    })
  })

  it('turns blank optional fields into null, not empty strings', () => {
    const out = validateInvite({ ...ok, titleId: '  ', reportsTo: '', phone: null })
    expect(out.titleId).toBeNull()
    expect(out.reportsTo).toBeNull()
    expect(out.phone).toBeNull()
  })

  it('trims and lowercases the email', () => {
    expect(validateInvite({ ...ok, email: '  Loo@VENTURE.MY ' }).email).toBe('loo@venture.my')
  })

  it('does not trim the password', () => {
    // A space is a legitimate character; eating it locks them out on the first
    // sign-in and nobody would guess why.
    expect(validateInvite({ ...ok, password: ' spaced ' }).password).toBe(' spaced ')
  })

  it('demands a name', () => {
    expect(() => validateInvite({ ...ok, name: '   ' })).toThrow(/Name is required/)
  })

  it('rejects an email that is not one', () => {
    for (const email of ['nope', 'a@b', 'a b@c.my', '@venture.my']) {
      expect(() => validateInvite({ ...ok, email })).toThrow(/does not look right/)
    }
  })

  it('rejects a password under the Supabase floor', () => {
    expect(() => validateInvite({ ...ok, password: '12345' })).toThrow(/at least 6/)
    expect(validateInvite({ ...ok, password: '123456' }).password).toBe('123456')
  })

  it('rejects a role that is not one of the four', () => {
    expect(() => validateInvite({ ...ok, role: 'admin' })).toThrow(/Pick a role/)
    expect(() => validateInvite({ ...ok, role: null })).toThrow(/Pick a role/)
  })

  it('makes a dept_manager carry a department', () => {
    expect(() =>
      validateInvite({ ...ok, role: 'dept_manager', departmentId: null }),
    ).toThrow(/department manager needs a department/)
    expect(
      validateInvite({ ...ok, role: 'dept_manager', departmentId: 'dept-2' }).departmentId,
    ).toBe('dept-2')
  })

  it('makes a brand-new person carry a department', () => {
    // No staffId means a roster row gets created, and department_id is NOT NULL.
    expect(() => validateInvite({ ...ok, staffId: null, departmentId: null })).toThrow(
      /new person needs a department/,
    )
  })

  it('lets somebody already on the roster keep their department', () => {
    const out = validateInvite({ ...ok, departmentId: null })
    expect(out.departmentId).toBeNull()
    expect(out.staffId).toBe('staff-1')
  })
})
