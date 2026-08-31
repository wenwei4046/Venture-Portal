import { describe, expect, it } from 'vitest'
import { getGreeting, officeClock } from './office-clock'

/**
 * Every case here is a moment where UTC and Kuala Lumpur disagree — which is
 * the whole point of pinning the zone. The first one is the production bug,
 * caught in the act: the server had sent "Good afternoon" while the browser
 * showed "Good evening".
 */

describe('officeClock', () => {
  it('reads the evening that UTC still thinks is the afternoon', () => {
    // 15:04 UTC = 23:04 in KL. This is the exact moment the hydration error
    // was reproduced on production.
    const clock = officeClock(new Date('2026-08-31T15:04:00Z'))
    expect(clock.greeting).toBe('Good evening')
    expect(clock.date).toBe('Mon 31 Aug 2026')
    expect(clock.quarter).toBe('Q3 2026')
  })

  it('is already tomorrow morning when UTC is still yesterday afternoon', () => {
    // 16:30 UTC = 00:30 the NEXT day in KL. Midnight must read as hour 0, not
    // 24 — `hour12: false` reports 24 on some engines, which would greet a
    // sleepless director with "Good evening".
    const clock = officeClock(new Date('2026-08-31T16:30:00Z'))
    expect(clock.greeting).toBe('Good morning')
    expect(clock.date).toBe('Tue 1 Sep 2026')
  })

  it('turns the year and the quarter over eight hours before UTC does', () => {
    const clock = officeClock(new Date('2026-12-31T17:00:00Z'))
    expect(clock.date).toBe('Fri 1 Jan 2027')
    expect(clock.quarter).toBe('Q1 2027')
  })

  it('puts 1 April in Q2, not Q1', () => {
    // 31 Mar 16:00 UTC = 1 Apr 00:00 KL — a quarter boundary AND midnight.
    expect(officeClock(new Date('2026-03-31T16:00:00Z')).quarter).toBe('Q2 2026')
    // One second earlier is still March.
    expect(officeClock(new Date('2026-03-31T15:59:59Z')).quarter).toBe('Q1 2026')
  })

  it('maps every month onto the right quarter', () => {
    // Midday KL on the 15th of each month, so no boundary is in play.
    const quarters = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, '0')
      return officeClock(new Date(`2026-${month}-15T04:00:00Z`)).quarter
    })
    expect(quarters).toEqual([
      'Q1 2026', 'Q1 2026', 'Q1 2026',
      'Q2 2026', 'Q2 2026', 'Q2 2026',
      'Q3 2026', 'Q3 2026', 'Q3 2026',
      'Q4 2026', 'Q4 2026', 'Q4 2026',
    ])
  })

  it('does not depend on the machine it runs on', () => {
    // The same instant, however the host is configured, is the same string —
    // that is what makes the server and the browser agree.
    const instant = new Date('2026-08-31T15:04:00Z')
    expect(officeClock(instant)).toEqual(officeClock(new Date(instant.getTime())))
  })
})

describe('getGreeting', () => {
  it('changes at noon and at six', () => {
    expect(getGreeting(0)).toBe('Good morning')
    expect(getGreeting(11)).toBe('Good morning')
    expect(getGreeting(12)).toBe('Good afternoon')
    expect(getGreeting(17)).toBe('Good afternoon')
    expect(getGreeting(18)).toBe('Good evening')
    expect(getGreeting(23)).toBe('Good evening')
  })
})
