import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.permission, requireAction: mocks.permission, requireAnyAction: mocks.permission, requirePayrollPayoutsAction: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('server-only', () => ({}))
import { moveEmployee, removeEmployeeMembership, terminateEmployee } from './employee-actions'

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ staff_id: 'person', source_scheme_id: 'source', ...values })) data.set(key, value)
  return data
}

describe('employee chart actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permission.mockResolvedValue({ id: 'actor' })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('sends a sub-department move as one atomic call and supports an existing destination', async () => {
    expect(await moveEmployee(form({ destination_kind: 'subdepartment', destination_id: 'target' }))).toEqual({ ok: true, note: null })
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('revenue', 'edit')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('employee_chart_lifecycle', {
      p_action: 'move', p_staff_id: 'person', p_source_scheme_id: 'source',
      p_destination_kind: 'subdepartment', p_destination_id: 'target', p_title_id: null,
    })
    expect(mocks.refresh).toHaveBeenCalledWith('/team', 'layout')
    expect(mocks.refresh).toHaveBeenCalledWith('/revenue', 'layout')
  })

  it('requires Revenue · Edit and Team · Edit for a main-department move and includes its selected title', async () => {
    await moveEmployee(form({ destination_kind: 'department', destination_id: 'hr', title_id: 'hr-title' }))
    expect(mocks.permission.mock.calls).toEqual([['revenue', 'edit'], ['team', 'edit']])
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_destination_kind: 'department', p_destination_id: 'hr', p_title_id: 'hr-title' })
  })

  it('never calls the database when the second permission gate denies access', async () => {
    mocks.permission.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('denied'))
    await expect(terminateEmployee(form({ resignation_date: '2026-01-01' }))).rejects.toThrow('denied')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects incomplete or unsupported moves before the database', async () => {
    expect(await moveEmployee(form({ destination_kind: 'company', destination_id: 'hr' }))).toMatchObject({ ok: false })
    expect(await moveEmployee(form({ destination_kind: 'department', destination_id: 'hr' }))).toMatchObject({ ok: false })
    expect(await moveEmployee(form({ destination_kind: 'subdepartment', destination_id: '' }))).toMatchObject({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('removes only the selected membership through the narrow RPC', async () => {
    await removeEmployeeMembership(form())
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('employee_chart_lifecycle', {
      p_action: 'remove', p_staff_id: 'person', p_source_scheme_id: 'source',
    })
  })

  it('validates real calendar dates and rejects future last working days', async () => {
    for (const resignation_date of ['2026-02-30', '2026-2-01', 'not-a-date', '9999-12-31', '']) {
      expect(await terminateEmployee(form({ resignation_date }))).toMatchObject({ ok: false })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('uses Malaysia today at the UTC date boundary', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-19T17:00:00Z'))
      expect(await terminateEmployee(form({ resignation_date: '2026-09-20' }))).toEqual({ ok: true, note: null })
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_action: 'terminate', p_resignation_date: '2026-09-20' })
      expect(mocks.refresh).toHaveBeenCalledWith('/hr-costing', 'layout')
      expect(mocks.refresh).toHaveBeenCalledWith('/member', 'layout')
    } finally { vi.useRealTimers() }
  })

  it('returns domain refusal without refreshing or claiming a partial success', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '23EMP', message: 'Reassign their reports first.' } })
    expect(await removeEmployeeMembership(form())).toEqual({ ok: false, note: 'Reassign their reports first.' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('handles RLS refusal and network errors as actionable results', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'denied' } })
    expect(await removeEmployeeMembership(form())).toMatchObject({ ok: false, note: expect.stringContaining('not allowed') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.rpc.mockRejectedValueOnce(new Error('network'))
      expect(await removeEmployeeMembership(form())).toEqual({ ok: false, note: 'Could not save this employee change. Please try again.' })
    } finally { log.mockRestore() }
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
