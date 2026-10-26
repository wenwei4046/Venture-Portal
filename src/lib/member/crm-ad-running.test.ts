import { describe, expect, it } from 'vitest'
import { adRunning, adStatusOf } from './crm-ad-running'

const now = new Date('2026-10-22T12:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('adRunning', () => {
  it("goes by Ads Manager's status while it is fresh", () => {
    expect(adRunning({ status: 'ACTIVE', statusAt: ago(0.1) }, null, now)).toBe(true)
    for (const s of ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'ARCHIVED', 'DELETED', 'DISAPPROVED'])
      expect(adRunning({ status: s, statusAt: ago(1) }, ago(0), now)).toBe(false)
    expect(adRunning({ status: 'IN_PROCESS', statusAt: ago(1) }, null, now)).toBe(true)
  })
  it('goes by the last lead when the status is stale or missing', () => {
    expect(adRunning({ status: 'PAUSED', statusAt: ago(5) }, ago(2), now)).toBe(true)
    expect(adRunning(undefined, ago(6.9), now)).toBe(true)
    expect(adRunning(undefined, ago(7.5), now)).toBe(false)
    expect(adRunning(undefined, null, now)).toBe(false)
  })
})

describe('an ad’s run in a line', () => {
  it('reads scheduled, pending, running and ended', async () => {
    const { adRunLine, adToSync } = await import('./crm-ad-running')
    expect(adRunLine({ status: 'ACTIVE', startAt: '2026-10-25T01:00:00Z', endAt: '2026-10-30T15:00:00Z' }, now)).toBe('Scheduled · starts 25 Oct, 9:00 am · ends 30 Oct')
    expect(adRunLine({ status: 'PENDING_REVIEW', startAt: '2026-10-25T01:00:00Z', endAt: null }, now)).toBe('Pending review · 25 Oct')
    expect(adRunLine({ status: 'ACTIVE', startAt: '2026-10-19T08:39:00Z', endAt: null }, now)).toBe('Running · since 19 Oct')
    expect(adRunLine({ status: 'ACTIVE', startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-10T00:00:00Z' }, now)).toBe('Ended 10 Oct')
    expect(adRunLine({ status: 'CAMPAIGN_PAUSED' }, now)).toBe('Paused')
    expect(adRunLine(undefined, now)).toBe('')
    expect(adToSync({ status: 'ACTIVE', start: null, end: null }, now)).toBe(true)
    expect(adToSync({ status: 'PENDING_REVIEW', start: '2026-10-25T00:00:00Z', end: null }, now)).toBe(true)
    expect(adToSync({ status: 'PAUSED', start: null, end: null }, now)).toBe(false)
    expect(adToSync({ status: 'ACTIVE', start: null, end: '2026-10-01T00:00:00Z' }, now)).toBe(false)
  })
})

describe('Running · Paused · Pending (the desktop filter, 2026-10-23)', () => {
  const now = new Date('2026-10-23T10:00:00+08:00')
  const fresh = '2026-10-23T01:00:00Z'
  it('follows Ads Manager while it is fresh, else the last lead', () => {
    expect(adStatusOf({ status: 'ACTIVE', statusAt: fresh }, null, now)).toBe('Running')
    expect(adStatusOf({ status: 'ADSET_PAUSED', statusAt: fresh }, '2026-10-22T00:00:00Z', now)).toBe('Paused')
    expect(adStatusOf({ status: 'PENDING_REVIEW', statusAt: fresh }, null, now)).toBe('Pending')
    expect(adStatusOf({ status: 'ACTIVE', statusAt: fresh, startAt: '2026-10-25T01:00:00Z' }, null, now)).toBe('Pending')
    expect(adStatusOf({ status: 'ACTIVE', statusAt: fresh, endAt: '2026-10-20T01:00:00Z' }, null, now)).toBe('Paused')
    expect(adStatusOf(undefined, '2026-10-21T00:00:00Z', now)).toBe('Running')
    expect(adStatusOf(undefined, '2026-10-01T00:00:00Z', now)).toBe('Paused')
  })
})
