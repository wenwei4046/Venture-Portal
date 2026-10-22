import { describe, expect, it } from 'vitest'
import { adRunning } from './crm-ad-running'

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
