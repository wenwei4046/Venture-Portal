import { beforeEach, describe, expect, it, vi } from 'vitest'

// The applicant's drawer on Sales Groups › Waiting list, edited (2026-10-20, the user: "要能够按 Edit：这个 Edit 本身是让
// HR 可以去改资料的"): the gate "+" asks, only the fields the drawer changed, each in the request's own words for
// member_waiting_edit. The database's half is mig 20261020210000 (tests/member-sql/validate-waiting-edit.mjs).

const mocks = vi.hoisted(() => ({ auth: vi.fn(), action: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth, requireActionOn: mocks.action }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('./_lib/waiting-form', () => ({ loadMemberForm: vi.fn() }))

import { editWaitingApplicant } from './waiting-actions'

const HR = '7f3c2a10-1b2c-4d5e-8f90-112233445566'
const JOAN = '0d2e4f60-7a8b-4c9d-8e0f-a1b2c3d4e5f6'
const KRIS = '7b6f1f0e-2a8d-4b1a-9a52-5c8a1e2b3c4d'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.action.mockResolvedValue({ id: HR, permissions: ['member_requests_manage'] })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: { id: JOAN, changed: ['phone number'] }, error: null })
})

describe('editWaitingApplicant', () => {
  it('asks "+"’s gate, then sends only the changed fields in the request’s own words', async () => {
    const done = await editWaitingApplicant(JOAN, { contact: ' 018-776-0021 ', submittedBy: KRIS })
    expect(done).toEqual({ ok: true })
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith('/revenue/[sub]/hierarchy', 'member', 'manage')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('member_waiting_edit', { p_request: JOAN, p_changes: { contact: '018-776-0021', staffId: KRIS } })
    expect(mocks.refresh).toHaveBeenCalledWith('/revenue', 'layout')
  })

  it('needs the waiting list’s key as well as Member services · Edit', async () => {
    mocks.action.mockResolvedValue({ id: HR, permissions: ['member_requests'] })
    expect(await editWaitingApplicant(JOAN, { contact: '011' })).toEqual({ ok: false, reason: 'The waiting list needs HR request management access.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses what the drawer would never send before asking the database', async () => {
    for (const [request, raw, reason] of [
      ['not-an-id', { contact: '011' }, 'Reload the page and try again.'],
      [JOAN, { contact: 11 }, 'Reload the page and try again.'],
      [JOAN, null, 'Reload the page and try again.'],
      [JOAN, {}, 'Nothing has changed.'],
      [JOAN, { name: '  ' }, 'Fill in new member name.'],
      [JOAN, { start: 'tomorrow' }, 'Pick the joining date.'],
      [JOAN, { submittedBy: 'KRIS' }, 'Reload the page and try again.'],
    ] as const) {
      expect(await editWaitingApplicant(request, raw)).toEqual({ ok: false, reason })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('hands back the database’s own words for a refusal, never a throw', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'This applicant is no longer on the waiting list. Reload the page.' } })
    expect(await editWaitingApplicant(JOAN, { contact: '011' })).toEqual({ ok: false, reason: 'This applicant is no longer on the waiting list. Reload the page.' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'HR management access is required' } })
    expect(await editWaitingApplicant(JOAN, { contact: '011' })).toEqual({ ok: false, reason: 'The waiting list needs HR request management access.' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    expect(await editWaitingApplicant(JOAN, { contact: '011' })).toEqual({ ok: false, reason: 'Their details could not be saved. Please try again.' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
