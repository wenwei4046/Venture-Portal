import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { User } from '@/types'
import BottomTabBar from './BottomTabBar'

// 2026-10-09 — on the Finance view the tab bar wears the handoff's peach
// pill behind the active tab's icon (the user's Claude Design handoff);
// elsewhere it keeps its accent bar.

vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: vi.fn() }), usePathname: () => '/payments' }))
vi.mock('next/link', async () => {
  const actual = await vi.importActual<typeof import('next/link')>('next/link')
  return { ...actual, useLinkStatus: () => ({ pending: false }) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ then: () => undefined }) }) }) }) }))
vi.mock('@/lib/nav-warm', () => ({ warmRoute: vi.fn() }))

const viewer = { id: 'fm', role: 'finance', name: 'Finance Manager' } as unknown as User

describe('BottomTabBar on the Finance view', () => {
  it('puts a peach pill behind the active tab', () => {
    render(<BottomTabBar role="finance" viewer={viewer} moreOpen={false} onMoreClick={vi.fn()} fin />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toHaveClass('fin-tabbar')
    const active = screen.getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent('Payments')
    expect(active.querySelector('.fin-pill')).not.toBeNull()
    const idle = screen.getByRole('link', { name: /Receipts/ })
    expect(idle.querySelector('.fin-pill')).toBeNull()
  })

  it('keeps its accent bar elsewhere', () => {
    render(<BottomTabBar role="finance" viewer={viewer} moreOpen={false} onMoreClick={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).not.toHaveClass('fin-tabbar')
    expect(document.querySelector('.fin-pill')).toBeNull()
  })
})

// 2026-10-11 — the bar steps out of the way while reading on (components/pwa/tuck.ts), and what sits on it (the
// Finance queue's bulk bar, an HR drawer, a toast) comes down with it through html[data-tabbar-tucked].
describe('BottomTabBar while reading on', () => {
  function windowScroll() {
    let y = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(54)
    const root = document.scrollingElement ?? document.documentElement
    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 3000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 800 })
    return (to: number) => {
      y = to
      act(() => { document.dispatchEvent(new Event('scroll')) })
    }
  }
  afterEach(() => vi.restoreAllMocks())

  it('tucks away on a scroll down, and what sits on it follows', () => {
    const at = windowScroll()
    const { unmount } = render(<BottomTabBar role="finance" viewer={viewer} moreOpen={false} onMoreClick={vi.fn()} fin />)
    at(0)
    at(300)
    const nav = screen.getByRole('navigation', { hidden: true })
    expect(nav).toHaveAttribute('data-tucked')
    expect(nav).toHaveAttribute('inert')
    expect(document.documentElement).toHaveAttribute('data-tabbar-tucked')
    at(250)
    expect(screen.getByRole('navigation', { name: 'Primary' })).not.toHaveAttribute('data-tucked')
    expect(document.documentElement).not.toHaveAttribute('data-tabbar-tucked')
    at(600)
    expect(document.documentElement).toHaveAttribute('data-tabbar-tucked')
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-tabbar-tucked')
  })

  it('stays while the More sheet is open', () => {
    const at = windowScroll()
    render(<BottomTabBar role="finance" viewer={viewer} moreOpen onMoreClick={vi.fn()} />)
    at(0)
    at(300)
    expect(screen.getByRole('navigation', { name: 'Primary' })).not.toHaveAttribute('data-tucked')
    expect(document.documentElement).not.toHaveAttribute('data-tabbar-tucked')
  })
})
