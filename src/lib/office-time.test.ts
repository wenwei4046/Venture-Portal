import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { inTimeZone } from '@/test/time-zone'
import { officeDay, officeTime } from './office-time'

// The server (Vercel keeps UTC), the office (UTC+8), and a reader either side.
const ZONES = ['UTC', 'Asia/Kuala_Lumpur', 'Pacific/Kiritimati', 'America/Los_Angeles']

describe('officeTime', () => {
  // The production case: sent at 12:47 in the office, printed as 04:47 by a
  // page rendered on a server that keeps UTC.
  it('prints a moment on the office clock whatever zone the machine is in', () => {
    expect(officeTime('2026-10-02T04:47:41.516791+00:00').format('D MMMM YYYY HH:mm')).toBe('2 October 2026 12:47')
    expect(officeTime('2026-09-29T03:54:53Z').format('D MMM YY HH:mm')).toBe('29 Sep 26 11:54')
    expect(officeTime(new Date('2026-09-29T03:54:53Z')).format('YYYY-MM-DD HH:mm')).toBe('2026-09-29 11:54')
  })

  it('is already tomorrow in the office when UTC is still today', () => {
    expect(officeTime('2026-12-31T16:30:00Z').format('D MMM YYYY · HH:mm')).toBe('1 Jan 2027 · 00:30')
    expect(officeTime('2026-09-30T15:59:59Z').format('D MMM HH:mm:ss')).toBe('30 Sep 23:59:59')
  })

  it('reads a moment written in another offset as the same moment', () => {
    // 20:47 in Tokyo is 19:47 in Kuala Lumpur.
    expect(officeTime('2026-10-02T20:47:00+09:00').format('HH:mm')).toBe('19:47')
  })

  it('with nothing, is now — on the office clock', () => {
    const now = officeTime()
    expect(now.utcOffset()).toBe(480)
    expect(Math.abs(now.valueOf() - Date.now())).toBeLessThan(5000)
  })
})

describe('officeDay', () => {
  // The production case (2026-10-08): a voucher not yet paid is dated by when
  // it was made, and one made after midnight in the office read "10 Sep" on
  // the server and "11 Sep" in the browser — React threw the page away.
  it("puts a moment on the office's calendar, where the machine's clock disagreed with itself", () => {
    const afterMidnight = '2026-09-10T16:45:12.345+00:00' // 00:45 on 11 Sep in the office
    expect(inTimeZone('UTC', () => dayjs(afterMidnight).format('D MMM'))).toBe('10 Sep')
    expect(inTimeZone('Asia/Kuala_Lumpur', () => dayjs(afterMidnight).format('D MMM'))).toBe('11 Sep')
    for (const zone of ZONES) {
      expect(inTimeZone(zone, () => officeDay(afterMidnight).format('D MMM')), zone).toBe('11 Sep')
      expect(inTimeZone(zone, () => officeDay('2026-09-10T15:59:59Z').format('D MMM')), zone).toBe('10 Sep')
    }
  })

  it('reads a date column as the day it names, in every zone', () => {
    // Through officeTime, 29 Sep would be the 28th for a reader east of UTC+8.
    for (const zone of ZONES) {
      expect(inTimeZone(zone, () => officeDay('2026-09-29').format('D MMM')), zone).toBe('29 Sep')
      expect(inTimeZone(zone, () => officeDay('2027-01-01').format('D MMM YYYY')), zone).toBe('1 Jan 2027')
    }
  })
})
