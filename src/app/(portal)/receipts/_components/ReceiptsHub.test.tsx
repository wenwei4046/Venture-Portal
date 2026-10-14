import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): the ledger's credit
// side, drawn by Payments' hub with Receipt's own first buttons — for whoever
// may make a receipt.

const mocks = vi.hoisted(() => ({ user: null as unknown, load: vi.fn(), hub: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: async () => mocks.user }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('../../payments/_lib/hub-ledger', () => ({ loadHubLedger: mocks.load }))
vi.mock('./ReceiptsHubClient', () => ({
  default: (props: { canCreate: boolean; prefix: string; today: string }) => (mocks.hub(props), <div data-testid="hub">{props.canCreate ? 'can create' : 'cannot'}</div>),
}))

import ReceiptsHub from './ReceiptsHub'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ receipts: true })
})

describe('ReceiptsHub', () => {
  it('reads the credit side, for whoever may make a receipt: its line HV-OR-202610 and the office’s today', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T07:00:00Z'), toFake: ['Date'] })
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury'] })
    render(await ReceiptsHub({ params: { status: 'paid' } }))
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), mocks.user, 'credit', { status: 'paid' })
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ canCreate: true, canSetDefault: true, prefix: 'HV-OR-202610', today: '2026-10-14' }))
    vi.useRealTimers()
  })

  it('offers neither to whoever may not make one', async () => {
    mocks.user = { ...withActions({ id: 'v', role: 'staff', permissions: ['treasury'] }), actions: { 'treasury.view': 'all' } }
    render(await ReceiptsHub({ params: {} }))
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ canCreate: false }))
  })
})
