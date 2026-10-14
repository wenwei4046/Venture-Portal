import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// One screen of the Finance phone app (2026-10-15, README › Motion): a screen
// drawn with a move plays in. React runs a new screen's first effect twice in
// development (StrictMode); the second run used to find the move used up and
// left the screen at opacity 0 — Billing's Calculate came up blank.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/fin-app/daily/billing',
  useSearchParams: () => new URLSearchParams('f=calc'),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame from './FinAppFrame'
import AppScreen from './AppScreen'
import { resetNav, setIntent } from './nav'

afterEach(() => resetNav())

describe('a screen drawn with a move', () => {
  it('plays in, though React runs its first effect twice', async () => {
    setIntent('push')
    const { container } = render(
      <StrictMode>
        <FinAppFrame platform="android" rows={['billing']}>
          <AppScreen screenKey="billing?f=calc" head={{ kind: 'back', title: 'New allocation', backLabel: 'Billing Allocator', onBack: () => {} }}>
            <p>Expense</p>
          </AppScreen>
        </FinAppFrame>
      </StrictMode>,
    )
    await waitFor(() => expect(container.querySelector('[data-anim]')?.getAttribute('data-anim')).toBe('in'))
  })

  it('drawn with no move, stands still', () => {
    const { container } = render(
      <StrictMode>
        <FinAppFrame platform="android" rows={['billing']}>
          <AppScreen screenKey="billing" head={{ kind: 'bare' }} root>
            <p>Hub</p>
          </AppScreen>
        </FinAppFrame>
      </StrictMode>,
    )
    expect(container.querySelector('[data-anim]')).toBeNull()
  })
})
