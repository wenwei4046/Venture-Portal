import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types'
import TopBar from './TopBar'

// 2026-10-09 — on a phone the Finance view's top bar is the handoff's: a
// brown "H" tile, FINANCE, and the page's name (the user's Claude Design
// handoff). The desktop bar and every other view's bar are as they were.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/payments/v1' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: async () => undefined } }) }))
vi.mock('./ThemeToggle', () => ({ default: () => <span>theme</span> }))
vi.mock('./PortalViewSwitcher', () => ({ default: () => <span>switch</span> }))

const user = { id: 'fm', role: 'finance', name: 'Finance Manager', email: 'f@x' } as unknown as User

describe('TopBar on the Finance view', () => {
  it('shows the page’s name under an H tile on a phone', () => {
    render(<TopBar user={user} fin />)
    const bar = screen.getByTestId('fin-topbar')
    expect(bar).toHaveTextContent('H')
    expect(bar).toHaveTextContent('Finance')
    expect(bar).toHaveTextContent('Payments')
    expect(bar).toHaveClass('md:hidden')
    // The desktop bar stays, hidden on a phone.
    expect(screen.getByText('Finance Manager').closest('div')?.parentElement?.parentElement).toHaveClass('hidden')
  })

  it('is the usual bar elsewhere', () => {
    render(<TopBar user={user} />)
    expect(screen.queryByTestId('fin-topbar')).toBeNull()
    expect(screen.getByText('Finance Manager')).toBeInTheDocument()
  })
})
