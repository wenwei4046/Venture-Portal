import type { ComponentPropsWithoutRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { prefetch } = vi.hoisted(() => ({ prefetch: vi.fn() }))

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
// above comes from the Sidebar itself.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import Sidebar from './Sidebar'
import { emptyNavData, type NavViewer } from './nav-config'

describe('Sidebar', () => {
  it('does not prefetch routes on mount', () => {
    // 2026-09-09: an on-mount `router.prefetch()` of every visible route was a
    // FULL prefetch — ~24 complete server renders (auth, permissions, each
    // page's own queries) within seconds of every hard load, and any button
    // pressed inside that window queued behind them. Overview is visible to
    // everyone and is not the current path, so the old effect would have
    // prefetched it here.
    const viewer = { role: 'principal', permissions: [] } as unknown as NavViewer
    render(<Sidebar viewer={viewer} navData={emptyNavData} />)

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/dashboard')
    expect(prefetch).not.toHaveBeenCalled()
  })
})
