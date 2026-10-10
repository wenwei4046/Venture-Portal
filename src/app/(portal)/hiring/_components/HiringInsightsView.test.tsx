import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import HiringInsightsView from './HiringInsightsView'

beforeEach(() => push.mockReset())
afterEach(cleanup)

const card = (label: string) => screen.getByRole('group', { name: label })

// Hiring › Insights (Revenue App.dc.html insVals), on the prototype's day.
describe('Hiring › Insights', () => {
  it('opens on this month, compared with the one before', () => {
    render(<HiringInsightsView board={HIRING_BOARD} today="2026-10-11" />)
    expect(screen.getByText('1 Oct 2026 – 31 Oct 2026')).toBeInTheDocument()
    expect(within(card('Requests submitted')).getByText('2')).toBeInTheDocument()
    expect(within(card('People hired')).getByText('▼ 100% vs Sep')).toBeInTheDocument()
    expect(screen.getByText('Nothing filled in this period')).toBeInTheDocument()
  })

  it('all time, and a month of the last twelve', () => {
    render(<HiringInsightsView board={HIRING_BOARD} today="2026-10-11" />)
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(within(card('Hiring cost')).getByText('RM 2,050')).toBeInTheDocument()
    expect(screen.queryByText('1 Oct 2026 – 31 Oct 2026')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Pick a month/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Aug 2026' }))
    expect(screen.getByText('1 Aug 2026 – 31 Aug 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aug 2026/, pressed: true })).toBeInTheDocument()
  })

  it('a row opens its facts and trail; View full goes to its page', () => {
    render(<HiringInsightsView board={HIRING_BOARD} today="2026-10-11" />)
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    fireEvent.click(screen.getByText('HR-202'))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('HR-202 · Revenue · Fair')).toBeInTheDocument()
    expect(within(panel).getByText('Hired: Siti Aisyah')).toBeInTheDocument()
    expect(within(panel).getByText('22 days')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'View full →' }))
    expect(push).toHaveBeenCalledWith('/hiring/requests/HR-202')
  })
})
