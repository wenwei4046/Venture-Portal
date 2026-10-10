import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const actions = vi.hoisted(() => ({
  hiringFileLink: vi.fn(),
  inviteHiringTalent: vi.fn(),
  removeHiringTalent: vi.fn(),
  replaceTalentResume: vi.fn(),
  saveTalentNotes: vi.fn(),
}))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TalentPage from './TalentPage'

const talent = (no: string) => HIRING_BOARD.talents.find(t => t.no === no)!

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

// A talent's own page (Revenue App.dc.html talVals' tv).
describe('Hiring › Talent Bank › a talent', () => {
  it('invites to the open request that fits, by default', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    const select = screen.getByLabelText('Open request') as HTMLSelectElement
    expect([...select.options].map(o => o.text)).toEqual([
      'HR-205 · Senior Revenue Specialist · Revenue · IR', 'HR-204 · Account Executive · Finance', 'HR-203 · Revenue Specialist · Revenue · Fair',
    ])
    expect(select.value).toBe('HR-205')
    fireEvent.click(screen.getByRole('button', { name: 'Invite to interview' }))
    await waitFor(() => expect(actions.inviteHiringTalent).toHaveBeenCalledWith('T-102', 'HR-205'))
    expect(flash).toHaveBeenCalledWith('Marcus Wong invited to interview for HR-205')
  })

  it('saves HR notes on leaving the field', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-101')} can={{ create: true, edit: true }} />)
    const notes = screen.getByRole('textbox', { name: 'HR notes' })
    fireEvent.change(notes, { target: { value: 'Interviewed again: strong.' } })
    fireEvent.blur(notes)
    await waitFor(() => expect(actions.saveTalentNotes).toHaveBeenCalledWith('T-101', 'Interviewed again: strong.'))
    fireEvent.blur(notes)
    expect(actions.saveTalentNotes).toHaveBeenCalledTimes(1)
  })

  it('asks twice before removing, then goes back to the bank', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-103')} can={{ create: true, edit: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Talent Bank' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/hiring/talent'))
    expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103')
  })

  it('reads its history, newest last', () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-104')} can={{ create: false, edit: false }} />)
    expect(screen.getByText('Good fit for Revenue Specialist · Revenue · saved 24 Sep 2026 by Grace Lim')).toBeInTheDocument()
    expect(screen.getByText('Interviewing · HR-203')).toBeInTheDocument()
    expect(screen.getByText('HR-203 · Revenue Specialist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite to interview' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from Talent Bank' })).toBeNull()
  })
})
