import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
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
