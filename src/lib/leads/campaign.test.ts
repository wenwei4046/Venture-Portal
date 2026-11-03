import { describe, expect, it } from 'vitest'
import { audienceOf, basisOf, campaignProblem, consentTotals, personalize, resultSteps, share } from './campaign'

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

describe('step 6: consent and results', () => {
  it('counts real conversations, or the tests while there are only tests', () => {
    const rows = [
      { brandId: 'a', test: true, optIn: 'in' as const, n: 3 },
      { brandId: 'a', test: true, optIn: 'none' as const, n: 5 },
    ]
    expect(consentTotals(rows)).toEqual({ agreed: 3, notAsked: 5, unsub: 0 })
    expect(consentTotals([...rows, { brandId: 'a', test: false, optIn: 'out', n: 2 }])).toEqual({ agreed: 0, notAsked: 0, unsub: 2 })
  })

  it('draws the funnel with each step’s share of the one before, Read waiting for Meta', () => {
    const r = resultSteps({ sent: 100, replied: 40, phones: 10, bought: 2 })
    expect(r.map(x => [x.label, x.n, x.rate])).toEqual([
      ['Sent', 100, 'agreed customers'], ['Read', null, 'comes with Meta'], ['Replied', 40, '40% of previous'],
      ['Gave a phone', 10, '25% of previous'], ['Bought', 2, '20% of previous'],
    ])
    expect(resultSteps({ sent: 5, replied: 0, phones: 0 })[4]).toEqual({ label: 'Bought', n: null, rate: 'waits for the database update' })
  })
})
