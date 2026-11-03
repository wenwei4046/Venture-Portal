import type { ComponentPropsWithoutRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'

// 2026-10-10 — a row's page that belongs to another list than its path says
// (the user's Claude Design handoff; user: 做完他): a receipt opens at
// /payments/<id> but is Receipt's, so on the Finance view the phone's top bar
// names it Receipt and the tab bar and the sidebar light Receipt(s), not
// Payments. Nothing changes off the Finance view, or once the page has gone.

vi.mock('next/navigation', () => ({
  usePathname: () => '/payments/v1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', async () => ({
  default: ({ href, children, ...rest }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: async () => undefined },
    from: () => ({ select: () => ({ eq: () => ({ then: () => undefined }) }) }),
  }),
}))
vi.mock('@/lib/nav-warm', async (orig) => ({ ...(await orig<object>()), warmRoute: vi.fn() }))
vi.mock('./ThemeToggle', () => ({ default: () => <span>theme</span> }))
vi.mock('./PortalViewSwitcher', () => ({ default: () => <span>switch</span> }))

import { FinViewProvider } from './fin-view'
import { NavOwner } from './nav-owner'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import Sidebar from './Sidebar'
import { emptyNavData, type NavViewer } from './nav-config'

const user = { id: 'fm', role: 'finance', name: 'Finance Manager', email: 'f@x', permissions: ['treasury'] } as unknown as User
const viewer = user as unknown as NavViewer
const receipt = <NavOwner href="/receipts" title="Receipt" />

describe('a receipt, on the Finance view', () => {
  it('names the phone’s top bar Receipt', () => {
    render(
      <FinViewProvider value>
        {receipt}
        <TopBar user={user} fin />
      </FinViewProvider>,
    )
    const bar = screen.getByTestId('fin-topbar')
    expect(bar).toHaveTextContent('Receipt')
    expect(bar).not.toHaveTextContent('Payments')
  })

  it('lights Receipts on the phone’s tab bar', () => {
    render(
      <FinViewProvider value>
        {receipt}
        <BottomTabBar role="finance" viewer={user} moreOpen={false} onMoreClick={vi.fn()} fin />
      </FinViewProvider>,
    )
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Receipts')
  })

  it('lights Receipt in the sidebar', () => {
    render(
      <FinViewProvider value>
        {receipt}
        <Sidebar viewer={viewer} navData={emptyNavData} />
      </FinViewProvider>,
    )
    expect(screen.getByRole('link', { name: 'Receipt' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Payments' })).not.toHaveAttribute('aria-current')
  })

  it('lets go once the page has gone', () => {
    const { rerender } = render(
      <FinViewProvider value>
        {receipt}
        <TopBar user={user} fin />
      </FinViewProvider>,
    )
    rerender(
      <FinViewProvider value>
        <TopBar user={user} fin />
      </FinViewProvider>,
    )
    expect(screen.getByTestId('fin-topbar')).toHaveTextContent('Payment voucher')
  })
})

describe('a receipt, off the Finance view', () => {
  it('changes nothing', () => {
    render(
      <FinViewProvider value={false}>
        {receipt}
        <BottomTabBar role="finance" viewer={user} moreOpen={false} onMoreClick={vi.fn()} />
      </FinViewProvider>,
    )
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Payments')
  })
})
