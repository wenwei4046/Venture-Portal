import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hourly sweep (api/member-queue) writes the due notices before it flushes the phones' pushes — a probation or a
// contract ending among them (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送"; a contract too,
// 30 and again 15 days before, since mig 20261025046500 — "need 30 days and 15 days before remind, 2 reminder").

const calls = vi.hoisted(() => [] as string[])
const answers = vi.hoisted(() => ({
  terms: { data: 3 as number | null, error: null as { code: string } | null },
  purge: { data: null as null, error: null as { code: string } | null },
  runs: { data: 2 as number | null, error: null as { code: string } | null },
  adsDue: { data: 1 as number | null, error: null as { code: string } | null },
}))
vi.mock('@/lib/supabase/admin', () => ({
  adminClient: () => ({
    rpc: async (name: string) => {
      calls.push(name)
      if (name === 'member_process_all_queues') return { data: { status: 'complete', runId: 'r1', departmentsProcessed: 0, newReservations: 0, failures: 0 }, error: null }
      if (name === 'member_run_due_replacements') return { data: { ran: 0, failed: 0 }, error: null }
      if (name === 'notify_term_ends') return answers.terms
      if (name === 'mkt_lib_purge') return answers.purge
      if (name === 'mkt_product_runs_due') return answers.runs
      if (name === 'mkt_ads_due') return answers.adsDue
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
  answers.terms = { data: 3, error: null }
  answers.purge = { data: null, error: null }
  answers.runs = { data: 2, error: null }
  answers.adsDue = { data: 1, error: null }
  process.env.CRON_SECRET = SECRET
})
afterEach(() => {
  delete process.env.CRON_SECRET
  vi.restoreAllMocks()
})

describe('the hourly sweep', () => {
  it('writes the probation and contract notices before it flushes the pushes, and says how many — a count only', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const res = await sweep()
    expect(res.status).toBe(200)
    expect(calls.indexOf('notify_term_ends')).toBeGreaterThan(-1)
    expect(calls.indexOf('notify_term_ends')).toBeLessThan(calls.indexOf('flushPush'))
    // The sweep before 20261025046500 — nothing calls it any more.
    expect(calls).not.toContain('notify_probation_due')
    expect(calls.indexOf('notify_crm_due')).toBeLessThan(calls.indexOf('flushPush'))
    expect(info).toHaveBeenCalledWith('Term end notices written', 3)
  })

  it('a failed term end sweep is logged by its code and never stops the rest', async () => {
    answers.terms = { data: null, error: { code: '42501' } }
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await sweep()
    expect(res.status).toBe(200)
    expect(error).toHaveBeenCalledWith('Term end notices failed', '42501')
    expect(calls).toContain('flushPush')
  })

  it("purges Marketing's Dustbin every hour; a failure is logged by its code and stops nothing", async () => {
    // The user (2026-10-24): "60 days , auto clean" — not only when somebody next touches the Library.
    const res = await sweep()
    expect(res.status).toBe(200)
    expect(calls).toContain('mkt_lib_purge')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    answers.purge = { data: null, error: { code: '42883' } }
    expect((await sweep()).status).toBe(200)
    expect(error).toHaveBeenCalledWith('Marketing Dustbin purge failed', '42883')
  })

  // ②b-2f — the user's answer 12: a recurring Marketing product runs every month on its run day, worked or not.
  it("makes Marketing's recurring products' months before the pushes go; a failure is logged by its code and stops nothing", async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect((await sweep()).status).toBe(200)
    expect(calls.indexOf('mkt_product_runs_due')).toBeGreaterThan(-1)
    expect(calls.indexOf('mkt_product_runs_due')).toBeLessThan(calls.indexOf('flushPush'))
    expect(info).toHaveBeenCalledWith('Marketing monthly runs made', 2)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    answers.runs = { data: null, error: { code: '42883' } }
    expect((await sweep()).status).toBe(200)
    expect(error).toHaveBeenCalledWith('Marketing monthly runs failed', '42883')
  })

  // ⑤-3d — the user, asked whether an Ads report should tell when a period is due: "can do".
  it("tells Marketing's Ads reports due before the pushes go; a failure is logged by its code and stops nothing", async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect((await sweep()).status).toBe(200)
    expect(calls.indexOf('mkt_ads_due')).toBeGreaterThan(-1)
    expect(calls.indexOf('mkt_ads_due')).toBeLessThan(calls.indexOf('flushPush'))
    expect(info).toHaveBeenCalledWith('Marketing Ads reports due told', 1)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    answers.adsDue = { data: null, error: { code: '42883' } }
    expect((await sweep()).status).toBe(200)
    expect(error).toHaveBeenCalledWith('Marketing Ads reports due failed', '42883')
    expect(calls).toContain('mkt_lib_purge')
  })

  it('answers nobody without the cron secret — nothing is written', async () => {
    expect((await sweep('Bearer wrong-secret-wrong-secret-wrong-secret')).status).toBe(401)
    expect(calls).toEqual([])
  })
})
