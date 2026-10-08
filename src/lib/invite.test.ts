import { describe, expect, it } from 'vitest'
import { generatePassword, inviteBlocker, passwordStrength, validateInvite } from './invite'

const STAFF = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'

describe('validateInvite — a login for somebody on the roster', () => {
  it('takes the person, an email and a password, and no role', () => {
    expect(validateInvite({ staffId: STAFF, email: '  Ong.Siew@Houzs.com ', password: 'Hv-7k2m9q' })).toEqual({
      staffId: STAFF, email: 'ong.siew@houzs.com', password: 'Hv-7k2m9q', cells: [],
    })
  })

  it('refuses nobody picked, a bad email and a short password, in the drawer’s words', () => {
    expect(() => validateInvite({ staffId: '', email: 'a@b.co', password: 'secret' })).toThrow('Pick somebody from the roster')
    expect(() => validateInvite({ staffId: 'not-a-person', email: 'a@b.co', password: 'secret' })).toThrow('Pick somebody from the roster')
    expect(() => validateInvite({ staffId: STAFF, email: 'nope', password: 'secret' })).toThrow('Email is required')
    expect(() => validateInvite({ staffId: STAFF, email: 'a@b.co', password: 'short' })).toThrow('at least 6 characters')
  })

  it('keeps a password exactly as typed — spaces are characters', () => {
    expect(validateInvite({ staffId: STAFF, email: 'a@b.co', password: ' pass word ' }).password).toBe(' pass word ')
  })

  it('carries the cells changed for this person alone, ✕ as null', () => {
    const cells = [
      { function_key: 'audit_log', action: 'view', scope: 'all' },
      { function_key: 'hr_costing', action: 'export', scope: null },
    ]
    expect(validateInvite({ staffId: STAFF, email: 'a@b.co', password: 'secret', cells }).cells).toEqual(cells)
  })

  it.each([
    ['an unknown action', [{ function_key: 'claims', action: 'fly', scope: 'all' }]],
    ['an unknown reach', [{ function_key: 'claims', action: 'view', scope: 'galaxy' }]],
    ['the same cell twice', [{ function_key: 'claims', action: 'view', scope: 'own' }, { function_key: 'claims', action: 'view', scope: 'all' }]],
    ['not a list', { claims: 'view' }],
  ])('refuses %s', (_label, cells) => {
    expect(() => validateInvite({ staffId: STAFF, email: 'a@b.co', password: 'secret', cells })).toThrow('Reload the page')
  })
})

describe('the drawer’s footer', () => {
  it('names the first thing missing, then nothing', () => {
    expect(inviteBlocker({ staffId: null, email: '', password: '' })).toBe('Pick somebody from the roster')
    expect(inviteBlocker({ staffId: STAFF, email: 'x', password: '' })).toBe('Email is required')
    expect(inviteBlocker({ staffId: STAFF, email: 'a@b.co', password: '12345' })).toBe('Password must be at least 6 characters')
    expect(inviteBlocker({ staffId: STAFF, email: 'a@b.co', password: '123456' })).toBe('')
  })

  it('rates a password in three steps', () => {
    expect([passwordStrength(''), passwordStrength('abc'), passwordStrength('abcdef'), passwordStrength('Abcdefgh12')]).toEqual([0, 1, 2, 3])
    expect(passwordStrength('abcdefghij12')).toBe(2)
  })

  it('generates Hv- and seven characters nobody misreads', () => {
    let i = 0
    const pw = generatePassword(() => (i++ % 10) / 10)
    expect(pw).toMatch(/^Hv-[A-HJ-NP-Za-km-z2-9]{7}$/)
    expect(generatePassword()).toHaveLength(10)
  })
})
