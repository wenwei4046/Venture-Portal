import { describe, expect, it } from 'vitest'
import { draftPayload, emptyDraft, type RequestDraft } from './model'
import { cleanPayload } from './payload'

// A SPLIT BY PERCENT KEEPS ITS PERCENTS (2026-11-28): what savePaymentRequest hands payment_request_save. It dropped a
// share's percent, so a split typed by percent reached the database as `{ amount: '' }` — RM 0 a share, the requester's
// own department bearing the whole claim (mig 20261112210000 reads `percent` and works the ringgit out of it).

const VO = '0b8b1f0e-3c0a-4c7e-9a52-6f0c1d2e3a40'
const HR = '7d1f2a33-4b5c-4d6e-8f70-819203a4b5c6'
const DC = 'c2d3e4f5-a6b7-4c8d-9e0f-102132435465'

const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({
  ...emptyDraft(), kind: 'claim', salary: true, items: [{ description: 'Claude · Oct', amount: '453.79' }], bears: 'own', ...over,
})

describe('what a save hands the database', () => {
  it('keeps each share’s percent when the split is by percent', () => {
    const sent = draftPayload(draft({ bears: 'split', by: 'percent', shares: [
      { party: 'venture', partyId: VO, amount: '33.33%' },
      { party: 'department', partyId: HR, amount: '50' },
    ] }), [], [])
    expect(cleanPayload(sent)?.shares).toEqual([
      { party: 'department', departmentId: VO, amount: '', percent: '33.33' },
      { party: 'department', departmentId: HR, amount: '', percent: '50' },
    ])
  })

  it('passes every share the window sends as it sent it — by amount, by percent, another department whole', () => {
    for (const d of [
      draft({ bears: 'split', by: 'amount', shares: [{ party: 'company', partyId: DC, amount: '1,000.50' }] }),
      draft({ bears: 'split', by: 'percent', shares: [{ party: 'company', partyId: DC, amount: '25' }] }),
      draft({ bears: 'other', other: HR }),
    ]) {
      const sent = draftPayload(d, [], [])
      expect(cleanPayload(sent)?.shares).toEqual(sent?.shares)
    }
  })

  it('adds no percent to a share typed in ringgit, and keeps only text', () => {
    const shares = cleanPayload({ kind: 'claim', shares: [
      { party: 'company', companyId: DC, amount: '80' },
      { party: 'department', departmentId: HR, amount: '', percent: 40 },
      { party: 'department', departmentId: HR, amount: '', percent: '12345678901234' },
    ] })?.shares
    expect(shares?.[0]).toEqual({ party: 'company', companyId: DC, amount: '80' })
    expect(shares?.[1]).not.toHaveProperty('percent')
    // Anything else typed goes as text, cut short — the database refuses it in words.
    expect(shares?.[2].percent).toBe('1234567890')
  })

  it('refuses what is not a request, and keeps the rest of it as before', () => {
    expect(cleanPayload(null)).toBeNull()
    expect(cleanPayload({ kind: 'bonus' })).toBeNull()
    const sent = draftPayload(draft({ salary: false, bank: ' Public Bank ', accountNo: '3-1874502 10' }), [{ path: 'u/r/a.pdf', name: 'a.pdf', contentType: 'application/pdf', size: 12 }], [HR, 'not-an-id'])
    expect(cleanPayload(sent)).toEqual({
      kind: 'claim',
      payTo: { salary: false, bank: 'Public Bank', accountNo: '3187450210' },
      items: [{ description: 'Claude · Oct', amount: '453.79' }],
      shares: [],
      files: [{ path: 'u/r/a.pdf', name: 'a.pdf', contentType: 'application/pdf', size: 12 }],
      removeFiles: [HR],
    })
  })
})
