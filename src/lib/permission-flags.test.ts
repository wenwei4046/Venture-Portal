import { describe, expect, it } from 'vitest'
import { flagsMoved, personFlagList, templateFlagList } from './permission-flags'

describe('templateFlagList — the whole list, so one tick never wipes the other', () => {
  it('sends both moved ticks', () => {
    expect(templateFlagList({ review: true, upNext: true }, [])).toEqual(['claims_review', 'crm_up_next'])
    expect(templateFlagList({ review: false, upNext: false }, ['claims_review', 'crm_up_next'])).toEqual([])
  })
  it('keeps the stored By management approve when only Up next moved', () => {
    expect(templateFlagList({ upNext: true }, ['claims_review'])).toEqual(['claims_review', 'crm_up_next'])
    expect(templateFlagList({ upNext: false }, ['claims_review', 'crm_up_next'])).toEqual(['claims_review'])
  })
  it('keeps the stored Up next when only By management approve moved', () => {
    expect(templateFlagList({ review: false }, ['claims_review', 'crm_up_next'])).toEqual(['crm_up_next'])
    expect(templateFlagList({ review: true }, [])).toEqual(['claims_review'])
  })
})

describe('personFlagList — their own ticks over the template', () => {
  it('a moved tick as sent; null drops it (the template’s again)', () => {
    expect(personFlagList({ review: false }, [])).toEqual([{ flag: 'claims_review', granted: false }])
    expect(personFlagList({ review: null }, [{ flag: 'claims_review', granted: false }])).toEqual([])
    expect(personFlagList({ upNext: true }, [])).toEqual([{ flag: 'crm_up_next', granted: true }])
  })
  it('keeps their stored other tick', () => {
    expect(personFlagList({ upNext: true }, [{ flag: 'claims_review', granted: false }])).toEqual([
      { flag: 'claims_review', granted: false },
      { flag: 'crm_up_next', granted: true },
    ])
    expect(personFlagList({ review: null }, [{ flag: 'claims_review', granted: true }, { flag: 'crm_up_next', granted: false }])).toEqual([
      { flag: 'crm_up_next', granted: false },
    ])
  })
  it('both back to the template: none', () => {
    expect(personFlagList({ review: null, upNext: null }, [{ flag: 'claims_review', granted: true }, { flag: 'crm_up_next', granted: true }])).toEqual([])
  })
})

describe('flagsMoved', () => {
  it('only when a tick was sent', () => {
    expect(flagsMoved({})).toBe(false)
    expect(flagsMoved({ upNext: null })).toBe(true)
    expect(flagsMoved({ review: false })).toBe(true)
  })
})
