import { describe, expect, it } from 'vitest'
import { audienceOf, basisOf, campaignProblem, personalize, share } from './campaign'

const now = new Date('2026-10-16T10:00:00Z')

describe('Meta’s rule — the twin of lead_audience', () => {
  it('unsubscribed never, within 24 hours free, past it only with consent', () => {
    expect(basisOf('out', '2026-10-16T09:00:00Z', now)).toBe('out')
    expect(basisOf('none', '2026-10-15T11:00:00Z', now)).toBe('window')
    expect(basisOf('in', '2026-10-13T10:00:00Z', now)).toBe('optin')
    expect(basisOf('none', '2026-10-13T10:00:00Z', now)).toBe('none')
    expect(basisOf('none', null, now)).toBe('none')
  })
})

describe('the message', () => {
  it('puts each customer’s name in, as the send does', () => {
    expect(personalize('Hi {name}! {name}, see you', 'Ann')).toBe('Hi Ann! Ann, see you')
    expect(personalize('Hi {name}!', '  ')).toBe('Hi there!')
  })
  it('is checked before saving, in the database’s words', () => {
    const ok = { brandId: 'b', name: '11.11', body: 'Hi', buttons: ['Book'], scheduledAt: null }
    expect(campaignProblem(ok, now)).toBeNull()
    expect(campaignProblem({ ...ok, buttons: ['a', 'b', 'c', 'd'] }, now)).toMatch(/Up to 3 buttons/)
    expect(campaignProblem({ ...ok, buttons: ['x'.repeat(21)] }, now)).toMatch(/20 characters/)
    expect(campaignProblem({ ...ok, scheduledAt: '2026-10-16T09:00:00Z' }, now)).toMatch(/still to come/)
    expect(campaignProblem({ ...ok, brandId: '' }, now)).toBe('Pick a brand.')
  })
})

describe('the audience and results', () => {
  it('fills what a saved audience leaves out', () => {
    expect(audienceOf({ days: 30 })).toEqual({ days: 30, interest: '', phone: 'any', handed: 'any', source: 'any', tests: true })
  })
  it('rounds a share and has none before sending', () => {
    expect(share(1, 3)).toBe(33)
    expect(share(0, 0)).toBeNull()
  })
})
