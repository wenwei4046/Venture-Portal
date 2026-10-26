import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { User } from '@/types'

// HR view's bell (2026-10-23 — the user, circling it: "at least show up in this notification side, in desktop view"):
// one's own memos for a login a People record names, and in HR's own view the probations ending for whoever may act on
// them — the shared hr@ too, which has no memos. Never while viewing as somebody; not in the Principal's or Finance's
// view, which wear this bar as well.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('./view-as-actions', () => ({ setViewAs: vi.fn() }))
vi.mock('./ViewAsPersonPicker', () => ({ default: () => null }))
vi.mock('@/components/me/MeDesktop', () => ({ MeDesktop: () => null }))
vi.mock('./MemoBell', () => ({
  default: ({ memos = true, terms = false }: { memos?: boolean; terms?: boolean }) => (
    <div data-testid="bell">{`memos:${memos} terms:${terms}`}</div>
  ),
}))

import HrTopBar from './HrTopBar'

const HR_EDIT = { 'team.view': 'all', 'team.edit': 'all' } as const

const user = (over: Partial<User>): User =>
  ({
    id: 'u1', email: 'hr@venture.my', name: 'HR', role: 'hr', permissions: ['team'], actions: HR_EDIT, closed: [], is_active: true,
    ...over,
  }) as unknown as User

afterEach(cleanup)

const bell = () => screen.queryByTestId('bell')?.textContent ?? null

describe('HR view’s bell', () => {
  it('the shared hr@: no memos, the probations ending', () => {
    render(<HrTopBar user={user({})} />)
    expect(bell()).toBe('memos:false terms:true')
  })

  it('an HR person’s own login: both', () => {
    render(<HrTopBar user={user({ personalLogin: true })} />)
    expect(bell()).toBe('memos:true terms:true')
  })

  it('a personal login that may not edit people: memos only', () => {
    render(<HrTopBar user={user({ personalLogin: true, actions: { 'team.view': 'all' } })} />)
    expect(bell()).toBe('memos:true terms:false')
  })

  it('not in Finance’s or the Principal’s view, which wear this bar too', () => {
    render(<HrTopBar user={user({ role: 'finance', personalLogin: true })} viewLabel="Finance view" />)
    expect(bell()).toBe('memos:true terms:false')
    cleanup()
    render(<HrTopBar user={user({ role: 'principal' })} viewLabel="Principal view" />)
    expect(bell()).toBeNull()
  })

  it('never while viewing as somebody', () => {
    render(<HrTopBar user={user({ personalLogin: true, viewingAs: { id: 'x', name: 'X' } })} />)
    expect(bell()).toBeNull()
  })
})
