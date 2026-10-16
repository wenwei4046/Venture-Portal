import { describe, expect, it } from 'vitest'
import {
  emailRefusal,
  generatePassword,
  inviteBlocker,
  isTokenHash,
  passwordStrength,
  pendingLogins,
  validateInvite,
  welcomeBlocker,
  welcomeLink,
} from './invite'

const STAFF = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'

describe('validateInvite — a login for somebody on the roster', () => {
  it('takes the person, an email and a password, and no role', () => {
    expect(validateInvite({ staffId: STAFF, email: '  Ong.Siew@Houzs.com ', password: 'Hv-7k2m9q' })).toEqual({
      staffId: STAFF, email: 'ong.siew@houzs.com', mode: 'password', password: 'Hv-7k2m9q', cells: [],
    })
  })

  // The user's two choices (2026-10-16): Send Invite Link, or set the password now.
  it('takes an invite link with no password, and drops one the form still held', () => {
    expect(validateInvite({ staffId: STAFF, email: 'a@b.co', mode: 'link' })).toEqual({
      staffId: STAFF, email: 'a@b.co', mode: 'link', password: '', cells: [],
    })
    expect(validateInvite({ staffId: STAFF, email: 'a@b.co', mode: 'link', password: 'x' }).password).toBe('')
  })

  it('refuses a way in it does not know', () => {
    expect(() => validateInvite({ staffId: STAFF, email: 'a@b.co', mode: 'sms', password: 'secret' })).toThrow('Reload the page')
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

describe('the invite link (2026-10-16)', () => {
  const HASH = 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233'

  it('lands on our own /welcome, the token’s hash in its query, on the request’s own host', () => {
    expect(welcomeLink('venture-portal-chi.vercel.app', HASH)).toBe(`https://venture-portal-chi.vercel.app/welcome?token_hash=${HASH}&type=invite`)
    expect(welcomeLink('localhost:3000', HASH)).toBe(`http://localhost:3000/welcome?token_hash=${HASH}&type=invite`)
    expect(welcomeLink(null, 'a b')).toBe('http://localhost:3000/welcome?token_hash=a%20b&type=invite')
  })

  it('says why Supabase did not email it, so HR knows to pass the link on', () => {
    expect(emailRefusal('email_address_not_authorized')).toContain('until an email service is connected')
    expect(emailRefusal('over_email_send_rate_limit')).toContain('this hour')
    expect(emailRefusal(undefined)).toBe('Supabase could not send the email.')
  })

  it('takes a token hash as Supabase makes it, and nothing that is not one', () => {
    expect(isTokenHash(HASH)).toBe(true)
    expect([isTokenHash(''), isTokenHash('short'), isTokenHash(`${HASH}&type=x`), isTokenHash(undefined), isTokenHash(42)]).toEqual([false, false, false, false, false])
  })

  it('asks /welcome for six characters, the same twice', () => {
    expect(welcomeBlocker('12345', '12345')).toBe('Your password needs at least 6 characters.')
    expect(welcomeBlocker('123456', '123457')).toBe('The two passwords are not the same.')
    expect(welcomeBlocker(' pass word ', ' pass word ')).toBe('')
  })

  it('reads the logins whose link is not used yet, and nobody from no answer', () => {
    expect([...pendingLogins([{ user_id: 'a', pending: true }, { user_id: 'b', pending: false }, { pending: true }, null])]).toEqual(['a'])
    expect(pendingLogins(null).size).toBe(0)
    expect(pendingLogins({ user_id: 'a', pending: true }).size).toBe(0)
  })
})
