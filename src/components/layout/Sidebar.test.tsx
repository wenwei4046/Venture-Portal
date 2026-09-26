import type { ComponentPropsWithoutRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prefetch, linkState } = vi.hoisted(() => ({
  prefetch: vi.fn(),
  linkState: { pendingHref: null as string | null },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/hr-costing/payroll',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    prefetch,
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}))

// A plain anchor: Next's <Link> keeps its own (partial, on-hover) prefetch,
// which is not what this test is about. Any prefetch() call seen by the mock
// above comes from the Sidebar itself. `useLinkStatus` answers "pending" for
// the one href the test names, the way Next does for a link just clicked.
vi.mock('next/link', async () => {
  const React = await import('react')
  const LinkStatus = React.createContext({ pending: false })
  return {
    default: ({ href, children, ...rest }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
      <LinkStatus.Provider value={{ pending: href === linkState.pendingHref }}>
        <a href={href} {...rest}>
          {children}
        </a>
      </LinkStatus.Provider>
    ),
    useLinkStatus: () => React.useContext(LinkStatus),
  }
})

import Sidebar from './Sidebar'
import { emptyNavData, type NavViewer } from './nav-config'
import { cancelWarmIntent, RAIL_SETTLE_MS } from '@/lib/nav-warm'

const viewer = { role: 'principal', permissions: [] } as unknown as NavViewer
// Treasury shows Fund IN / OUT; team shows HR Costing and the People pages.
const staffViewer = { role: 'principal', permissions: ['treasury', 'team'] } as unknown as NavViewer

describe('Sidebar', () => {
  beforeEach(() => {
    prefetch.mockReset()
    linkState.pendingHref = null
    window.history.replaceState(null, '', '/hr-costing/payroll')
  })
  afterEach(() => {
    cancelWarmIntent()
    vi.useRealTimers()
  })

  it('does not prefetch routes on mount', () => {
    // 2026-09-09: an on-mount `router.prefetch()` of every visible route was a
    // FULL prefetch — ~24 complete server renders (auth, permissions, each
    // page's own queries) within seconds of every hard load, and any button
    // pressed inside that window queued behind them. Overview is visible to
    // everyone and is not the current path, so the old effect would have
    // prefetched it here.
    render(<Sidebar viewer={viewer} navData={emptyNavData} />)

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/dashboard')
    expect(prefetch).not.toHaveBeenCalled()
  })

  it('warms the one link the pointer settles on', () => {
    vi.useFakeTimers()
    render(<Sidebar viewer={staffViewer} navData={emptyNavData} />)

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Fund IN' }))
    act(() => {
      vi.advanceTimersByTime(RAIL_SETTLE_MS)
    })

    expect(prefetch.mock.calls).toEqual([['/fund-in']])
  })

  it('warms nothing the pointer only passes over', () => {
    vi.useFakeTimers()
    render(<Sidebar viewer={staffViewer} navData={emptyNavData} />)

    const link = screen.getByRole('link', { name: 'Fund OUT' })
    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)
    act(() => {
      vi.advanceTimersByTime(RAIL_SETTLE_MS * 3)
    })

    expect(prefetch).not.toHaveBeenCalled()
  })

  it('never warms the staff directory, whose render writes the audit log', () => {
    vi.useFakeTimers()
    render(<Sidebar viewer={staffViewer} navData={emptyNavData} />)

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'People Management' }))
    act(() => {
      vi.advanceTimersByTime(RAIL_SETTLE_MS * 3)
    })

    expect(prefetch).not.toHaveBeenCalled()
  })

  it('lights a clicked row before its page commits, and marks the current page', () => {
    linkState.pendingHref = '/fund-in'
    render(<Sidebar viewer={staffViewer} navData={emptyNavData} />)

    const clicked = screen.getByRole('link', { name: 'Fund IN' })
    expect(clicked.firstElementChild).toHaveClass('bg-accent-bg', 'text-accent', 'nav-row-pending')
    expect(clicked).not.toHaveAttribute('aria-current')

    const idle = screen.getByRole('link', { name: 'Fund OUT' })
    expect(idle.firstElementChild).not.toHaveClass('bg-accent-bg')
    expect(idle.firstElementChild).not.toHaveClass('nav-row-pending')

    expect(screen.getByRole('link', { name: 'Payroll' })).toHaveAttribute('aria-current', 'page')
  })
})
