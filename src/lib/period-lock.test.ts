import { afterEach, describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { inTimeZoneAsync } from '@/test/time-zone'
import { assertPeriodOpen } from './period-lock'

type LockRow = { period_month: string }

function mockClient(lockedPeriods: string[]): SupabaseClient {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: (_col: string, periodMonth: string) => ({
          eq: () => ({
            maybeSingle: async () =>
              lockedPeriods.includes(periodMonth)
                ? { data: { period_month: periodMonth } as LockRow, error: null }
                : { data: null, error: null },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('assertPeriodOpen', () => {
  it('passes when period has no lock row', async () => {
    const client = mockClient([])
    await expect(assertPeriodOpen(client, '2026-04-15')).resolves.toBeUndefined()
  })

  it('throws when the month containing the date is locked', async () => {
    const client = mockClient(['2026-03-01'])
    await expect(assertPeriodOpen(client, '2026-03-15')).rejects.toThrow(/closed/i)
  })

  it('normalizes any date in the month to the first of the month', async () => {
    const client = mockClient(['2026-03-01'])
    await expect(assertPeriodOpen(client, '2026-03-31')).rejects.toThrow()
    await expect(assertPeriodOpen(client, '2026-03-01')).rejects.toThrow()
  })

  it('accepts Date objects alongside strings', async () => {
    const client = mockClient(['2026-03-01'])
    await expect(assertPeriodOpen(client, new Date('2026-03-10'))).rejects.toThrow()
  })

  it('error message names the locked month (human-friendly)', async () => {
    const client = mockClient(['2026-03-01'])
    await expect(assertPeriodOpen(client, '2026-03-10')).rejects.toThrow(/Mar 2026/)
  })
})

// 2026-10-08: eleven actions ask about "now" (`assertPeriodOpen(supabase,
// new Date())`). On a server that keeps UTC, 00:30 on the 1st in the office is
// still the last day of the month before, so they asked about the wrong lock.
describe('assertPeriodOpen, on the office calendar', () => {
  afterEach(() => vi.useRealTimers())
  // 00:30 on 1 November in the office = 16:30 UTC on 31 October.
  const halfPastMidnight = new Date('2026-10-31T16:30:00Z')

  it("asks about the office's month for now, on a server in UTC", async () => {
    vi.useFakeTimers({ now: halfPastMidnight, toFake: ['Date'] })
    await inTimeZoneAsync('UTC', async () => {
      await expect(assertPeriodOpen(mockClient(['2026-11-01']), new Date())).rejects.toThrow(/Nov 2026/)
      // October's close no longer stops what is done in November.
      await expect(assertPeriodOpen(mockClient(['2026-10-01']), new Date())).resolves.toBeUndefined()
    })
  })

  it('reads a timestamp as the office day it fell on, and a date column as itself', async () => {
    await inTimeZoneAsync('UTC', async () => {
      await expect(assertPeriodOpen(mockClient(['2026-11-01']), '2026-10-31T16:30:00Z')).rejects.toThrow(/Nov 2026/)
      await expect(assertPeriodOpen(mockClient(['2026-10-01']), '2026-10-31')).rejects.toThrow(/Oct 2026/)
    })
    await inTimeZoneAsync('Pacific/Kiritimati', async () => {
      await expect(assertPeriodOpen(mockClient(['2026-10-01']), '2026-10-01')).rejects.toThrow(/Oct 2026/)
    })
  })
})
