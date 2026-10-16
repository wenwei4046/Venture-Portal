import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-17 — the Principal's own view on a phone opens the Finance app (the user: "the mobile use the same view
// with finance app … just add on then tab for approval tab"): a sixth tab, Approvals, after the Overview, badged
// with what waits for their decision; a tab root's kicker names the view.

const nav = vi.hoisted(() => ({ pathname: '/fin-app', search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame, { isRootScreen } from './FinAppFrame'
import AppScreen from './AppScreen'
import { resetNav } from './nav'

afterEach(() => {
  resetNav()
  nav.pathname = '/fin-app'
  nav.search = ''
})

const ROWS = ['approvals', 'payments', 'receipts', 'fund-out', 'pnl']
const tabNames = () => within(screen.getByRole('navigation', { name: 'Finance' })).getAllByRole('link').map((a) => a.textContent)

describe('the Finance app’s tab bar', () => {
  it('keeps Finance’s five tabs for Finance’s view', () => {
    render(
      <FinAppFrame platform="android" rows={ROWS}>
        <AppScreen screenKey="/fin-app" head={{ kind: 'root', title: 'Overview' }} root>
          <p>Home</p>
        </AppScreen>
      </FinAppFrame>,
    )
    expect(tabNames()).toEqual(['Overview', 'Daily', 'Fund', 'Report', 'Profile'])
    expect(screen.getByText('HOUZS Venture · Finance')).toBeInTheDocument()
  })

  it('adds Approvals after the Overview for the Principal’s own view, badged with what waits', () => {
    render(
      <FinAppFrame platform="ios" rows={ROWS} view="principal" approvals={{ waiting: 7 }}>
        <AppScreen screenKey="/fin-app" head={{ kind: 'root', title: 'Overview' }} root>
          <p>Home</p>
        </AppScreen>
      </FinAppFrame>,
    )
    expect(tabNames()).toEqual(['Overview', '7Approvals', 'Daily', 'Fund', 'Report', 'Profile'])
    const tab = within(screen.getByRole('navigation', { name: 'Finance' })).getAllByRole('link')[1]
    expect(tab).toHaveAttribute('href', '/fin-app/approvals')
    expect(within(tab).getByLabelText('7 waiting')).toBeInTheDocument()
    expect(screen.getByText('HOUZS Venture · Principal')).toBeInTheDocument()
  })

  it('draws no badge when nothing waits, and lights the tab on its own root', () => {
    nav.pathname = '/fin-app/approvals'
    render(
      <FinAppFrame platform="android" rows={ROWS} view="principal" approvals={{ waiting: 0 }}>
        <AppScreen screenKey="/fin-app/approvals" head={{ kind: 'root', title: 'Approvals' }} root>
          <p>Queue</p>
        </AppScreen>
      </FinAppFrame>,
    )
    const tab = within(screen.getByRole('navigation', { name: 'Finance' })).getAllByRole('link')[1]
    expect(tab).toHaveTextContent(/^Approvals$/)
    expect(tab).toHaveAttribute('aria-current', 'page')
  })

  it('hides the bar over a combined approval as over a list or a record', () => {
    const q = (s: string) => new URLSearchParams(s)
    expect(isRootScreen('/fin-app/approvals', q(''))).toBe(true)
    expect(isRootScreen('/fin-app/approvals', q('f=pending'))).toBe(false)
    expect(isRootScreen('/fin-app/approvals', q('g=abc&from=pending'))).toBe(false)
    expect(isRootScreen('/fin-app/approvals', q('id=abc'))).toBe(false)
    expect(isRootScreen('/fin-app/page/approvals', q(''))).toBe(false)
  })
})
