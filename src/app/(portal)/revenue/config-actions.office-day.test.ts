import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase } from '@/test/recording-supabase'

// 2026-10-08: a new sub-department's scheme starts on the 1st of "this month"
// and a KPI threshold, unless told otherwise, from "today" — both taken from
// the UTC date. At 00:30 on 1 November in the office they started on
// 1 October and 31 October.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createSubDepartment, upsertKpiThreshold } from './config-actions'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'hr-user', role: 'hr', permissions: ['revenue'] })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe("revenue rules started after midnight on the 1st start in the office's month", () => {
  it("a new sub-department's scheme takes effect on 1 November", async () => {
    const db = recordingSupabase((call) => (call.op === 'insert' ? { data: { id: `${call.table}-new` } } : { data: [] }))
    mocks.createClient.mockResolvedValue(db.client)
    await inTimeZoneAsync('UTC', () => createSubDepartment(form({ department_id: 'dept-rev', name: 'Showroom' })))
    expect(db.writes('comm_schemes')[0].values).toMatchObject({ effective_from: '2026-11-01' })
  })

  it("a KPI threshold given no start date starts on the office's today", async () => {
    const db = recordingSupabase()
    mocks.createClient.mockResolvedValue(db.client)
    await inTimeZoneAsync('UTC', () => upsertKpiThreshold(form({ scheme_id: 'scheme-1', min_qty: '10', bonus_pct: '20' })))
    expect(db.writes('comm_kpi_thresholds')[0].values).toMatchObject({ effective_from: '2026-11-01' })
  })
})
