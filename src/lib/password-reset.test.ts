import { describe, expect, it } from 'vitest'
import { openedByEmailLink, resetEmailProblem, resetSendRefusal, resetSentNote } from './password-reset'

// Forgot password (2026-11-14): the sign-in's link emails a reset link; /reset-password proves it.

describe('forgot password — the address and the answer', () => {
  it('asks for an email before anything is sent', () => {
    expect(resetEmailProblem('')).not.toBe('')
    expect(resetEmailProblem('principal')).not.toBe('')
    expect(resetEmailProblem('  someone@gmail.com ')).toBe('')
  })

  it('says the same for every address, so the box cannot tell who has a login', () => {
    expect(resetSentNote(' a@b.com ')).toContain('If a@b.com has an account')
  })

  it('words a rate limit, and leaves anything else to "try again"', () => {
    expect(resetSendRefusal('over_email_send_rate_limit')).toMatch(/Wait a minute/)
    expect(resetSendRefusal('over_request_rate_limit')).toMatch(/Wait a minute/)
    expect(resetSendRefusal('unexpected_failure')).toBeNull()
    expect(resetSendRefusal(undefined)).toBeNull()
  })
})

describe('a failed save may be tried again only on the session the link opened', () => {
  const now = Date.parse('2026-11-14T10:00:00Z')
  const at = (minutesAgo: number) => Math.floor((now - minutesAgo * 60_000) / 1000)

  it('takes a session the reset link (or another emailed link) opened minutes ago', () => {
    expect(openedByEmailLink([{ method: 'recovery', timestamp: at(2) }], now)).toBe(true)
    expect(openedByEmailLink([{ method: 'otp', timestamp: at(14) }], now)).toBe(true)
  })

  it('never a password sign-in — that would be Change password without the current one', () => {
    expect(openedByEmailLink([{ method: 'password', timestamp: at(1) }], now)).toBe(false)
  })

  it('not once the minutes are up, and nothing for an answer it cannot read', () => {
    expect(openedByEmailLink([{ method: 'recovery', timestamp: at(16) }], now)).toBe(false)
    expect(openedByEmailLink(['recovery'], now)).toBe(false)
    expect(openedByEmailLink(undefined, now)).toBe(false)
    expect(openedByEmailLink([{ method: 'recovery' }], now)).toBe(false)
  })
})
