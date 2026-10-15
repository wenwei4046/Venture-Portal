import { describe, expect, it } from 'vitest'
import {
  CUTOVERS, HALF_HOURS, blankWeek, dayBar, derivedFlags, entitlementLine, groupSummary, monthCells, multipliersFrom, nextFirsts, otRates, previewGroups, scheduleUsers,
  settledFlags, toggleAll, weeklyHours,
} from './settings'
import type { AttConfig, AttLeaveType, AttPerson } from './types'

const person = (id: string, over: Partial<AttPerson> = {}): AttPerson => ({
  id, name: id, code: null, titleId: 't-exec', title: 'Executive', level: 3, levelName: 'Executive', departmentId: null, department: null,
  hireDate: '2020-01-01', hasLogin: false, uplineId: null, upline: null, uplineHasLogin: null, templateId: null, ...over,
})

describe('Settings arithmetic (the handoff’s smVals / groupSummary)', () => {
  it('a blank week is Mon–Fri 9–6 with an hour’s break: 40 h', () => {
    const w = blankWeek()
    expect(w.map(d => d.type)).toEqual(['work', 'work', 'work', 'work', 'work', 'off', 'rest'])
    expect(weeklyHours(w)).toBe(40)
  })

  it('draws the day bar on 06:00–22:00 with the break in its middle', () => {
    const b = dayBar({ day: 'Mon', type: 'work', start: '09:00', end: '18:00', break: 60 })!
    expect(b.top).toBe(`${(180 / 960) * 100}%`)
    expect(b.h).toBe(`${(540 / 960) * 100}%`)
    expect(b.note).toBe('8 h · 60 min break')
    expect(dayBar({ day: 'Sat', type: 'off' })).toBeNull()
  })

  it('offers half hours 06:00–22:00 and cutovers 00:00–06:00', () => {
    expect(HALF_HOURS[0]).toBe('06:00')
    expect(HALF_HOURS[HALF_HOURS.length - 1]).toBe('22:00')
    expect(CUTOVERS).toHaveLength(13)
    expect(CUTOVERS[CUTOVERS.length - 1]).toBe('06:00')
  })

  it('works ORP and HRP out as the Act does', () => {
    const { orp, hrp } = otRates(3000, 8)
    expect(orp.toFixed(2)).toBe('115.38')
    expect(hrp.toFixed(2)).toBe('14.42')
  })

  it('never offers a multiplier below the Act’s minimum', () => {
    expect(multipliersFrom(2)).toEqual(['2', '2.5', '3', '3.5', '4'])
    expect(multipliersFrom(3)).toEqual(['3', '3.5', '4'])
  })

  it('sums a group as the prototype does', () => {
    const g = { titles: ['all'], levels: ['all'], base: 8, steps: [{ yrs: 2, days: 12 }, { yrs: 5, days: 16 }] }
    expect(groupSummary([g], true)).toBe('8 → 12 → 16 by service')
    expect(groupSummary([g], false)).toBe('everyone · 8 → 12 → 16 (at 2y, 5y)')
    expect(groupSummary([g, { ...g, titles: ['t1'], steps: [] }], true)).toBe('8 → 12 → 16 by service · +1 group')
    expect(groupSummary([{ titles: ['t1'], levels: ['1', '2', '3'], base: 3, steps: [] }], false, () => 'Driver')).toBe('Driver · L1–L3 · 3')
  })

  it('says a card’s entitlement line', () => {
    const t = (o: Partial<AttLeaveType>): AttLeaveType => ({ id: 'x', code: 'CL', name: 'Compassionate', groups: [{ titles: ['all'], levels: ['all'], base: 3, steps: [] }], rules: '', route: 'upline_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: null, ...o })
    expect(entitlementLine(t({}), id => id)).toBe('3 a year')
    expect(entitlementLine(t({ counts: 'calendar', groups: [{ titles: ['all'], levels: ['all'], base: 98, steps: [] }] }), id => id)).toBe('98 consecutive days')
    expect(entitlementLine(t({ unpaid: true }), id => id)).toBe('—')
    expect(entitlementLine(t({ drawsFrom: 'AL' }), id => id)).toBe('From AL')
  })

  it('toggles titles and levels with “all” standing alone', () => {
    expect(toggleAll(['all'], 't1')).toEqual(['t1'])
    expect(toggleAll(['t1'], 't1')).toEqual(['all'])
    expect(toggleAll(['t1', 't2'], 'all')).toEqual(['all'])
  })

  it('previews who a set of groups covers, first match winning, by service', () => {
    const people = [person('a', { hireDate: '2019-01-01' }), person('b', { hireDate: '2025-06-01' }), person('c', { titleId: 't-drv', title: 'Driver', level: 2 })]
    const groups = [{ titles: ['t-exec'], levels: ['all'], base: 8, steps: [{ yrs: 5, days: 16 }] }]
    const pv = previewGroups(groups, people, '2026-10-15')
    expect(pv.count).toBe('2 of 3 people covered')
    expect(pv.groups[0].rows.map(r => [r.person.id, r.days])).toEqual([['a', 16], ['b', 8]])
    expect(pv.uncovered.map(r => r.person.id)).toEqual(['c'])
  })

  it('lays a month out Monday first', () => {
    const oct = monthCells(2026, 10) // 1 Oct 2026 is a Thursday
    expect(oct.slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(oct.filter(Boolean)).toHaveLength(31)
  })

  it('a new leave type’s code suggests its flags; a saved one keeps its own; the switches settle (2026-10-15)', () => {
    expect(derivedFlags('AL', 'Annual leave')).toEqual({ accrues: true, unpaid: false, drawsFrom: null, counts: 'working' })
    expect(derivedFlags('UL', 'Unpaid leave')).toEqual({ accrues: false, unpaid: true, drawsFrom: null, counts: 'working' })
    expect(derivedFlags('EL', 'Emergency leave')).toEqual({ accrues: false, unpaid: false, drawsFrom: 'AL', counts: 'working' })
    expect(derivedFlags('ML', 'Maternity leave').counts).toBe('calendar')
    // NPL suggests nothing — the switch makes it unpaid, and it stays so once saved.
    const npl = { id: 'n', code: 'NP', name: 'No-pay leave', groups: [], rules: '', route: 'upline_only' as const, counts: 'working' as const, accrues: false, unpaid: true, drawsFrom: null }
    expect(derivedFlags('NP', 'No-pay leave').unpaid).toBe(false)
    expect(derivedFlags('NP', 'No-pay leave', npl).unpaid).toBe(true)
    // An unpaid type keeps no balance and comes out of none; one that comes out of another earns nothing itself.
    expect(settledFlags({ accrues: true, unpaid: true, drawsFrom: 'AL', counts: 'working' })).toEqual({ accrues: false, unpaid: true, drawsFrom: null, counts: 'working' })
    expect(settledFlags({ accrues: true, unpaid: false, drawsFrom: 'AL', counts: 'working' })).toEqual({ accrues: false, unpaid: false, drawsFrom: 'AL', counts: 'working' })
    expect(settledFlags({ accrues: true, unpaid: false, drawsFrom: null, counts: 'calendar' })).toEqual({ accrues: true, unpaid: false, drawsFrom: null, counts: 'calendar' })
  })

  it('offers the first of the next months, across the year end', () => {
    expect(nextFirsts('2026-10-15', 3)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(nextFirsts('2026-12-31', 1)).toEqual(['2027-01-01'])
  })

  it('counts a schedule’s people from its company default down', () => {
    const config = {
      today: '2026-10-15',
      people: [person('a'), person('b', { titleId: 't-drv' })],
      schedules: [{ id: 's1', name: 'Office 9–6', days: blankWeek() }, { id: 's2', name: 'Driver 8–5', days: blankWeek() }],
      assignments: [
        { id: 'x', level: 'company', titleId: null, staffId: null, label: 'HOUZS Venture', mode: 'clock', scheduleId: 's1', locationId: null, anywhere: false, ot: 'by_wage', from: '2026-11-01' },
        { id: 'y', level: 'title', titleId: 't-drv', staffId: null, label: 'Driver', mode: 'clock', scheduleId: 's2', locationId: null, anywhere: true, ot: 'statutory', from: '2026-11-01' },
      ],
    } as unknown as AttConfig
    expect(scheduleUsers(config.schedules[0], config, config.today)).toBe('Company default · 1 person')
    expect(scheduleUsers(config.schedules[1], config, config.today)).toBe('Title: Driver · 1 person')
  })
})
