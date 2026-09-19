import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { moveReportingLine } from './hierarchy-writes'

vi.mock('server-only', () => ({}))

interface Staff {
  id: string
  employee_name: string
  status: string
  reports_to: string | null
  title_id: string
  department_id: string
  titles: { name: string; is_department_head: boolean }
  departments: { name: string; payroll_source: string }
}

const staff = (id: string, commission = true, head = false, reportsTo: string | null = null): Staff => ({
  id, employee_name: id.toUpperCase(), status: 'active', reports_to: reportsTo,
  title_id: `${id}-title`, department_id: commission ? 'revenue' : 'company',
  titles: { name: head ? 'Revenue Director' : commission ? 'Team Leader' : 'Company Manager', is_department_head: head },
  departments: { name: commission ? 'Revenue Department' : 'Director Office', payroll_source: commission ? 'commission' : 'fixed' },
})

function database(rows: Staff[], options: {
  canRecruit?: boolean | null
  writeError?: { code: string; message: string }
  matched?: boolean
} = {}) {
  const writes: Array<{ table: string; id: string; patch: Record<string, unknown> }> = []
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(async (_column: string, ids: string[]) => ({ data: rows.filter(row => ids.includes(row.id)), error: null })),
    })),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn((_column: string, id: string) => ({
        select: vi.fn(async () => {
          writes.push({ table, id, patch })
          return { data: options.writeError || options.matched === false ? [] : [{ id }], error: options.writeError ?? null }
        }),
      })),
    })),
  }))
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: options.canRecruit === undefined ? true : options.canRecruit, error: null,
  }))
  return { client: { from, rpc } as unknown as SupabaseClient, writes, from, rpc }
}

beforeEach(() => vi.clearAllMocks())

describe('department-head reporting writes', () => {
  it('stores a Revenue head’s company manager without changing commission memberships', async () => {
    const db = database([staff('kris', true, true), staff('principal', false)], { canRecruit: null })
    const result = await moveReportingLine(db.client, 'kris', 'principal')
    expect(result).toMatchObject({ ok: true, reportsTo: 'principal', mover: { isDepartmentHead: true, reportsTo: 'principal' } })
    expect(db.writes).toEqual([{ table: 'hr_staff_costs', id: 'kris', patch: { reports_to: 'principal' } }])
    expect(db.from.mock.calls.every(([table]) => table === 'hr_staff_costs')).toBe(true)
    expect(db.rpc.mock.calls.every(([name]) => name === 'comm_title_can_recruit')).toBe(true)
  })

  it('retains the real reports_to for head-to-head moves instead of normalizing to null', async () => {
    const db = database([staff('kris', true, true), staff('peter', true, true)], { canRecruit: false })
    const result = await moveReportingLine(db.client, 'kris', 'peter')
    expect(result).toMatchObject({ ok: true, reportsTo: 'peter' })
    expect(db.writes).toEqual([{ table: 'hr_staff_costs', id: 'kris', patch: { reports_to: 'peter' } }])
  })

  it('continues normalizing an ordinary member’s head target to its derived reporting line', async () => {
    const db = database([staff('seller', true, false, 'old-manager'), staff('kris', true, true)])
    const result = await moveReportingLine(db.client, 'seller', 'kris')
    expect(result).toMatchObject({ ok: true, reportsTo: null })
    expect(db.writes).toEqual([{ table: 'hr_staff_costs', id: 'seller', patch: { reports_to: null } }])
  })

  it('still blocks an ordinary commission member from reporting to a company manager', async () => {
    const db = database([staff('seller'), staff('principal', false)])
    const result = await moveReportingLine(db.client, 'seller', 'principal')
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('commission upline') })
    expect(db.writes).toEqual([])
  })

  it('still applies ordinary member recruiting restrictions', async () => {
    const db = database([staff('seller'), staff('specialist')], { canRecruit: false })
    const result = await moveReportingLine(db.client, 'seller', 'specialist')
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('cannot hold downlines') })
    expect(db.writes).toEqual([])
  })

  it.each([
    { code: '23LAD', message: 'KRIS cannot report to a lower company level.', expected: 'KRIS cannot report to a lower company level.' },
    { code: '23514', message: 'cycle constraint', expected: 'that would put them under their own report' },
    { code: '42501', message: 'row-level security', expected: 'this account is not allowed to write that' },
  ])('still returns the database’s $code refusal for a head move', async ({ code, message, expected }) => {
    const db = database([staff('kris', true, true), staff('principal', false)], { writeError: { code, message } })
    expect(await moveReportingLine(db.client, 'kris', 'principal')).toEqual({ ok: false, reason: expected })
    expect(db.writes).toHaveLength(1)
  })

  it('retains self-report, active-roster and checked-write safeguards', async () => {
    const self = database([staff('kris', true, true)])
    expect(await moveReportingLine(self.client, 'kris', 'kris')).toMatchObject({ ok: false, reason: expect.stringContaining('themselves') })
    expect(self.from).not.toHaveBeenCalled()
    const inactive = database([staff('kris', true, true), { ...staff('principal', false), status: 'inactive' }])
    expect(await moveReportingLine(inactive.client, 'kris', 'principal')).toEqual({ ok: false, reason: 'That manager is not on the active roster.' })
    expect(inactive.writes).toEqual([])
    const missing = database([staff('kris', true, true), staff('principal', false)], { matched: false })
    expect(await moveReportingLine(missing.client, 'kris', 'principal')).toEqual({ ok: false, reason: 'the row is gone, or is not visible to this account' })
  })

  it('detaches heads normally and leaves unchanged head-to-head reporting untouched', async () => {
    const detach = database([staff('kris', true, true, 'principal')])
    expect(await moveReportingLine(detach.client, 'kris', null)).toMatchObject({ ok: true, reportsTo: null })
    expect(detach.writes).toEqual([{ table: 'hr_staff_costs', id: 'kris', patch: { reports_to: null } }])
    const unchanged = database([staff('kris', true, true, 'peter'), staff('peter', true, true)])
    expect(await moveReportingLine(unchanged.client, 'kris', 'peter')).toMatchObject({ ok: true, reportsTo: 'peter' })
    expect(unchanged.writes).toEqual([])
  })
})
