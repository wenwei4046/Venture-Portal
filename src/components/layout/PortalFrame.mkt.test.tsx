import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types'

// 2026-10-23 — Marketing's own view (the Claude Design handoff "HOUZS Marketing Module Setup"): PortalFrame draws
// Marketing's shell for the Principal's Marketing lens and for an account whose template opens Marketing's view, on a
// computer. A phone keeps the portal's phone shell (Marketing's app comes later); HR, Finance and a plain member of
// staff keep theirs.

vi.mock('next/navigation', () => ({ usePathname: () => '/marketing' }))
vi.mock('./Sidebar', () => ({ default: () => <aside>sidebar</aside> }))
vi.mock('./TopBar', () => ({ default: () => <div data-testid="topbar" /> }))
vi.mock('./BottomTabBar', () => ({ default: () => <nav data-testid="tabbar" /> }))
vi.mock('./MoreSheet', () => ({ default: () => null }))
vi.mock('@/components/BackToTop', () => ({ default: () => null }))
vi.mock('./useViewAsSync', () => ({ useViewAsSync: () => undefined }))
vi.mock('@/lib/page-view', () => ({ logPageView: () => undefined }))
vi.mock('@/lib/selection-store', () => ({ dropSelectionsForPath: () => undefined }))
vi.mock('./FinSwipeBack', () => ({ default: () => null }))
vi.mock('./FinScrollMemory', () => ({ default: () => null }))
vi.mock('./RouteFreshener', () => ({ default: () => null }))
vi.mock('./HrSidebar', () => ({ default: () => <aside>hr sidebar</aside> }))
vi.mock('./FinSidebar', () => ({ default: () => <aside>fin sidebar</aside> }))
vi.mock('./HrTopBar', () => ({ default: (p: { viewLabel?: string }) => <div data-testid="hr-topbar">{p.viewLabel}</div> }))
vi.mock('@/components/finv/Toast', () => ({ FinToastHost: () => null }))
vi.mock('@/components/pwa/PortalPushAsk', () => ({ default: () => null }))
vi.mock('@/components/mkt/shell/MktShell', () => ({
  default: (p: { initialCollapsed: boolean; initialLook: { size: string }; navUser: User; children: React.ReactNode }) => (
    <div data-testid="mkt-shell" data-folded={String(p.initialCollapsed)} data-size={p.initialLook.size} data-tabs={(p.navUser.tabs ?? []).join(' ')}>
      {p.children}
    </div>
  ),
}))

import PortalFrame from './PortalFrame'

const navData = { revenueSubDepts: [] } as unknown as Parameters<typeof PortalFrame>[0]['navData']
const person = (role: string, tabs?: string[], extra: Partial<User> = {}) =>
  ({ id: 'u', role, name: 'Someone', email: 'x@y', tabs, ...extra }) as unknown as User

describe('PortalFrame and Marketing’s view', () => {
  it('draws Marketing’s shell for a template that opens Marketing’s view, with its fold and Appearance', () => {
    render(
      <PortalFrame user={person('staff', ['mkt.overview.view', 'mkt.calendar.view'])} navData={navData} mktNavCollapsed mktLook={{ size: 'L', font: 'Nunito', density: 'compact' }}>
        <span>page</span>
      </PortalFrame>,
    )
    const shell = screen.getByTestId('mkt-shell')
    expect(shell).toHaveAttribute('data-folded', 'true')
    expect(shell).toHaveAttribute('data-size', 'L')
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(screen.queryByText('sidebar')).toBeNull()
    expect(screen.queryByTestId('hr-topbar')).toBeNull()
  })

  it('draws it for the Principal’s Marketing lens, the rows its tabs open', () => {
    const lens = person('marketing', ['mkt.overview.view', 'hr.overview.view'], { lens: 'marketing', actualRole: 'principal' } as Partial<User>)
    render(<PortalFrame user={lens} navData={navData}><span>page</span></PortalFrame>)
    expect(screen.getByTestId('mkt-shell')).toHaveAttribute('data-tabs', 'mkt.overview.view')
  })

  it('keeps the portal’s phone shell on a phone', () => {
    render(<PortalFrame user={person('staff', ['mkt.overview.view'])} navData={navData} phone><span>page</span></PortalFrame>)
    expect(screen.queryByTestId('mkt-shell')).toBeNull()
    expect(screen.getByTestId('tabbar')).toBeInTheDocument()
  })

  it('never for a plain member of staff, HR or Finance', () => {
    for (const u of [person('staff', ['dept.overview.view']), person('hr', ['mkt.overview.view']), person('finance')]) {
      const { unmount } = render(<PortalFrame user={u} navData={navData}><span>page</span></PortalFrame>)
      expect(screen.queryByTestId('mkt-shell')).toBeNull()
      unmount()
    }
  })
})
