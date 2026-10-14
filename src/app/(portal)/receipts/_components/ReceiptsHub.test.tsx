import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { withActions } from '@/test/with-actions'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): the ledger's credit
// side, drawn by Payments' hub with Receipt's own first buttons — for whoever
// may make a receipt.

const mocks = vi.hoisted(() => ({ user: null as unknown, load: vi.fn(), hub: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: async () => mocks.user }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('../../payments/_lib/hub-ledger', () => ({ loadHubLedger: mocks.load }))
vi.mock('../../payments/_components/VoucherHub', () => ({
  default: (props: { actions?: ReactNode; ledger: unknown }) => (mocks.hub(props), <div data-testid="hub">{props.actions}</div>),
}))

import ReceiptsHub from './ReceiptsHub'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ receipts: true })
})

describe('ReceiptsHub', () => {
  it('reads the credit side and offers Create receipt and Loan repayment', async () => {
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury'] })
    render(await ReceiptsHub({ params: { status: 'paid' } }))
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), mocks.user, 'credit', { status: 'paid' })
    expect(screen.getByRole('link', { name: 'Create receipt' })).toHaveAttribute('href', '/payments/new?mode=receipt')
    expect(screen.getByRole('link', { name: 'Loan repayment' })).toHaveAttribute('href', '/payments/new?mode=loan_repayment')
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ dept: [], payroll: null, claims: [], canSetDefault: true }))
  })

  it('offers neither to whoever may not make one', async () => {
    mocks.user = { ...withActions({ id: 'v', role: 'staff', permissions: ['treasury'] }), actions: { 'treasury.view': 'all' } }
    render(await ReceiptsHub({ params: {} }))
    expect(screen.queryByRole('link', { name: 'Create receipt' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Loan repayment' })).toBeNull()
  })
})
