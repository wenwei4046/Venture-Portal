import { describe, expect, it } from 'vitest'
import {
  AREA_OF_TAB,
  NO_REACH,
  REACH_AREAS,
  defaultReach,
  isReachTickList,
  personReachFromJson,
  reachFromJson,
  reachOf,
  reachesSub,
  sameReachTicks,
  sortedTicks,
  subsInReach,
  tickedFor,
  toggleReach,
  type PersonReach,
} from './sub-department-reach'
import { TAB_BY_ID } from './permission-tabs'

// Sub-departments per person (2026-10-16 — the owner: "follow by this handle department, as default", and
// ticks "按 sub-department" on the CRM and the Revenue team's tabs).
const FAIR = '11111111-1111-4111-8111-111111111111'
const IR = '22222222-2222-4222-8222-222222222222'
const SUBS = [{ id: FAIR, name: 'Fair' }, { id: IR, name: 'IR' }]

const person = (handled: string[], ticks: PersonReach['ticks'] = []): PersonReach => ({ subs: SUBS, handled, ticks })

describe('the reach the database answers', () => {
  it('reads my_sub_department_reach() per area', () => {
    expect(reachFromJson({ crm: [IR], comm_cal: [FAIR, IR], sales_groups: [], rules: [FAIR] }))
      .toEqual({ crm: [IR], comm_cal: [FAIR, IR], sales_groups: [], rules: [FAIR] })
  })

  it('fails closed: no answer, an error or a wrong shape reaches nothing', () => {
    expect(reachFromJson(null)).toEqual(NO_REACH)
    expect(reachFromJson(['dashboard'])).toEqual(NO_REACH)
    expect(reachFromJson({ crm: 'IR' })).toEqual(NO_REACH)
  })

  it('a value built without a reach narrows nothing; a real one does', () => {
    expect(reachesSub(undefined, 'crm', IR)).toBe(true)
    expect(reachesSub({ ...NO_REACH, crm: [FAIR] }, 'crm', IR)).toBe(false)
    expect(reachesSub({ ...NO_REACH, crm: [FAIR] }, 'crm', FAIR)).toBe(true)
    expect(subsInReach(SUBS, { ...NO_REACH, comm_cal: [IR] }, 'comm_cal')).toEqual([{ id: IR, name: 'IR' }])
    expect(subsInReach(SUBS, undefined, 'comm_cal')).toEqual(SUBS)
  })
})

describe('the rows that carry sub-departments', () => {
  it('are tabs of the matrix, the CRM’s two as one area', () => {
    for (const tab of Object.keys(AREA_OF_TAB)) expect(TAB_BY_ID.has(tab), tab).toBe(true)
    expect(AREA_OF_TAB['rev.leads']).toBe('crm')
    expect(AREA_OF_TAB['rev.crm_team']).toBe('crm')
    expect([...new Set(Object.values(AREA_OF_TAB))].sort()).toEqual([...REACH_AREAS].sort())
  })
})

describe('one person’s window', () => {
  it('defaults to what they handle — every sub-department when they handle none', () => {
    expect([...defaultReach(person([FAIR]))]).toEqual([FAIR])
    expect([...defaultReach(person([]))].sort()).toEqual([FAIR, IR].sort())
  })

  it('their ticks raise or hold back, in one area only', () => {
    const kris = person([FAIR], [{ area: 'crm', sub: IR, granted: true }])
    expect([...reachOf(kris, kris.ticks, 'crm')].sort()).toEqual([FAIR, IR].sort())
    expect([...reachOf(kris, kris.ticks, 'comm_cal')]).toEqual([FAIR])
    const hr = person([], [{ area: 'rules', sub: IR, granted: false }])
    expect([...reachOf(hr, hr.ticks, 'rules')]).toEqual([FAIR])
  })

  it('a click flips one pill, and landing back on the default stores no tick', () => {
    const kris = person([FAIR])
    const on = toggleReach(kris, [], 'crm', IR)
    expect(on).toEqual([{ area: 'crm', sub: IR, granted: true }])
    expect(tickedFor(on, 'crm', IR)).toBe(true)
    expect(toggleReach(kris, on, 'crm', IR)).toEqual([])
    expect(toggleReach(kris, [], 'crm', FAIR)).toEqual([{ area: 'crm', sub: FAIR, granted: false }])
  })

  it('compares ticks whatever their order', () => {
    const a = [{ area: 'crm' as const, sub: IR, granted: true }, { area: 'comm_cal' as const, sub: FAIR, granted: false }]
    expect(sameReachTicks(a, [...a].reverse())).toBe(true)
    expect(sameReachTicks(a, [a[0]])).toBe(false)
    expect(sortedTicks(a).map(t => t.area)).toEqual(['comm_cal', 'crm'])
  })

  it('reads person_sub_department_reach(), dropping what it does not know', () => {
    const read = personReachFromJson({
      subs: SUBS,
      handled: [FAIR, 'gone'],
      ticks: [{ area: 'crm', sub: IR, granted: true }, { area: 'quotes', sub: IR, granted: true }, { area: 'crm', sub: 'gone', granted: false }],
    })
    expect(read).toEqual({ subs: SUBS, handled: [FAIR], ticks: [{ area: 'crm', sub: IR, granted: true }] })
    expect(personReachFromJson(null)).toEqual({ subs: [], handled: [], ticks: [] })
  })
})

describe('what a save may send', () => {
  it('an area, a sub-department, on or off — each once', () => {
    expect(isReachTickList([{ area: 'crm', sub: IR, granted: true }, { area: 'comm_cal', sub: IR, granted: false }])).toBe(true)
    expect(isReachTickList([])).toBe(true)
    expect(isReachTickList([{ area: 'crm', sub: IR, granted: true }, { area: 'crm', sub: IR, granted: false }])).toBe(false)
    expect(isReachTickList([{ area: 'quotes', sub: IR, granted: true }])).toBe(false)
    expect(isReachTickList([{ area: 'crm', sub: 'IR', granted: true }])).toBe(false)
    expect(isReachTickList([{ area: 'crm', sub: IR }])).toBe(false)
    expect(isReachTickList('crm')).toBe(false)
    expect(isReachTickList(Array.from({ length: 201 }, () => ({ area: 'crm', sub: IR, granted: true })))).toBe(false)
  })
})
