import { describe, it, expect } from 'vitest'
import {
  MULTI_FAIR_SPREAD_DAYS,
  candidateMonths,
  collidingFairs,
  fairCalendarSummary,
  fairMonthLabel,
  fairWindowError,
  fairWindowLabel,
  gapLooksLikeSeveralFairs,
  monthOf,
  sortFairs,
  unmovedByApply,
  windowsOverlap,
  type Fair,
  type FairGap,
} from './fair-calendar'

/**
 * The numbers here are the August 2026 reconciliation's, not invented ones:
 * the Kuching fair ran 28–31 August and its bills reached the ERP between
 * 1 and 16 September, and SPICE ARENA's 61 August bills spread 9 Aug to
 * 29 Aug because that hall held two fairs that month.
 */

function fair(over: Partial<Fair> = {}): Fair {
  return {
    fairId: 'f1',
    venueKey: 'BORNEO CONVENTION CENTRE KUCHING',
    displayName: 'Borneo Convention Centre Kuching',
    periodMonth: '2026-08-01',
    startDate: '2026-08-28',
    endDate: '2026-08-31',
    organiserId: 'o1',
    organiserName: 'HOMELOVE',
    erpOrganiserText: null,
    source: 'manual',
    notes: null,
    bills: 31,
    total: 203339,
    billsToMove: 30,
    valueToMove: 199339,
    confirmedToMove: 0,
    confirmedValueToMove: 0,
    ...over,
  }
}

function gap(over: Partial<FairGap> = {}): FairGap {
  return {
    venueKey: 'SPICE ARENA',
    displayName: 'Spice Arena',
    periodMonth: '2026-08-01',
    bills: 61,
    total: 400000,
    firstOrder: '2026-08-09',
    lastOrder: '2026-08-29',
    spreadDays: 20,
    ...over,
  }
}

describe('monthOf', () => {
  it('slices the month off a date without going through Date', () => {
    expect(monthOf('2026-08-28')).toBe('2026-08-01')
  })

  it('keeps the 1st and the 31st in their own month', () => {
    // The whole reason for slicing: parsed as a Date in a +08 zone, these two
    // are exactly where a UTC shift moves the month.
    expect(monthOf('2026-08-01')).toBe('2026-08-01')
    expect(monthOf('2026-08-31')).toBe('2026-08-01')
    expect(monthOf('2026-12-31')).toBe('2026-12-01')
  })
})

describe('candidateMonths', () => {
  it('offers one month for a fair inside a month', () => {
    expect(candidateMonths('2026-08-28', '2026-08-31')).toEqual(['2026-08-01'])
  })

  it('offers both for a fair over month end', () => {
    expect(candidateMonths('2026-08-30', '2026-09-02')).toEqual(['2026-08-01', '2026-09-01'])
  })
})

describe('fairWindowError', () => {
  it('accepts a real fair', () => {
    expect(fairWindowError('2026-08-28', '2026-08-31', '2026-08-01')).toBeNull()
  })

  it('needs both days', () => {
    expect(fairWindowError('', '2026-08-31', '2026-08-01')).toMatch(/first and a last day/)
    expect(fairWindowError('2026-08-28', '', '2026-08-01')).toMatch(/first and a last day/)
  })

  it('refuses a fair that closes before it opens', () => {
    expect(fairWindowError('2026-08-31', '2026-08-28', '2026-08-01')).toMatch(/before it opens/)
  })

  it('refuses a month the fair did not touch', () => {
    expect(fairWindowError('2026-08-28', '2026-08-31', '2026-09-01')).toMatch(/opened or the month/)
  })

  it('lets a fair over month end count in either month', () => {
    expect(fairWindowError('2026-08-30', '2026-09-02', '2026-08-01')).toBeNull()
    expect(fairWindowError('2026-08-30', '2026-09-02', '2026-09-01')).toBeNull()
  })

  it('accepts a one-day fair', () => {
    expect(fairWindowError('2026-08-09', '2026-08-09', '2026-08-01')).toBeNull()
  })
})

describe('windowsOverlap', () => {
  const kuching = { startDate: '2026-08-28', endDate: '2026-08-31' }

  it('is inclusive at both ends, like the database constraint', () => {
    expect(windowsOverlap(kuching, { startDate: '2026-08-31', endDate: '2026-09-02' })).toBe(true)
    expect(windowsOverlap(kuching, { startDate: '2026-08-25', endDate: '2026-08-28' })).toBe(true)
  })

  it('lets two fairs sit back to back', () => {
    expect(windowsOverlap(kuching, { startDate: '2026-09-01', endDate: '2026-09-03' })).toBe(false)
    expect(windowsOverlap(kuching, { startDate: '2026-08-25', endDate: '2026-08-27' })).toBe(false)
  })
})

describe('collidingFairs', () => {
  const mid = fair({
    fairId: 'rex',
    venueKey: 'MIDVALLEY SOUTHKEY JB',
    startDate: '2026-08-14',
    endDate: '2026-08-16',
  })
  const end = fair({
    fairId: 'bighome',
    venueKey: 'MIDVALLEY SOUTHKEY JB',
    startDate: '2026-08-29',
    endDate: '2026-08-31',
  })

  it('lets one hall hold two fairs a month', () => {
    // The user's own answer on 2026-09-20, and what the hand-computed form
    // shows: REX ran MVEC SOUTHKEY mid-August, BIGHOME ran it at month end.
    expect(collidingFairs([mid, end], 'MIDVALLEY SOUTHKEY JB', {
      startDate: '2026-08-21',
      endDate: '2026-08-23',
    })).toEqual([])
  })

  it('names the fair a new window would land on top of', () => {
    const hit = collidingFairs([mid, end], 'MIDVALLEY SOUTHKEY JB', {
      startDate: '2026-08-15',
      endDate: '2026-08-18',
    })
    expect(hit.map(f => f.fairId)).toEqual(['rex'])
  })

  it('ignores the fair being edited', () => {
    expect(collidingFairs([mid, end], 'MIDVALLEY SOUTHKEY JB', {
      startDate: '2026-08-14',
      endDate: '2026-08-17',
    }, 'rex')).toEqual([])
  })

  it('ignores another hall entirely', () => {
    expect(collidingFairs([mid, end], 'SPICE ARENA', {
      startDate: '2026-08-15',
      endDate: '2026-08-16',
    })).toEqual([])
  })

  it('ignores a legacy row with no days', () => {
    const undated = fair({ fairId: 'legacy', venueKey: 'SPICE ARENA', startDate: null, endDate: null })
    expect(collidingFairs([undated], 'SPICE ARENA', {
      startDate: '2026-08-07',
      endDate: '2026-08-09',
    })).toEqual([])
  })
})

describe('fairWindowLabel', () => {
  it('collapses a fair inside one month', () => {
    expect(fairWindowLabel('2026-08-28', '2026-08-31')).toBe('28–31 Aug 2026')
  })

  it('spells out a fair over month end', () => {
    expect(fairWindowLabel('2026-08-30', '2026-09-02')).toBe('30 Aug – 2 Sep 2026')
  })

  it('spells out a fair over new year', () => {
    expect(fairWindowLabel('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027')
  })

  it('shows a one-day fair once', () => {
    expect(fairWindowLabel('2026-08-09', '2026-08-09')).toBe('9 Aug 2026')
  })

  it('says nothing for a row with no days', () => {
    expect(fairWindowLabel(null, null)).toBe('—')
  })
})

describe('fairMonthLabel', () => {
  it('reads a month', () => {
    expect(fairMonthLabel('2026-08-01')).toBe('Aug 2026')
  })
})

describe('gapLooksLikeSeveralFairs', () => {
  it('leaves a real fair alone', () => {
    // Penang Waterfront, August: 13 bills over 4 days. One fair.
    expect(gapLooksLikeSeveralFairs(gap({ spreadDays: 4 }))).toBe(false)
    expect(gapLooksLikeSeveralFairs(gap({ spreadDays: 0 }))).toBe(false)
  })

  it('flags a hall that clearly held more than one', () => {
    // SPICE ARENA 20 days, MIDVALLEY SOUTHKEY 21, MIDVALLEY EXHIBITION 24.
    for (const spread of [20, 21, 24, 25]) {
      expect(gapLooksLikeSeveralFairs(gap({ spreadDays: spread }))).toBe(true)
    }
  })

  it('draws the line where the August data separates', () => {
    expect(gapLooksLikeSeveralFairs(gap({ spreadDays: MULTI_FAIR_SPREAD_DAYS }))).toBe(false)
    expect(gapLooksLikeSeveralFairs(gap({ spreadDays: MULTI_FAIR_SPREAD_DAYS + 1 }))).toBe(true)
  })
})

describe('fairCalendarSummary', () => {
  it('adds up what is dated, what would move and what is not placed', () => {
    const s = fairCalendarSummary(
      [fair(), fair({ fairId: 'legacy', startDate: null, endDate: null, bills: 0, total: 0, billsToMove: 0, valueToMove: 0 })],
      [gap(), gap({ venueKey: 'PENANG WATERFRONT', bills: 13, total: 90000, spreadDays: 4 })],
    )
    expect(s.dated).toBe(1)
    expect(s.undated).toBe(1)
    expect(s.billsToMove).toBe(30)
    expect(s.valueToMove).toBe(199339)
    expect(s.unplacedBills).toBe(74)
    expect(s.unplacedValue).toBe(490000)
    expect(s.gaps).toBe(2)
    expect(s.gapsNeedingSplit).toBe(1)
  })

  it('keeps what a human confirmed apart from what the calendar guessed', () => {
    // 2026-09-23: 174 bills wanted to leave September for August; the claim
    // form named 96 of them. The other 78 were September's own fairs at the
    // same halls, reached by the 45-day grace because September was not typed.
    const s = fairCalendarSummary(
      [
        fair({ billsToMove: 30, valueToMove: 199339, confirmedToMove: 30, confirmedValueToMove: 199339 }),
        fair({
          fairId: 'ioi',
          venueKey: 'IOI MALL PUTRAJAYA',
          billsToMove: 35,
          valueToMove: 180000,
          confirmedToMove: 4,
          confirmedValueToMove: 17816,
        }),
      ],
      [],
    )
    expect(s.billsToMove).toBe(65)
    expect(s.confirmedToMove).toBe(34)
    expect(s.confirmedValueToMove).toBe(217155)
  })

  it('is all zeroes before anything is typed', () => {
    const s = fairCalendarSummary([], [])
    expect(s).toEqual({
      dated: 0,
      undated: 0,
      billsToMove: 0,
      valueToMove: 0,
      confirmedToMove: 0,
      confirmedValueToMove: 0,
      unplacedBills: 0,
      unplacedValue: 0,
      gaps: 0,
      gapsNeedingSplit: 0,
    })
  })
})

describe('unmovedByApply', () => {
  it('counts the gaps sitting in a month the apply moves bills into', () => {
    const r = unmovedByApply(
      [fair()],
      [gap(), gap({ venueKey: 'SUNWAY PYRAMID', bills: 39, total: 238292, spreadDays: 17 })],
    )
    expect(r.bills).toBe(100)
    expect(r.value).toBe(638292)
    expect(r.months).toEqual(['2026-08-01'])
  })

  it('ignores a gap in a month nothing is moving into', () => {
    const r = unmovedByApply(
      [fair()],
      [gap({ periodMonth: '2026-09-01', bills: 46, total: 242574 })],
    )
    expect(r).toEqual({ bills: 0, value: 0, months: [] })
  })

  it('ignores a fair that has nothing to move', () => {
    const r = unmovedByApply([fair({ billsToMove: 0, valueToMove: 0 })], [gap()])
    expect(r).toEqual({ bills: 0, value: 0, months: [] })
  })

  it('names every destination month once, earliest first', () => {
    const r = unmovedByApply(
      [fair(), fair({ fairId: 'f2', periodMonth: '2026-09-01' })],
      [
        gap({ periodMonth: '2026-09-01', bills: 1, total: 10 }),
        gap({ periodMonth: '2026-08-01', bills: 2, total: 20 }),
        gap({ periodMonth: '2026-08-01', venueKey: 'KLCC', bills: 3, total: 30 }),
      ],
    )
    expect(r.bills).toBe(6)
    expect(r.months).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('is empty before anything is typed', () => {
    expect(unmovedByApply([], [])).toEqual({ bills: 0, value: 0, months: [] })
  })
})

describe('sortFairs', () => {
  it('puts the newest fair first and ranks an undated row on its month', () => {
    const rows = [
      fair({ fairId: 'a', startDate: '2026-08-07', endDate: '2026-08-09' }),
      fair({ fairId: 'b', startDate: '2026-08-28', endDate: '2026-08-31' }),
      fair({ fairId: 'c', startDate: null, endDate: null, periodMonth: '2026-09-01' }),
    ]
    expect(sortFairs(rows).map(f => f.fairId)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate what it was given', () => {
    const rows = [
      fair({ fairId: 'a', startDate: '2026-08-07', endDate: '2026-08-09' }),
      fair({ fairId: 'b', startDate: '2026-08-28', endDate: '2026-08-31' }),
    ]
    sortFairs(rows)
    expect(rows.map(f => f.fairId)).toEqual(['a', 'b'])
  })

  it('breaks a tie on the venue name', () => {
    const rows = [
      fair({ fairId: 'z', displayName: 'Zanotti Living' }),
      fair({ fairId: 'a', displayName: 'Arena' }),
    ]
    expect(sortFairs(rows).map(f => f.fairId)).toEqual(['a', 'z'])
  })
})
