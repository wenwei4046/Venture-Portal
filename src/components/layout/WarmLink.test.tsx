import type { ComponentPropsWithoutRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prefetch, linkState } = vi.hoisted(() => ({
  prefetch: vi.fn(),
  linkState: { pendingHref: null as string | null },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch,
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}))

// A plain anchor, as in Sidebar.test.tsx: any prefetch() the mock above sees
// comes from WarmLink itself, and `useLinkStatus` answers "pending" for the
// one href the test names, the way Next does for a link just clicked.
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

import WarmLink from './WarmLink'
import { cancelWarmIntent, INTENT_MS } from '@/lib/nav-warm'

const JULY = '/hr-costing/payment?period=2026-07-01'
const AUGUST = '/hr-costing/payment?period=2026-08-01'

describe('WarmLink', () => {
  beforeEach(() => {
    prefetch.mockReset()
    linkState.pendingHref = null
    window.history.replaceState(null, '', AUGUST)
  })
  afterEach(() => {
    cancelWarmIntent()
    vi.useRealTimers()
  })

  it('renders the month the pointer rests on before it is clicked', () => {
    vi.useFakeTimers()
    render(<WarmLink href={JULY}>Jul</WarmLink>)

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Jul' }))
    act(() => {
      vi.advanceTimersByTime(INTENT_MS)
    })

    expect(prefetch.mock.calls).toEqual([[JULY]])
  })

  it('warms nothing the pointer only passes over', () => {
    vi.useFakeTimers()
    render(<WarmLink href={JULY}>Jul</WarmLink>)

    const link = screen.getByRole('link', { name: 'Jul' })
    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)
    act(() => {
      vi.advanceTimersByTime(INTENT_MS * 3)
    })

    expect(prefetch).not.toHaveBeenCalled()
  })

  it('does not warm the month already on screen', () => {
    vi.useFakeTimers()
    render(<WarmLink href={AUGUST}>Aug</WarmLink>)

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Aug' }))
    act(() => {
      vi.advanceTimersByTime(INTENT_MS * 3)
    })

    expect(prefetch).not.toHaveBeenCalled()
  })

  it("keeps the caller's class and hover handlers", () => {
    vi.useFakeTimers()
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()
    render(
      <WarmLink href={JULY} className="funded" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        Jul
      </WarmLink>,
    )

    const link = screen.getByRole('link', { name: 'Jul' })
    expect(link).toHaveClass('warm-link', 'funded')
    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)

    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    expect(onMouseLeave).toHaveBeenCalledTimes(1)
  })

  it('sweeps a light across itself while its page is on the way', () => {
    linkState.pendingHref = JULY
    const { container } = render(
      <>
        <WarmLink href={JULY}>Jul</WarmLink>
        <WarmLink href={AUGUST}>Aug</WarmLink>
      </>,
    )

    const sweeps = container.querySelectorAll('.warm-link-pending')
    expect(sweeps).toHaveLength(1)
    expect(sweeps[0]).toHaveClass('nav-row-pending')
    expect(sweeps[0]).toHaveAttribute('aria-hidden')
    expect(screen.getByRole('link', { name: 'Jul' })).toContainElement(sweeps[0] as HTMLElement)
  })
})
