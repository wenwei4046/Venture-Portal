import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const actions = vi.hoisted(() => ({ hiringFileLink: vi.fn(), removeHiringTalent: vi.fn(), saveHiringTalent: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TalentBankView from './TalentBankView'

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, id: 'x' })
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

const tree = () => within(screen.getByRole('region', { name: 'Departments' }))
const names = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('span span')?.textContent)
const view = (can = { create: true, edit: true }) => render(<TalentBankView board={HIRING_BOARD} can={can} />)

// The handoff's Talent Bank (Revenue App.dc.html talVals).
describe('Hiring › Talent Bank', () => {
  it('everybody, then a department, then a position under it', () => {
    view()
    expect(names()).toEqual(['Nur Iman', 'Joyce Tan', 'Marcus Wong', 'Aisyah Rahman'])
    expect(screen.getByText('4 people')).toBeInTheDocument()
    fireEvent.click(tree().getByRole('button', { name: /Revenue/ }))
    expect(names()).toEqual(['Nur Iman', 'Marcus Wong'])
    fireEvent.click(tree().getByRole('button', { name: /^Senior Revenue Specialist/ }))
    expect(names()).toEqual(['Marcus Wong'])
    expect(screen.getByText('Revenue · 1 person')).toBeInTheDocument()
  })

  it('searches names, positions and notes', () => {
    view()
    fireEvent.change(screen.getByPlaceholderText('Search name or notes'), { target: { value: 'acca' } })
    expect(names()).toEqual(['Aisyah Rahman'])
    expect(tree().getByRole('button', { name: /All talent/ }).textContent).toBe('All talent1')
  })

  it('says who is interviewing for an open request', () => {
    view()
    expect(screen.getByText('Interviewing · HR-203')).toBeInTheDocument()
    expect(screen.getAllByText('Available')).toHaveLength(3)
  })

  it('right-click: Open, or Remove from Talent Bank', async () => {
    view()
    fireEvent.contextMenu(screen.getByText('Joyce Tan').closest('[role="row"]')!)
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open', 'Remove from Talent Bank'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Talent Bank' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
    expect(flash).toHaveBeenCalledWith('Joyce Tan removed from the Talent Bank')
  })

  it('the panel asks twice before removing, and opens the full page', async () => {
    view()
    fireEvent.click(screen.getByText('Joyce Tan'))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Saved to Talent Bank · 15 Sep 2026 · From HR-201 · request cancelled')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
  })

  it('+ Add talent needs a name and what they fit', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: '+ Add talent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Add a name and the position they fit.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.saveHiringTalent).toHaveBeenCalled())
    const sent = actions.saveHiringTalent.mock.calls[0][0] as FormData
    expect([sent.get('name'), sent.get('position'), sent.get('department')]).toEqual(['Lee Mei', 'Driver', 'Revenue'])
  })

  it('without Create or Edit it only reads', () => {
    view({ create: false, edit: false })
    expect(screen.queryByRole('button', { name: '+ Add talent' })).toBeNull()
    fireEvent.contextMenu(screen.getByText('Joyce Tan').closest('[role="row"]')!)
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open'])
  })
})
