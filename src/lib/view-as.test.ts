import { describe, expect, it } from 'vitest'
import {
  isViewAsRole,
  isPrincipalAccount,
  isMasked,
  VIEW_AS_ROLES,
} from './view-as'

describe('isViewAsRole', () => {
  it('accepts every switchable role', () => {
    for (const role of VIEW_AS_ROLES) {
      expect(isViewAsRole(role)).toBe(true)
    }
  })

  it('includes the neutral Revenue View mask', () => {
    expect(isViewAsRole('revenue_member')).toBe(true)
  })

  it('rejects principal — switching back clears the cookie instead', () => {
    expect(isViewAsRole('principal')).toBe(false)
  })

  it('rejects dept_manager (no department on the Principal account) and junk', () => {
    expect(isViewAsRole('dept_manager')).toBe(false)
    expect(isViewAsRole('')).toBe(false)
    expect(isViewAsRole('admin')).toBe(false)
  })
})

describe('isPrincipalAccount / isMasked', () => {
  it('native principal: switcher shown, not masked', () => {
    const u = { role: 'principal' as const }
    expect(isPrincipalAccount(u)).toBe(true)
    expect(isMasked(u)).toBe(false)
  })

  it('principal masked as hr: switcher still shown, masked', () => {
    const u = { role: 'hr' as const, actualRole: 'principal' as const }
    expect(isPrincipalAccount(u)).toBe(true)
    expect(isMasked(u)).toBe(true)
  })

  it('real hr user: no switcher, not masked', () => {
    const u = { role: 'hr' as const }
    expect(isPrincipalAccount(u)).toBe(false)
    expect(isMasked(u)).toBe(false)
  })

  it('distinguishes Principal Revenue View from an actual member account', () => {
    expect(isPrincipalAccount({ role: 'revenue_member', actualRole: 'principal' })).toBe(true)
    expect(isMasked({ role: 'revenue_member', actualRole: 'principal' })).toBe(true)
    expect(isPrincipalAccount({ role: 'revenue_member' })).toBe(false)
  })
})
