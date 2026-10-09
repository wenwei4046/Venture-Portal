import { describe, expect, it } from 'vitest'
import { amountPresets, datePresets, inRange, rangeNumber } from './table-range'

// 2026-10-09 — the Finance revamp's column filter has a second mode for an
// amount or a date column: a range (Min / Max, From / To) with presets, and
// only one mode active at a time. The arithmetic lives here.

describe('rangeNumber', () => {
  it('turns what a column sorts by into one comparable number', () => {
    expect(rangeNumber(1234.5, 'number')).toBe(1234.5)
    expect(rangeNumber('1,234.50', 'number')).toBe(1234.5)
    expect(rangeNumber(null, 'number')).toBeNull()
    expect(rangeNumber('', 'number')).toBeNull()
    expect(rangeNumber(new Date('2026-10-09T00:00:00'), 'date')).toBe(new Date('2026-10-09T00:00:00').getTime())
    expect(rangeNumber('2026-10-09', 'date')).toBe(Date.parse('2026-10-09'))
    expect(rangeNumber('not a date', 'date')).toBeNull()
  })
})

describe('inRange', () => {
  it('passes a value between the bounds, either bound optional, a blank never', () => {
    expect(inRange(50, '10', '100')).toBe(true)
    expect(inRange(5, '10', '100')).toBe(false)
    expect(inRange(500, '10', '')).toBe(true)
    expect(inRange(500, '', '100')).toBe(false)
    expect(inRange(null, '', '100')).toBe(false)
    expect(inRange(10, '10', '10')).toBe(true)
  })

  it('takes a date bound as a day: To includes the whole of that day', () => {
    const noon = Date.parse('2026-10-09T12:00:00')
    expect(inRange(noon, '2026-10-09', '2026-10-09', 'date')).toBe(true)
    expect(inRange(noon, '2026-10-10', '', 'date')).toBe(false)
  })
})

describe('presets', () => {
  it('amounts: four bands', () => {
    expect(amountPresets().map((p) => [p.label, p.min, p.max])).toEqual([
      ['< 1,000', '', '1000'],
      ['1k – 10k', '1000', '10000'],
      ['10k – 100k', '10000', '100000'],
      ['> 100k', '100000', ''],
    ])
  })

  it('dates: last 7 days, this month, last month, this year — from today', () => {
    const today = new Date(2026, 9, 9) // 9 Oct 2026
    expect(datePresets(today).map((p) => [p.label, p.min, p.max])).toEqual([
      ['Last 7 days', '2026-10-02', '2026-10-09'],
      ['This month', '2026-10-01', '2026-10-31'],
      ['Last month', '2026-09-01', '2026-09-30'],
      ['This year', '2026-01-01', '2026-12-31'],
    ])
  })
})
