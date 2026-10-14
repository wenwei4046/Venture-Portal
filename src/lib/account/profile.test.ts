import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NAME_MAX, PHONE_MAX, profileOf, profileProblem } from './profile'

// Edit profile (2026-10-14): what a change must satisfy, in the words the
// database refuses with too (update_my_profile, mig 20261014210000).

describe('a profile change', () => {
  it('needs a name', () => {
    expect(profileProblem({ name: '  ', phone: '' })).toBe('Enter your full name.')
  })

  it('keeps a name to 80 characters', () => {
    expect(profileProblem({ name: 'x'.repeat(NAME_MAX), phone: '' })).toBe('')
    expect(profileProblem({ name: 'x'.repeat(NAME_MAX + 1), phone: '' })).toMatch(/too long/)
  })

  it('takes a phone of digits, spaces, dashes, + and brackets — or none', () => {
    expect(profileProblem({ name: 'Aina Rahman', phone: '' })).toBe('')
    expect(profileProblem({ name: 'Aina Rahman', phone: '012-338 4127' })).toBe('')
    expect(profileProblem({ name: 'Aina Rahman', phone: '+60 (12) 338-4127' })).toBe('')
    expect(profileProblem({ name: 'Aina Rahman', phone: 'call me' })).toBe('Enter a phone number like 012-338 4127.')
    expect(profileProblem({ name: 'Aina Rahman', phone: '1'.repeat(PHONE_MAX + 1) })).toBe('Enter a phone number like 012-338 4127.')
  })

  it('reads the database’s answer, a missing phone an empty box', () => {
    expect(profileOf({ name: 'Aina', email: 'a@b', phone: null, personal: true })).toEqual({ name: 'Aina', email: 'a@b', phone: '' })
    expect(profileOf(null)).toBeNull()
  })

  it('says the same as the database’s function', () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261014210000_my_profile.sql'), 'utf8')
    for (const words of ['Enter your full name.', 'Enter a phone number like 012-338 4127.', `at most ${NAME_MAX} characters`]) {
      expect(sql).toContain(words)
    }
    expect(sql).toContain(`char_length(v_phone) > ${PHONE_MAX}`)
    expect(sql).toContain("'^[0-9+() -]+$'")
  })
})
