import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from '@/types'
import { SWITCH_VIEWS } from '@/lib/view-switch'

// EVERY VIEW SWITCHER LISTS EVERY VIEW (2026-10-27 — the user, the Principal's top-bar menu beside Marketing's, which had
// no Lead View and the browser's own list: "marketing 的这个 dropdown 就照它的那个设计风格 … 它有显示到全部的 view 能够选"):
// the portal's bars — HR's, Finance's and the Principal's, Marketing's, the phone's — draw the same switch: the words,
// the soft menu (the picked row peach with a ✓), every view.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/marketing' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('./view-as-actions', () => ({ setViewAs: vi.fn() }))
vi.mock('./ViewAsPersonPicker', () => ({ default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="View as a person" /> : null) }))
vi.mock('@/components/me/MeDesktop', () => ({ MeDesktop: () => null }))
vi.mock('./MemoBell', () => ({ default: () => null }))
vi.mock('@/components/layout/MemoBell', () => ({ default: () => null }))
vi.mock('@/components/mkt/shell/MktSearch', () => ({ default: () => null }))

import HrTopBar from './HrTopBar'
import PortalViewSwitcher from './PortalViewSwitcher'
import MktTopBar from '@/components/mkt/shell/MktTopBar'

const principal = (over: Partial<User> = {}): User =>
  ({ id: 'p1', email: 'principal@venture.my', name: 'Principal', role: 'principal', permissions: [], actions: {}, closed: [], is_active: true, canSwitchView: true, ...over }) as unknown as User

const LABELS = SWITCH_VIEWS.map(v => v.label)

afterEach(cleanup)

const select = () => screen.getByLabelText('View portal as role') as HTMLSelectElement
const options = () => Array.from(select().options).map(o => o.text)
/** The soft menu, as a press opens it. */
const menu = () => {
  fireEvent.mouseDown(select(), { button: 0 })
  return screen.getByRole('listbox')
}

describe('the view switch on every portal bar', () => {
  it('HR’s, Finance’s and the Principal’s bar: every view, in the soft menu, the one drawn picked', () => {
    render(<HrTopBar user={principal()} viewLabel="Principal view" />)
    expect(options()).toEqual(LABELS)
    const list = menu()
    expect(within(list).getAllByRole('option').map(o => o.textContent)).toEqual(LABELS.map(l => `${l}✓`))
    expect(within(list).getByRole('option', { selected: true })).toHaveTextContent('Principal')
  })

  it('Marketing’s bar: the same switch — Lead View too, and no browser list', () => {
    render(<MktTopBar user={principal({ role: 'marketing' as User['role'] })} crumb={{ emoji: '🏠', label: 'My Space' }} personal={false} unread={0} bellOn={false} onBell={() => {}} newProject />)
    expect(options()).toEqual(LABELS)
    expect(options()).toContain('Lead View')
    expect(within(menu()).getByRole('option', { selected: true })).toHaveTextContent('Marketing view')
  })

  it('the phone’s bar: every view, and the person drawn while viewing as somebody', () => {
    render(<PortalViewSwitcher value="finance" viewingAs="ONG MEI SHUANG" />)
    expect(options()).toEqual(['Viewing as ONG MEI SHUANG', ...LABELS])
    expect(within(menu()).getByRole('option', { selected: true })).toHaveTextContent('Viewing as ONG MEI SHUANG')
  })

  it('View as a person… opens the picker and keeps the view drawn', () => {
    render(<HrTopBar user={principal({ role: 'hr' })} />)
    fireEvent.mouseDown(within(menu()).getByRole('option', { name: /^View as a person…/ }))
    expect(screen.getByRole('dialog', { name: 'View as a person' })).toBeInTheDocument()
    expect(select().value).toBe('hr')
  })

  it('is not there for an account that may not switch', () => {
    render(<MktTopBar user={principal({ canSwitchView: false })} crumb={{ emoji: '🏠', label: 'My Space' }} personal={false} unread={0} bellOn={false} onBell={() => {}} newProject={false} />)
    expect(screen.queryByLabelText('View portal as role')).toBeNull()
  })
})
