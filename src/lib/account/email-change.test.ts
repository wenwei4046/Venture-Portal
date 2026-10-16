import { describe, expect, it } from 'vitest'
import { emailChangeOf, emailChangeState, emailProblem, type EmailChange } from './email-change'

describe('emailProblem', () => {
  it('asks for an email that is one, and new', () => {
    expect(emailProblem('', 'ann@x.my')).toBe('Enter the new email.')
    expect(emailProblem('   ', 'ann@x.my')).toBe('Enter the new email.')
    expect(emailProblem('ann at x', 'ann@x.my')).toBe('Enter an email address like name@houzs.my.')
    expect(emailProblem('ann@x', 'ann@x.my')).toBe('Enter an email address like name@houzs.my.')
    expect(emailProblem(' ANN@X.MY ', 'ann@x.my')).toBe('That is already the email you sign in with.')
    expect(emailProblem(`${'a'.repeat(250)}@x.my`, 'ann@x.my')).toBe('That email is too long.')
    expect(emailProblem(' Ann.New@Mail.com ', 'ann@x.my')).toBe('')
  })
})

describe('emailChangeOf', () => {
  it('reads my_email_change()’s answer, and nothing else', () => {
    expect(emailChangeOf(null)).toBeNull()
    expect(emailChangeOf({ id: 'r1', status: 'odd', to: 'a@b.my' })).toBeNull()
    expect(emailChangeOf({ id: 'r1', ref: 'PF-2610-004', status: 'rejected', to: 'a@b.my', from: 'ann@x.my', at: '2026-10-16T02:00:00Z',
      decidedAt: '2026-10-16T03:00:00Z', note: 'Use your work email' })).toEqual({
      id: 'r1', ref: 'PF-2610-004', status: 'rejected', to: 'a@b.my', from: 'ann@x.my', at: '2026-10-16T02:00:00Z',
      decidedAt: '2026-10-16T03:00:00Z', note: 'Use your work email',
    })
    expect(emailChangeOf({ id: 'r1', status: 'pending', to: 'a@b.my', note: '' })?.note).toBeNull()
  })
})

describe('emailChangeState', () => {
  const now = new Date('2026-10-16T08:00:00Z')
  const base: EmailChange = { id: 'r1', ref: 'PF-2610-004', status: 'pending', to: 'a@b.my', from: 'ann@x.my', at: '2026-10-16T02:00:00Z', decidedAt: null, note: null }
  it('says what became of it', () => {
    expect(emailChangeState(null, now)).toBeNull()
    expect(emailChangeState(base, now)).toEqual({ kind: 'waiting', to: 'a@b.my', ref: 'PF-2610-004', at: '2026-10-16T02:00:00Z' })
    expect(emailChangeState({ ...base, status: 'cancelled' }, now)).toBeNull()
    expect(emailChangeState({ ...base, status: 'rejected', decidedAt: '2026-10-15T08:00:00Z', note: 'Use your work email' }, now))
      .toEqual({ kind: 'declined', to: 'a@b.my', note: 'Use your work email' })
    expect(emailChangeState({ ...base, status: 'approved', decidedAt: '2026-10-15T08:00:00Z' }, now)).toEqual({ kind: 'approved', to: 'a@b.my' })
  })
  it('lets a decision go after two weeks', () => {
    expect(emailChangeState({ ...base, status: 'approved', decidedAt: '2026-09-30T08:00:00Z' }, now)).toBeNull()
    expect(emailChangeState({ ...base, status: 'rejected', decidedAt: '2026-10-03T08:00:00Z' }, now)).toEqual({ kind: 'declined', to: 'a@b.my', note: null })
  })
})
