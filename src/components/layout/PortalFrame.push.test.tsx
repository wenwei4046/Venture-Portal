import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types'

// 2026-10-16 — the user's iPhone opened the Principal's own view, the portal, which had no way to turn phone
// notifications on: the phone was never asked, the app never showed in Settings › Notifications, and nothing could
// reach it. The portal's phone face asks on the first open and keeps a switch in More — on a phone, never while
// viewing as a person (read-only), never on a computer.

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('./Sidebar', () => ({ default: () => <aside>sidebar</aside> }))
vi.mock('./TopBar', () => ({ default: () => <div /> }))
vi.mock('./BottomTabBar', () => ({ default: () => <nav /> }))
vi.mock('./MoreSheet', () => ({ default: (p: { push?: boolean }) => <div data-testid="more" data-push={String(!!p.push)} /> }))
vi.mock('@/components/pwa/PortalPushAsk', () => ({ default: () => <div data-testid="push-ask" /> }))
vi.mock('@/components/BackToTop', () => ({ default: () => null }))
vi.mock('./useViewAsSync', () => ({ useViewAsSync: () => undefined }))
vi.mock('@/lib/page-view', () => ({ logPageView: () => undefined }))
vi.mock('@/lib/selection-store', () => ({ dropSelectionsForPath: () => undefined }))
vi.mock('./RouteFreshener', () => ({ default: () => null }))
vi.mock('./HrSidebar', () => ({ default: () => <aside>hr sidebar</aside> }))
vi.mock('./FinSidebar', () => ({ default: () => <aside>fin sidebar</aside> }))
vi.mock('./HrTopBar', () => ({ default: () => <div /> }))
vi.mock('@/components/finv/Toast', () => ({ FinToastHost: () => null }))

import PortalFrame from './PortalFrame'

const user = (role: string, more: Partial<User> = {}) => ({ id: 'u', role, name: 'Someone', email: 'x@y', ...more }) as unknown as User
const navData = { revenueSubDepts: [] } as unknown as Parameters<typeof PortalFrame>[0]['navData']

describe('PortalFrame and this phone’s notifications', () => {
  it('on a phone: the first open’s question, and More’s switch', () => {
    render(<PortalFrame user={user('principal')} navData={navData} phone><span /></PortalFrame>)
    expect(screen.getByTestId('push-ask')).toBeInTheDocument()
    expect(screen.getByTestId('more')).toHaveAttribute('data-push', 'true')
  })

  it('in HR’s view on a phone too — the HR app is where it opens, but whoever stays on the portal is asked here', () => {
    render(<PortalFrame user={user('hr')} navData={navData} phone><span /></PortalFrame>)
    expect(screen.getByTestId('push-ask')).toBeInTheDocument()
    expect(screen.getByTestId('more')).toHaveAttribute('data-push', 'true')
  })

  it('never on a computer', () => {
    render(<PortalFrame user={user('principal')} navData={navData}><span /></PortalFrame>)
    expect(screen.queryByTestId('push-ask')).toBeNull()
    expect(screen.getByTestId('more')).toHaveAttribute('data-push', 'false')
  })

  it('never while viewing as a person — that portal is read-only and not theirs', () => {
    render(<PortalFrame user={user('principal', { viewingAs: { name: 'Kar Jun' } } as Partial<User>)} navData={navData} phone><span /></PortalFrame>)
    expect(screen.queryByTestId('push-ask')).toBeNull()
    expect(screen.getByTestId('more')).toHaveAttribute('data-push', 'false')
  })
})
