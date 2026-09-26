import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { visibleSkeletons } from '@/lib/nav-progress'

const nav = vi.hoisted(() => ({ pathname: '/fund-in' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}))

import RouteSkeleton from './RouteSkeleton'

describe('RouteSkeleton', () => {
  beforeEach(() => {
    nav.pathname = '/fund-in'
  })

  it('draws the shape of the page that is coming', () => {
    nav.pathname = '/fund-in/new'
    const { container } = render(<RouteSkeleton />)
    expect(container.querySelector('.route-skeleton')).toHaveAttribute('data-variant', 'form')
  })

  it('announces itself and uses the real header geometry', () => {
    const { container } = render(<RouteSkeleton />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading…')).toHaveClass('sr-only')
    expect(container.querySelector('.page-head')).not.toBeNull()
    expect(container.querySelector('.sect-head')).not.toBeNull()
  })

  it('counts itself in for as long as it is on screen', () => {
    const before = visibleSkeletons()
    const { unmount } = render(<RouteSkeleton />)
    expect(visibleSkeletons()).toBe(before + 1)
    unmount()
    expect(visibleSkeletons()).toBe(before)
  })
})
