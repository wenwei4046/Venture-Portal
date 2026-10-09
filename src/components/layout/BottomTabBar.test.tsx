import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
