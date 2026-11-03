import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { User } from '@/types'

// The Finance sidebar asks how many requests wait for Finance's voucher after it is drawn, and again on each page, so a
// voucher made drains the count (2026-11-03). Only where the account sees Payment request at all.

const mocks = vi.hoisted(() => ({ count: vi.fn(), pathname: '/payments', hideRequests: false }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('@/app/(portal)/payments/requests/waiting-count', () => ({ waitingRequestCount: mocks.count }))
// The account menu's windows call the account's server actions; nothing here opens them.
vi.mock('./AccountMenu', () => ({ AccountMenu: () => null, ChangePasswordDialog: () => null, SignOutDialog: () => null }))
vi.mock('./ViewSidebar', () => ({
  default: (p: { counts?: Record<string, number> }) => <div data-testid="counts">{JSON.stringify(p.counts ?? null)}</div>,
}))
vi.mock('./hr-nav', async (orig) => {
  const real = await orig<typeof import('./hr-nav')>()
  return {
    ...real,
    // Every row shows, as for an account with every tab — less Payment request where a test takes it away.
    visibleHrNav: (sections: import('./hr-nav').HrNavSection[]) =>
      sections.map((s) => ({ ...s, roman: null, items: s.items.filter((i) => !(mocks.hideRequests && i.key === 'payment-requests')) })),
  }
})

import FinSidebar from './FinSidebar'

const user = { id: 'u', role: 'finance', name: 'Finance', email: 'f@x', permissions: ['treasury'] } as unknown as User
const navData = { revenueSubDepts: [] } as unknown as Parameters<typeof FinSidebar>[0]['navData']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = '/payments'
  mocks.hideRequests = false
})

describe('the Finance sidebar’s count on Payment request', () => {
  it('asks after it is drawn and hands the number to the row', async () => {
    mocks.count.mockResolvedValue(3)
    render(<FinSidebar user={user} navData={navData} initialCollapsed={false} />)
    expect(await screen.findByText('{"payment-requests":3}')).toBeInTheDocument()
    expect(mocks.count).toHaveBeenCalledTimes(1)
  })

  it('asks again on another page, and shows nothing once nothing waits', async () => {
    mocks.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    const { rerender } = render(<FinSidebar user={user} navData={navData} initialCollapsed={false} />)
    expect(await screen.findByText('{"payment-requests":2}')).toBeInTheDocument()
    mocks.pathname = '/payments/abc'
    rerender(<FinSidebar user={user} navData={navData} initialCollapsed={false} />)
    expect(await screen.findByText('null')).toBeInTheDocument()
    expect(mocks.count).toHaveBeenCalledTimes(2)
  })

  it('does not ask where the account does not see Payment request', async () => {
    mocks.hideRequests = true
    render(<FinSidebar user={user} navData={navData} initialCollapsed={false} />)
    await act(async () => undefined)
    expect(mocks.count).not.toHaveBeenCalled()
    expect(screen.getByTestId('counts')).toHaveTextContent('null')
  })
})
