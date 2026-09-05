import { describe, expect, it } from 'vitest'
import { ERP_SYNC_SECRET_MIN_LENGTH, providedSecret, secretConfigured, secretMatches } from './auth'

const SECRET = 'a'.repeat(ERP_SYNC_SECRET_MIN_LENGTH)

describe('secretConfigured', () => {
  it('needs a real secret, not a placeholder', () => {
    expect(secretConfigured(undefined)).toBe(false)
    expect(secretConfigured('')).toBe(false)
    expect(secretConfigured('changeme')).toBe(false)
    expect(secretConfigured('a'.repeat(ERP_SYNC_SECRET_MIN_LENGTH - 1))).toBe(false)
    expect(secretConfigured(SECRET)).toBe(true)
  })
})

describe('providedSecret', () => {
  it('reads x-sync-secret first, then a Bearer token', () => {
    expect(providedSecret(new Headers({ 'x-sync-secret': ' s1 ' }))).toBe('s1')
    expect(providedSecret(new Headers({ authorization: 'Bearer s2' }))).toBe('s2')
    expect(providedSecret(new Headers({ 'x-sync-secret': 's1', authorization: 'Bearer s2' }))).toBe('s1')
    expect(providedSecret(new Headers({ authorization: 'Basic abc' }))).toBe('')
    expect(providedSecret(new Headers())).toBe('')
  })
})

describe('secretMatches', () => {
  it('matches only the exact secret', () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true)
    expect(secretMatches(SECRET.slice(0, -1) + 'b', SECRET)).toBe(false)
    expect(secretMatches(SECRET + 'a', SECRET)).toBe(false)
    expect(secretMatches('', SECRET)).toBe(false)
    expect(secretMatches(SECRET, '')).toBe(false)
  })
})
