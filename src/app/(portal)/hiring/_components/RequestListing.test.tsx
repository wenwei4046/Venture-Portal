import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const actions = vi.hoisted(() => ({ cancelHiringRequest: vi.fn(), reopenHiringRequest: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import RequestListing from './RequestListing'

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

const row = (text: string) => screen.getByText(text).closest('[role="row"]') as HTMLElement
const menuItems = () => screen.getAllByRole('menuitem').map(b => b.textContent)

// The handoff's Listing (Revenue App.dc.html hrRows / menuFor).
describe('Hiring › Requests — Listing', () => {
  it('counts each status and filters by it', () => {
    render(<RequestListing board={HIRING_BOARD} canApprove />)
    const stats = within(screen.getByRole('group', { name: 'Filter by status' })).getAllByRole('button')
    expect(stats.map(b => b.textContent)).toEqual(['Total9', 'Pending2', 'Acknowledged1', 'Filled5', 'Cancelled1'])
    expect(screen.getAllByRole('row')).toHaveLength(10)
    fireEvent.click(stats[3])
    expect(screen.getAllByRole('row')).toHaveLength(6)
    expect(screen.getByText('Hired: Siti Aisyah')).toBeInTheDocument()
  })

  it('a row says who owns it — or that nobody does yet', () => {
    render(<RequestListing board={HIRING_BOARD} canApprove />)
    expect(within(row('HR-205')).getByText('Unassigned')).toBeInTheDocument()
    expect(within(row('HR-203')).getByText('Grace Lim')).toBeInTheDocument()
    expect(within(row('HR-203')).getByText('· 1 appt')).toBeInTheDocument()
  })

  it('a click opens the request’s page', () => {
    render(<RequestListing board={HIRING_BOARD} canApprove />)
    fireEvent.click(row('HR-203'))
    expect(push).toHaveBeenCalledWith('/hiring/requests/HR-203')
  })

  it('right-click: what can be done to a request in its status', () => {
    render(<RequestListing board={HIRING_BOARD} canApprove />)
    fireEvent.contextMenu(row('HR-205'))
    expect(menuItems()).toEqual(['Acknowledge', 'Mark filled…', 'Cancel request', 'Open details'])
    fireEvent.contextMenu(row('HR-202'))
    expect(menuItems()).toEqual(['Reopen', 'Open details'])
  })

  it('Acknowledge from the menu goes to the page to pick an owner; Cancel cancels', async () => {
    render(<RequestListing board={HIRING_BOARD} canApprove />)
    fireEvent.contextMenu(row('HR-205'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Acknowledge' }))
    expect(flash).toHaveBeenCalledWith('Pick who in HR is taking this on, then Acknowledge')
    expect(push).toHaveBeenCalledWith('/hiring/requests/HR-205')
    fireEvent.contextMenu(row('HR-204'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel request' }))
    await waitFor(() => expect(actions.cancelHiringRequest).toHaveBeenCalledWith('HR-204'))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('HR-204 cancelled'))
  })

  it('without Hiring · Approve the menu only opens', () => {
    render(<RequestListing board={HIRING_BOARD} canApprove={false} />)
    fireEvent.contextMenu(row('HR-205'))
    expect(menuItems()).toEqual(['Open details'])
  })
})
