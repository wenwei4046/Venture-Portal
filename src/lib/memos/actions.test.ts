import { beforeEach, describe, expect, it, vi } from 'vitest'

// One's own memo, acknowledged with one's own signature (2026-10-20, mig 20261021013000) — every view's writer
// (`my_memo_mark`): refused here without the pad's PNG, sent with it; one's signature read back.

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))

import { markMyMemo, myMemoSignature } from './actions'

const MEMO = '10000000-0000-4000-8000-000000000009'
const PNG = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(400)}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'me', is_active: true })
  mocks.rpc.mockResolvedValue({ data: { readAt: '2026-10-20T03:00:00Z', acknowledgedAt: '2026-10-20T03:01:00Z' }, error: null })
})

describe('markMyMemo', () => {
  it('Acknowledge without a signature is refused before the database is asked', async () => {
    expect(await markMyMemo(MEMO, true)).toEqual({ ok: false, reason: 'Sign in the box before you acknowledge.' })
    expect(await markMyMemo(MEMO, true, 'data:,')).toMatchObject({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('signed, the signature goes with it; opened, none is asked or sent', async () => {
    expect(await markMyMemo(MEMO, true, PNG)).toEqual({ ok: true, readAt: '2026-10-20T03:00:00Z', acknowledgedAt: '2026-10-20T03:01:00Z' })
    expect(mocks.rpc).toHaveBeenCalledWith('my_memo_mark', { p_memo: MEMO, p_ack: true, p_signature: PNG })
    await markMyMemo(MEMO, false, PNG)
    expect(mocks.rpc).toHaveBeenLastCalledWith('my_memo_mark', { p_memo: MEMO, p_ack: false, p_signature: null })
  })

  it('the database’s refusal is said in its words', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Sign in the box before you acknowledge.' } })
    expect(await markMyMemo(MEMO, true, PNG)).toEqual({ ok: false, reason: 'Sign in the box before you acknowledge.' })
  })
})

describe('myMemoSignature', () => {
  it('reads one’s own back — only a signature, never anything else', async () => {
    mocks.rpc.mockResolvedValue({ data: PNG, error: null })
    expect(await myMemoSignature(MEMO)).toBe(PNG)
    expect(mocks.rpc).toHaveBeenCalledWith('my_memo_signature', { p_memo: MEMO })
    mocks.rpc.mockResolvedValue({ data: 'https://example.com/x.png', error: null })
    expect(await myMemoSignature(MEMO)).toBeNull()
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no' } })
    expect(await myMemoSignature(MEMO)).toBeNull()
  })

  it('nobody signed in, or not a memo id: nothing asked', async () => {
    mocks.getUser.mockResolvedValue(null)
    expect(await myMemoSignature(MEMO)).toBeNull()
    mocks.getUser.mockResolvedValue({ id: 'me', is_active: true })
    expect(await myMemoSignature('not-an-id')).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
