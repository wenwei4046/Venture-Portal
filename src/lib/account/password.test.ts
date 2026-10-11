import { describe, expect, it } from 'vitest'
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, NOT_CHANGED, passwordChangeProblem, passwordRefusal } from './password'

// Change password (2026-10-12): the current password, then the new one, then the new one again —
// what the three forms and the Server Action ask before the auth server is called, and how its
// refusals read.

const ok = { current: 'old-pass', next: 'new-pass-1', confirm: 'new-pass-1' }

describe('passwordChangeProblem', () => {
  it('lets a complete change through', () => {
    expect(passwordChangeProblem(ok)).toBe('')
  })

  it('asks for each box in the order the form shows them', () => {
    expect(passwordChangeProblem({ current: '', next: '', confirm: '' })).toBe('Enter your current password.')
    expect(passwordChangeProblem({ ...ok, next: '', confirm: '' })).toBe('Enter a new password.')
    expect(passwordChangeProblem({ ...ok, confirm: '' })).toBe('Type the new password again to confirm it.')
  })

  it('holds the new password to the auth server’s floor of six', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6)
    expect(passwordChangeProblem({ ...ok, next: '12345', confirm: '12345' })).toBe('Your new password needs at least 6 characters.')
    expect(passwordChangeProblem({ ...ok, next: '123456', confirm: '123456' })).toBe('')
  })

  it('refuses one longer than bcrypt reads, counted in bytes', () => {
    expect(passwordChangeProblem({ ...ok, next: 'a'.repeat(MAX_PASSWORD_BYTES), confirm: 'a'.repeat(MAX_PASSWORD_BYTES) })).toBe('')
    const long = 'a'.repeat(MAX_PASSWORD_BYTES + 1)
    expect(passwordChangeProblem({ ...ok, next: long, confirm: long })).toMatch(/too long/)
    // 25 Chinese characters are 75 bytes.
    const wide = '密'.repeat(25)
    expect(passwordChangeProblem({ ...ok, next: wide, confirm: wide })).toMatch(/too long/)
  })

  it('wants the new password to differ from the current one', () => {
    expect(passwordChangeProblem({ current: 'same-one', next: 'same-one', confirm: 'same-one' }))
      .toBe('Your new password must be different from the current one.')
  })

  it('wants the two new ones to match', () => {
    expect(passwordChangeProblem({ ...ok, confirm: 'new-pass-2' })).toBe('The two new passwords do not match.')
  })

  it('never trims: a space is a character of the password', () => {
    expect(passwordChangeProblem({ ...ok, confirm: 'new-pass-1 ' })).toBe('The two new passwords do not match.')
    expect(passwordChangeProblem({ current: 'pass', next: ' pass ', confirm: ' pass ' })).toBe('')
  })
})

describe('passwordRefusal', () => {
  it('reads a wrong current password, from the sign-in or from the update', () => {
    expect(passwordRefusal({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, 'current'))
      .toBe('Your current password is not right.')
    expect(passwordRefusal({ code: 'current_password_mismatch', status: 400 }, 'new')).toBe('Your current password is not right.')
    // A sign-in refused with no code still did not prove the password.
    expect(passwordRefusal({ status: 400, message: 'Bad request' }, 'current')).toBe('Your current password is not right.')
  })

  it('reads too many tries', () => {
    expect(passwordRefusal({ code: 'over_request_rate_limit', status: 429 }, 'current')).toMatch(/Too many tries/)
    expect(passwordRefusal({ status: 429 }, 'new')).toMatch(/Too many tries/)
  })

  it('reads the update’s own refusals', () => {
    expect(passwordRefusal({ code: 'same_password', status: 422 }, 'new')).toBe('Your new password must be different from the current one.')
    expect(passwordRefusal({ code: 'weak_password', status: 422, reasons: ['pwned'] }, 'new')).toMatch(/data leak/)
    expect(passwordRefusal({ code: 'weak_password', status: 422, reasons: ['length'], message: 'Password should be at least 8 characters.' }, 'new'))
      .toBe('Your new password is too weak: Password should be at least 8 characters.')
    expect(passwordRefusal({ code: 'session_not_found', status: 403 }, 'new')).toMatch(/Sign in again/)
  })

  it('says only that it did not work for anything else', () => {
    expect(passwordRefusal({ code: 'unexpected_failure', status: 500 }, 'new')).toBe(NOT_CHANGED)
    expect(passwordRefusal(null, 'new')).toBe(NOT_CHANGED)
    expect(passwordRefusal({ status: 400 }, 'new')).toBe(NOT_CHANGED)
  })
})
