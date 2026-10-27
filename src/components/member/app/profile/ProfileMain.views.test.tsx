import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ProfileMain from './ProfileMain'
import type { ProfileMainVM } from './profile-vm'

// Profile's Switch view (2026-10-11 — the user: "do a switch button for me to switch to hr and other view, in revenue
// view don't have that button"): on a phone, an account that may switch views gets the app's views here, as the HR
// app's More lists them; RevenueApp passes it only for the live phone layout, never while viewing a member.
// Every view since 2026-10-27, as every switcher lists them — Marketing and Lead View too, but not View as a person…
// (the user: "no need in revenue app add on … cause revenue app can use view as team member") — each saying where it
// opens on a phone: the Principal's own view and Finance's are the Finance app (2026-10-17).

const vm: ProfileMainVM = { name: 'LOO WEN WEI', ini: 'LW', sub: 'HOUZS Venture · Revenue', title: 'Principal', rank: 'All access', badges: {} }
const actions = { open: vi.fn(), signOut: vi.fn() }

describe('Profile’s Switch view', () => {
  it('lists every other view and where it opens, and this one as here', () => {
    render(<ProfileMain vm={vm} hidden={false} actions={actions} views={{ current: 'revenue_member', pick: vi.fn() }} />)
    const views = screen.getByRole('region', { name: 'Switch view' })
    expect(within(views).getAllByRole('button').map(b => b.textContent)).toEqual([
      'PrincipalThe Finance app', 'FinanceThe Finance app', 'HRThe HR app', 'MarketingThe portal', 'Lead ViewThe portal',
    ])
    expect(within(views).getByText('Revenue team').closest('[aria-current="true"]')).toHaveTextContent('You are here')
    expect(within(views).queryByText(/View as a person/)).toBeNull()
  })

  it('switches with the portal’s own action', () => {
    const pick = vi.fn()
    render(<ProfileMain vm={vm} hidden={false} actions={actions} views={{ current: 'revenue_member', pick }} />)
    const views = within(screen.getByRole('region', { name: 'Switch view' }))
    fireEvent.click(views.getByRole('button', { name: /^HR/ }))
    fireEvent.click(views.getByRole('button', { name: /^Marketing/ }))
    fireEvent.click(views.getByRole('button', { name: /^Lead View/ }))
    expect(pick.mock.calls).toEqual([['hr'], ['marketing'], ['lead']])
  })

  it('is not there for anybody else', () => {
    render(<ProfileMain vm={vm} hidden={false} actions={actions} />)
    expect(screen.queryByRole('region', { name: 'Switch view' })).toBeNull()
  })
})
