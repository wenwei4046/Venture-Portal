import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/hiring/board', () => ({ loadHiringBoard: vi.fn() }))
vi.mock('@/lib/member/server', () => ({ adminMemberAction: vi.fn() }))
const att = vi.hoisted(() => ({
  ok: <T,>(data: T) => ({ ok: true as const, data }),
}))
vi.mock('@/lib/attendance/server', () => ({
  loadConfig: vi.fn(async () => att.ok({})), loadMonth: vi.fn(async () => att.ok({})),
  loadRequests: vi.fn(async () => att.ok([])), loadLedger: vi.fn(async () => att.ok({})),
}))
vi.mock('@/lib/attendance/overview', () => ({
  attendanceNews: () => ({ summary: '1 request waiting for HR · 0 not in yet · October closes 7 Nov', badges: { requests: 1, balances: 0, close: 0 } }),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@/types'
import { loadHrOverview } from './hr-overview'

// HR's Overview counts the probations waiting for Acknowledge (2026-10-23 — the user: "HR Overview 首页上的数字"): on
// People's tile and its row in People Management, and in the line of where things stand.

const hr = (over: Partial<User> = {}): User =>
  ({ id: 'u', name: 'HR Manager', role: 'hr', permissions: ['attendance', 'team'], actions: { 'team.view': 'all', 'team.edit': 'all' }, ...over }) as unknown as User
const review = (id: string, endsOn: string, ackEnd: string | null = null) => ({ id, name: id, endsOn, ackEnd, months: 3, hireDate: '2026-08-01' })

function db(probation: { data: unknown; error: unknown } | null) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'hr_dashboard_summary') return { data: { staff: { total_count: 61 } }, error: null }
    if (name === 'probation_reviews' && probation) return probation
    return { data: null, error: { code: 'XX000' } }
  })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T02:00:00Z')) // 10:00 the office's time, 23 Oct
})
afterEach(() => vi.useRealTimers())

describe('HR’s Overview and the probations ending', () => {
  it('counts those still waiting for Acknowledge on People, after the requests in its line', async () => {
    const { client } = db({
      data: [
        review('a', '2026-10-31'), review('b', '2026-10-20'), // waiting: 8 days, ended 3 days ago
        review('c', '2026-10-28', '2026-10-28'), // acknowledged for its end
        review('d', '2026-11-07'), // 15 days: not yet
      ],
      error: null,
    })
    const o = await loadHrOverview(client, hr())
    expect(o.badges.pplPeople).toBe(2)
    expect(o.summary).toBe('1 request waiting for HR · 2 probations ending · 0 not in yet · October closes 7 Nov.')
  })

  it('one: singular; none waiting: no part, no badge', async () => {
    expect((await loadHrOverview(db({ data: [review('a', '2026-10-31')], error: null }).client, hr())).summary)
      .toBe('1 request waiting for HR · 1 probation ending · 0 not in yet · October closes 7 Nov.')
    const none = await loadHrOverview(db({ data: [review('c', '2026-10-28', '2026-10-28')], error: null }).client, hr())
    expect(none.badges.pplPeople).toBe(0)
    expect(none.summary).toBe('1 request waiting for HR · 0 not in yet · October closes 7 Nov.')
  })

  it('is not asked without People · Edit on a person’s page, nor while viewing as somebody; a refused read counts nothing', async () => {
    for (const user of [hr({ actions: { 'team.view': 'all' } }), hr({ closed: ['hr.people.edit'] }), hr({ viewingAs: { id: 'x', name: 'Somebody' } })]) {
      const { client, rpc } = db({ data: [review('a', '2026-10-31')], error: null })
      const o = await loadHrOverview(client, user)
      expect(rpc).not.toHaveBeenCalledWith('probation_reviews')
      expect(o.badges.pplPeople).toBe(0)
    }
    const refused = await loadHrOverview(db({ data: null, error: { code: '42501' } }).client, hr())
    expect(refused.badges.pplPeople).toBe(0)
    expect(refused.summary).toBe('1 request waiting for HR · 0 not in yet · October closes 7 Nov.')
  })
})
