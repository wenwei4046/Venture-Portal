import { describe, expect, it } from 'vitest'
import { dealReturn, fromCalendar } from './deal-return'

// 2026-10-09 — the handoff: a deal opened from the Overview or the repayment
// calendar says "← Back to Overview" / "← Back to Calendar" and goes there
// (the calendar on the month it showed); otherwise back to its list.

const LIST = { href: '/fund-in', label: 'Fund IN' }

describe('where a deal page returns to', () => {
  it('is its list by default', () => {
    expect(dealReturn(LIST, {})).toEqual(LIST)
    expect(dealReturn(LIST, { from: 'elsewhere' })).toEqual(LIST)
  })
  it('is the Overview when opened from it', () => {
    expect(dealReturn(LIST, { from: 'overview' })).toEqual({ href: '/dashboard', label: 'Overview' })
  })
  it('is the calendar, on the month it showed', () => {
    expect(dealReturn(LIST, { from: 'calendar' })).toEqual({ href: '/repayment-schedule', label: 'Calendar' })
    expect(dealReturn(LIST, { from: 'calendar', month: '2026-11' })).toEqual({ href: '/repayment-schedule?month=2026-11', label: 'Calendar' })
    expect(dealReturn(LIST, { from: 'calendar', month: 'junk' })).toEqual({ href: '/repayment-schedule', label: 'Calendar' })
  })
})

describe('a deal as the calendar opens it', () => {
  it('carries where it came from, and the month when the calendar named one', () => {
    expect(fromCalendar('/fund-out/l1')).toBe('/fund-out/l1?from=calendar')
    expect(fromCalendar('/fund-in/f1', '2026-11')).toBe('/fund-in/f1?from=calendar&month=2026-11')
    expect(fromCalendar('/fund-in/f1', 'nope')).toBe('/fund-in/f1?from=calendar')
  })
})
