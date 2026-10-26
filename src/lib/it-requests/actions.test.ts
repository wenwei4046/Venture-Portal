import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  account: vi.fn(),
  viewing: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAccountUser: fake.account }))
vi.mock('@/lib/view-as-person', () => ({ viewingAsSomebody: fake.viewing }))
vi.mock('@/lib/supabase/server', () => ({ createClient: fake.client }))
vi.mock('@/lib/push/outbox', () => ({ pushSoon: fake.push }))

import { fetchItDesk, fetchItRequest, fetchMyItRequests, noteItRequest, submitItRequest } from './actions'

const ID = '12345678-1234-1234-1234-123456789012'
const row = { id: ID, ref: 'IT-0001', category: 'bug', status: 'new', mine: true, title: 'Cannot open report' }
const input = { category: 'bug', title: row.title, details: '', files: [], device: 'Desktop' }

beforeEach(() => {
  vi.clearAllMocks()
  // No Revenue portal/profile and no desk permission: ordinary active HR and Finance accounts can submit.
  fake.account.mockResolvedValue({ is_active: true, permissions: [], actions: {} })
  fake.viewing.mockResolvedValue(false)
  fake.client.mockResolvedValue({ rpc: fake.rpc })
  fake.rpc.mockResolvedValue({ data: [row], error: null })
})

describe('account-scoped IT support', () => {
  it('lets an active account without Revenue access read its own requests', async () => {
    expect(await fetchMyItRequests()).toMatchObject({ ok: true, data: [{ id: ID }] })
    expect(fake.rpc).toHaveBeenCalledWith('my_it_requests')
  })

  it.each(['hr', 'finance', 'portal'] as const)('records %s as context without granting desk access', async app => {
    fake.rpc.mockResolvedValue({ data: row, error: null })
    expect(await submitItRequest({ ...input, app })).toMatchObject({ ok: true, data: { id: ID } })
    expect(fake.rpc).toHaveBeenCalledWith('it_request_submit', expect.objectContaining({ p_app: app }))
    expect(fake.push).toHaveBeenCalledOnce()
    expect(await fetchItDesk()).toMatchObject({ ok: false })
    expect(fake.rpc).not.toHaveBeenCalledWith('it_requests_desk')
  })

  it('keeps the Revenue default for existing callers', async () => {
    fake.rpc.mockResolvedValue({ data: row, error: null })
    await submitItRequest(input)
    expect(fake.rpc).toHaveBeenCalledWith('it_request_submit', expect.objectContaining({ p_app: 'revenue' }))
  })

  it('does not read or write for an inactive or missing work account', async () => {
    for (const account of [null, { is_active: false }]) {
      fake.account.mockResolvedValue(account)
      expect(await fetchMyItRequests()).toMatchObject({ ok: false })
      expect(await submitItRequest(input)).toMatchObject({ ok: false })
    }
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('does not expose the real account’s tickets or submit while viewing as another person', async () => {
    fake.viewing.mockResolvedValue(true)
    expect(await fetchMyItRequests()).toMatchObject({ ok: false, error: expect.stringContaining('Read-only') })
    expect(await submitItRequest(input)).toMatchObject({ ok: false, error: expect.stringContaining('Read-only') })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('lets a sender reply but does not let them set status', async () => {
    fake.rpc.mockResolvedValue({ data: row, error: null })
    const reply = { id: ID, body: 'More details', files: [], status: null, current: 'new' as const }
    expect(await noteItRequest(reply)).toMatchObject({ ok: true })
    expect(fake.rpc).toHaveBeenCalledWith('it_request_note', expect.objectContaining({ p_status: null }))
    fake.rpc.mockClear()
    expect(await noteItRequest({ ...reply, status: 'fixed' })).toMatchObject({ ok: false })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  // 2026-10-27: Closed is its sender's, once IT has marked it Fixed — the database asks both.
  it('passes a sender’s Close to the database, which asks that it is theirs and Fixed', async () => {
    fake.rpc.mockResolvedValue({ data: { ...row, status: 'closed' }, error: null })
    expect(await noteItRequest({ id: ID, body: '', files: [], status: 'closed', current: 'fixed' })).toMatchObject({ ok: true, data: { status: 'closed' } })
    expect(fake.rpc).toHaveBeenCalledWith('it_request_note', { p_id: ID, p_body: '', p_files: [], p_status: 'closed' })
    fake.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'It can be closed once IT has marked it Fixed.' } })
    expect(await noteItRequest({ id: ID, body: '', files: [], status: 'closed', current: 'new' }))
      .toEqual({ ok: false, error: 'It can be closed once IT has marked it Fixed.' })
  })

  it('never queries everyone’s requests for an ordinary account opening another sender’s notice', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'That request is not there.' } })
    expect(await fetchItRequest(ID)).toEqual({ ok: false, error: 'That request is not there.' })
    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.rpc).toHaveBeenCalledWith('it_request_get', { p_id: ID })
  })

  it('opens the selected notice for an existing desk reader without subscribing or returning the entire desk', async () => {
    fake.account.mockResolvedValue({ is_active: true, permissions: ['it_requests'], actions: { 'it_requests.view': 'all' } })
    fake.rpc.mockResolvedValue({ data: { ...row, mine: false }, error: null })
    expect(await fetchItRequest(ID)).toMatchObject({ ok: true, data: { id: ID, mine: false } })
    expect(fake.rpc).toHaveBeenCalledWith('it_request_get', { p_id: ID })
    expect(fake.rpc).not.toHaveBeenCalledWith('it_requests_desk')
    expect(fake.rpc).not.toHaveBeenCalledWith('it_desk_listen')
  })

  it('reads an older own request directly, without relying on the recent list', async () => {
    fake.rpc.mockResolvedValue({ data: row, error: null })
    expect(await fetchItRequest(ID)).toMatchObject({ ok: true, data: { id: ID, mine: true } })
    expect(fake.rpc).toHaveBeenCalledOnce()
    expect(fake.rpc).toHaveBeenCalledWith('it_request_get', { p_id: ID })
  })
})
