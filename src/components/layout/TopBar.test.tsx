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
vi.mock('./MemoBell', () => ({ default: () => <button type="button">memo bell</button> }))

const user = { id: 'fm', role: 'finance', name: 'Finance Manager', email: 'f@x' } as unknown as User

// 2026-10-12 — one's own memos in every view: the bell is in the bar for a login a People record names (the shared
// logins have no memos), and never while viewing as somebody.
describe('TopBar’s memo bell', () => {
  it('is there for a personal login, in the phone bar and the desktop bar', () => {
    render(<TopBar user={{ ...user, personalLogin: true }} fin />)
    expect(screen.getAllByRole('button', { name: 'memo bell' })).toHaveLength(2)
  })

  it('is not there for a shared login, nor while viewing as somebody', () => {
    const { unmount } = render(<TopBar user={user} />)
    expect(screen.queryByRole('button', { name: 'memo bell' })).toBeNull()
    unmount()
    render(<TopBar user={{ ...user, personalLogin: true, viewingAs: { id: 'x', name: 'Kris' } }} />)
    expect(screen.queryByRole('button', { name: 'memo bell' })).toBeNull()
  })
})

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
