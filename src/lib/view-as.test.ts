import { describe, expect, it } from 'vitest'
import {
  honouredViewAs,
  isViewAsRole,
  isPrincipalAccount,
  isMasked,
  portalView,
  viewAsChanged,
  VIEW_AS_ROLES,
} from './view-as'

describe('honouredViewAs — the Revenue View is the member app’s own', () => {
  it('honours Revenue View in the member app', () => {
    expect(honouredViewAs('revenue_member', 'member')).toBe('revenue_member')
  })

  // The regression: the member app open in one tab turned a Product List tab
  // into a salesperson's session, and its tabs bounced to Overview.
  it('ignores Revenue View everywhere else', () => {
    expect(honouredViewAs('revenue_member', 'portal')).toBeNull()
  })

  it('honours HR and Finance on both surfaces, as before', () => {
    expect(honouredViewAs('hr', 'portal')).toBe('hr')
    expect(honouredViewAs('finance', 'portal')).toBe('finance')
    expect(honouredViewAs('hr', 'member')).toBe('hr')
  })

  // The Product List asks about the account itself (2026-10-08): no view, ever.
  it('honours nothing when the account itself is asked', () => {
    expect(honouredViewAs('hr', 'account')).toBeNull()
    expect(honouredViewAs('finance', 'account')).toBeNull()
    expect(honouredViewAs('revenue_member', 'account')).toBeNull()
  })

  it('honours nothing for a missing or unknown value', () => {
    expect(honouredViewAs(undefined, 'portal')).toBeNull()
    expect(honouredViewAs('', 'member')).toBeNull()
    expect(honouredViewAs('principal', 'portal')).toBeNull()
    expect(honouredViewAs('dept_manager', 'portal')).toBeNull()
  })
})

describe('portalView / viewAsChanged — a portal tab follows another tab’s switch', () => {
  it('draws the portal as Principal for Revenue View, HR / Finance as themselves', () => {
    expect(portalView('revenue_member')).toBe('principal')
    expect(portalView('principal')).toBe('principal')
    expect(portalView(null)).toBe('principal')
    expect(portalView('hr')).toBe('hr')
    expect(portalView('finance')).toBe('finance')
  })

  it('redraws when another tab switched to a different portal view', () => {
    expect(viewAsChanged('hr', 'principal')).toBe(true)
    expect(viewAsChanged('principal', 'finance')).toBe(true)
    expect(viewAsChanged('finance', 'hr')).toBe(true)
  })

  it('leaves the tab alone when the portal view is the one it shows', () => {
    expect(viewAsChanged('hr', 'hr')).toBe(false)
    expect(viewAsChanged('principal', 'principal')).toBe(false)
    // Opening the member app elsewhere does not touch a portal tab.
    expect(viewAsChanged('revenue_member', 'principal')).toBe(false)
  })

  it('does nothing without a mirror — no switch since sign-in, or an older session', () => {
    expect(viewAsChanged(null, 'hr')).toBe(false)
    expect(viewAsChanged(undefined, 'principal')).toBe(false)
    expect(viewAsChanged('', 'finance')).toBe(false)
  })
})

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
