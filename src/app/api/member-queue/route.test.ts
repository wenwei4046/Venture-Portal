import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hourly sweep (api/member-queue) writes the due notices before it flushes the phones' pushes — a probation
// ending within 15 days among them (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送"; 15 days, not
// 14, since mig 20261025010000).

const calls = vi.hoisted(() => [] as string[])
const answers = vi.hoisted(() => ({ probation: { data: 3 as number | null, error: null as { code: string } | null } }))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({
    rpc: async (name: string) => {
      calls.push(name)
      if (name === 'member_process_all_queues') return { data: { status: 'complete', runId: 'r1', departmentsProcessed: 0, newReservations: 0, failures: 0 }, error: null }
      if (name === 'member_run_due_replacements') return { data: { ran: 0, failed: 0 }, error: null }
      if (name === 'notify_probation_due') return answers.probation
      return { data: 0, error: null }
    },
  }),
}))
vi.mock('@/lib/push/outbox', () => ({ flushPush: vi.fn(async () => { calls.push('flushPush'); return null }) }))
vi.mock('@/lib/hiring/leftovers', () => ({ sweepHiringLeftovers: vi.fn(async () => ({ expired: 0, listed: 0, deleted: 0 })) }))
vi.mock('@/lib/documentation/drive-bin-sweep', () => ({ sweepDataCenterBin: vi.fn(async () => ({ expired: 0, deleted: 0, orphans: 0 })) }))
vi.mock('@/lib/member/crm-ad-names-meta', () => ({ refreshAdStatuses: vi.fn(async () => 0) }))
vi.mock('@/lib/storage/sweep', () => ({ sweepFileObjects: vi.fn(async () => ({ rowsWithoutFile: 0, filesWithoutRow: 0, stagedLeft: 0 })) }))

import { GET } from './route'

const SECRET = 'a-cron-secret-of-at-least-thirty-two-characters'
const sweep = (auth = `Bearer ${SECRET}`) => GET(new Request('https://erp.example/api/member-queue', { headers: { authorization: auth } }))

beforeEach(() => {
  calls.length = 0
  answers.probation = { data: 3, error: null }
  process.env.CRON_SECRET = SECRET
})
afterEach(() => {
  delete process.env.CRON_SECRET
  vi.restoreAllMocks()
})

describe('the hourly sweep', () => {
  it('writes the probation notices before it flushes the pushes, and says how many — a count only', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const res = await sweep()
    expect(res.status).toBe(200)
    expect(calls.indexOf('notify_probation_due')).toBeGreaterThan(-1)
    expect(calls.indexOf('notify_probation_due')).toBeLessThan(calls.indexOf('flushPush'))
    expect(calls.indexOf('notify_crm_due')).toBeLessThan(calls.indexOf('flushPush'))
    expect(info).toHaveBeenCalledWith('Probation notices written', 3)
  })

  it('a failed probation sweep is logged by its code and never stops the rest', async () => {
    answers.probation = { data: null, error: { code: '42501' } }
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await sweep()
    expect(res.status).toBe(200)
    expect(error).toHaveBeenCalledWith('Probation notices failed', '42501')
    expect(calls).toContain('flushPush')
  })

  it('answers nobody without the cron secret — nothing is written', async () => {
    expect((await sweep('Bearer wrong-secret-wrong-secret-wrong-secret')).status).toBe(401)
    expect(calls).toEqual([])
  })
})
