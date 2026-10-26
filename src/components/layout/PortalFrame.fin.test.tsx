import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types'
import { useFinView } from './fin-view'

// 2026-10-09 — PortalFrame marks the Finance view (the user's Claude Design
// handoff): Finance's pages as Finance or the Principal sees them get
// `.fin-view` on the sheet frame, the English-speaking shared components
// through FinViewProvider, and the phone's Finance chrome. HR's pages do not.

const nav = vi.hoisted(() => ({ pathname: '/payments' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
// Lead View's faces come from next/font, which only the Next build provides.
vi.mock('./lead-fonts', () => ({ lora: { variable: '' }, cormorant: { variable: '' } }))
vi.mock('./Sidebar', () => ({ default: () => <aside>sidebar</aside> }))
vi.mock('./TopBar', () => ({ default: (p: { fin?: boolean }) => <div data-testid="topbar" data-fin={String(!!p.fin)} /> }))
vi.mock('./BottomTabBar', () => ({ default: (p: { fin?: boolean }) => <nav data-testid="tabbar" data-fin={String(!!p.fin)} /> }))
vi.mock('./MoreSheet', () => ({ default: () => null }))
vi.mock('@/components/BackToTop', () => ({ default: () => null }))
vi.mock('./useViewAsSync', () => ({ useViewAsSync: () => undefined }))
vi.mock('@/lib/page-view', () => ({ logPageView: () => undefined }))
vi.mock('@/lib/selection-store', () => ({ dropSelectionsForPath: () => undefined }))
vi.mock('./FinSwipeBack', () => ({ default: () => <span data-testid="swipe" /> }))
vi.mock('./FinScrollMemory', () => ({ default: () => <span data-testid="scroll-memory" /> }))
vi.mock('./RouteFreshener', () => ({ default: () => null }))
vi.mock('./HrSidebar', () => ({ default: () => <aside>hr sidebar</aside> }))
vi.mock('./FinSidebar', () => ({ default: (p: { principal?: boolean }) => <aside>{p.principal ? 'principal fin sidebar' : 'fin sidebar'}</aside> }))
vi.mock('./HrTopBar', () => ({ default: (p: { viewLabel?: string }) => <div data-testid="hr-topbar">{p.viewLabel}</div> }))
vi.mock('@/components/mkt/shell/MktShell', () => ({ default: (p: { children: React.ReactNode }) => <div data-testid="mkt-shell">{p.children}</div> }))
vi.mock('@/components/finv/Toast', () => ({ FinToastHost: () => <span data-testid="fin-toast" /> }))

import PortalFrame from './PortalFrame'

function Probe() {
  return <span data-testid="probe">{String(useFinView())}</span>
}
const user = (role: string) => ({ id: 'u', role, name: 'Someone', email: 'x@y' }) as unknown as User
const navData = { revenueSubDepts: [] } as unknown as Parameters<typeof PortalFrame>[0]['navData']

beforeEach(() => {
  nav.pathname = '/payments'
})

describe('PortalFrame and the Finance view', () => {
  it('marks Finance’s pages for Finance on a phone: the frame, the provider, the phone chrome, the scroll memory', () => {
    render(<PortalFrame user={user('finance')} navData={navData} phone><Probe /></PortalFrame>)
    expect(document.querySelector('.sheet-frame')).toHaveClass('fin-view')
    expect(screen.getByTestId('probe')).toHaveTextContent('true')
    expect(screen.getByTestId('topbar')).toHaveAttribute('data-fin', 'true')
    expect(screen.getByTestId('tabbar')).toHaveAttribute('data-fin', 'true')
    expect(screen.getByTestId('scroll-memory')).toBeInTheDocument()
    expect(screen.queryByTestId('swipe')).toBeNull() // a list, not a detail page
    expect(document.querySelector('.hrv-shell')).toBeNull()
  })

  it('draws Finance’s own shell on a computer (2026-10-14): HR’s sidebar and bar with Finance’s categories, the sheet in its frame', () => {
    render(<PortalFrame user={user('finance')} navData={navData}><Probe /></PortalFrame>)
    expect(document.querySelector('.hrv-shell')).toHaveClass('fin-shell')
    expect(screen.getByText('fin sidebar')).toBeInTheDocument()
    expect(screen.queryByText('hr sidebar')).toBeNull()
    expect(screen.getByTestId('hr-topbar')).toHaveTextContent('Finance view')
    expect(document.querySelector('.hrv-frame')).toHaveClass('fin-view')
    expect(document.querySelector('main.hrv-sheet')).toHaveClass('fin-sheet', 'sheet-theme')
    expect(document.querySelector('.sheet-frame')).toBeNull()
    expect(screen.getByTestId('probe')).toHaveTextContent('true')
    expect(screen.getByTestId('scroll-memory')).toBeInTheDocument()
    expect(screen.getByTestId('fin-toast')).toBeInTheDocument()
  })

  // 2026-10-17 — the user: "revamp the principle desktop view, take the same totally view with finance. no need
  // show hr, cause can switch view to hr".
  it('draws the Principal’s own view in Finance’s shell, its own rows added, named Principal view', () => {
    const principal = { ...user('principal'), permissions: ['treasury', 'approvals', 'view_switch'] } as unknown as User
    render(<PortalFrame user={principal} navData={navData}><Probe /></PortalFrame>)
    expect(document.querySelector('.hrv-shell')).toHaveClass('fin-shell')
    expect(screen.getByText('principal fin sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('hr-topbar')).toHaveTextContent('Principal view')
    expect(document.querySelector('.hrv-frame')).toHaveClass('fin-view')
    expect(screen.getByTestId('probe')).toHaveTextContent('true')
  })

  it('keeps a Principal kind that may not switch views in the portal’s own shell — HR’s pages are listed there', () => {
    render(<PortalFrame user={user('principal')} navData={navData}><Probe /></PortalFrame>)
    expect(document.querySelector('.hrv-shell')).toBeNull()
    expect(document.querySelector('.sheet-frame')).toHaveClass('fin-view')
    expect(screen.queryByText(/fin sidebar/)).toBeNull()
  })

  it('wears Finance’s shell off Finance’s pages too, without .fin-view (Meeting Rooms from the account menu)', () => {
    nav.pathname = '/admin/rooms'
    render(<PortalFrame user={user('finance')} navData={navData}><Probe /></PortalFrame>)
    expect(document.querySelector('.hrv-shell')).toHaveClass('fin-shell')
    expect(document.querySelector('.fin-view')).toBeNull()
    expect(screen.getByTestId('probe')).toHaveTextContent('false')
  })

  it('mounts the edge swipe on a detail page', () => {
    nav.pathname = '/payments/v1'
    render(<PortalFrame user={user('principal')} navData={navData}><Probe /></PortalFrame>)
    expect(screen.getByTestId('swipe')).toBeInTheDocument()
  })

  it('leaves HR’s view alone — it has a shell of its own (2026-10-10)', () => {
    nav.pathname = '/hr-costing'
    render(<PortalFrame user={user('hr')} navData={navData}><Probe /></PortalFrame>)
    expect(document.querySelector('.hrv-shell')).not.toBeNull()
    expect(document.querySelector('main.hrv-sheet')).toHaveClass('sheet-theme')
    expect(document.querySelector('[data-hrv-overlay]')).not.toBeNull()
    expect(document.querySelector('.fin-view')).toBeNull()
    expect(screen.getByTestId('hr-topbar')).toBeInTheDocument()
    expect(screen.getByTestId('probe')).toHaveTextContent('false')
    expect(screen.getByTestId('topbar')).toHaveAttribute('data-fin', 'false')
    expect(screen.queryByTestId('scroll-memory')).toBeNull()
  })
})
