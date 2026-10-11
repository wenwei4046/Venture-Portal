import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ProfileMain from './ProfileMain'
import type { ProfileMainVM } from './profile-vm'

// Profile's Switch view (2026-10-11 — the user: "do a switch button for me to switch to hr and other view, in revenue
// view don't have that button"): on a phone, an account that may switch views gets the app's views here, as the HR
// app's More lists them; RevenueApp passes it only for the live phone layout, never while viewing a member.

const vm: ProfileMainVM = { name: 'LOO WEN WEI', ini: 'LW', sub: 'HOUZS Venture · Revenue', title: 'Principal', rank: 'All access', badges: {} }
const actions = { open: vi.fn(), signOut: vi.fn() }

describe('Profile’s Switch view', () => {
  it('lists the other views to go to, and this one as here', () => {
    render(<ProfileMain vm={vm} hidden={false} actions={actions} views={{ current: 'revenue', pick: vi.fn() }} />)
    const views = screen.getByRole('region', { name: 'Switch view' })
    expect(within(views).getAllByRole('button').map(b => b.textContent)).toEqual([
      'PrincipalThe portal', 'FinanceThe portal', 'HRThe HR app',
    ])
    expect(within(views).getByText('Revenue team').closest('[aria-current="true"]')).toHaveTextContent('You are here')
  })

  it('switches with the portal’s own action', () => {
    const pick = vi.fn()
    render(<ProfileMain vm={vm} hidden={false} actions={actions} views={{ current: 'revenue', pick }} />)
    fireEvent.click(within(screen.getByRole('region', { name: 'Switch view' })).getByRole('button', { name: /^HR/ }))
    expect(pick).toHaveBeenCalledWith('hr')
  })

  it('is not there for anybody else', () => {
    render(<ProfileMain vm={vm} hidden={false} actions={actions} />)
    expect(screen.queryByRole('region', { name: 'Switch view' })).toBeNull()
  })
})
