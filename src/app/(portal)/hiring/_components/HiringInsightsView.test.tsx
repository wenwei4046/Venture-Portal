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
    expect(within(card('Open roles')).getByText('3')).toBeInTheDocument()
    expect(within(card('Open roles')).getByText('▲ 200% vs Sep')).toBeInTheDocument()
    expect(within(card('People hired')).getByText('▼ 100% vs Sep')).toBeInTheDocument()
    expect(screen.getByText('Nothing filled in this period')).toBeInTheDocument()
  })

  // 2026-11-16, the user: "上面的 Request Submitted 跟 Average Day to Acknowledge 这两个可以换掉，换成一个叫 Open Role（在招职位）；
  // People Hired 这个可以保留".
  it('five cards: Open roles in the place of Requests submitted and Avg days to acknowledge', () => {
    render(<HiringInsightsView board={HIRING_BOARD} today="2026-11-16" />)
    const cards = screen.getByRole('region', { name: 'This period' })
    expect(within(cards).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual([
      'Open roles', 'People hired', 'Avg days to fill', 'Hiring cost', 'Cost per hire',
    ])
    expect(screen.queryByText('Requests submitted')).toBeNull()
    expect(screen.queryByText('Avg days to acknowledge')).toBeNull()
    // November sent nothing new; the card counts the three still being hired, as the list under it does.
    expect(within(card('Open roles')).getByText('3')).toBeInTheDocument()
    expect(within(card('Open roles')).getByText('0% vs Oct')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Open roles' })).getAllByRole('button', { expanded: false })).toHaveLength(3)
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

  // 2026-11-16, the user: "我想看到 ongoing 正在招的人的 status，还有现阶段到底有什么职位在招人，能及时展开看".
  it('Open roles: what is being hired today, whatever the period; a row opens onto its candidates and its newest step', () => {
    render(<HiringInsightsView board={HIRING_BOARD} today="2026-11-16" />)
    const roles = screen.getByRole('region', { name: 'Open roles' })
    expect(within(roles).getByText('As of 16 Nov 2026')).toBeInTheDocument()
    // November has no request of its own; Open roles still lists the three being hired.
    expect(screen.getByText('No requests in this period.')).toBeInTheDocument()
    expect(within(roles).getAllByRole('button', { expanded: false })).toHaveLength(3)
    const row = (name: RegExp) => within(roles).getByRole('button', { name })
    expect(row(/Revenue Specialist × 2/)).toHaveTextContent('HR-203 · Revenue · Fair')
    expect(row(/Revenue Specialist × 2/)).toHaveTextContent('Shortlisted 1')
    expect(row(/Revenue Specialist × 2/)).toHaveTextContent('Hired 0 / 2')
    expect(row(/Revenue Specialist × 2/)).toHaveTextContent('49 d')
    expect(row(/Account Executive/)).toHaveTextContent('No candidates yet')
    expect(row(/Account Executive/)).toHaveTextContent('Unassigned')

    fireEvent.click(row(/Revenue Specialist × 2/))
    expect(row(/Revenue Specialist × 2/)).toHaveAttribute('aria-expanded', 'true')
    const more = within(roles).getByRole('region', { name: 'HR-203 · Revenue Specialist × 2' })
    expect(within(more).getByText('Daniel Lee')).toBeInTheDocument()
    expect(within(more).getByText('Done appointment')).toBeInTheDocument()
    expect(within(more).getByText('Interview booked')).toBeInTheDocument()
    expect(within(more).getByText('Within 1 month')).toBeInTheDocument()
    fireEvent.click(within(more).getByRole('button', { name: 'View full →' }))
    expect(push).toHaveBeenCalledWith('/hiring/requests/HR-203')

    // A month gone by: Open roles is still today's.
    fireEvent.click(screen.getByRole('button', { name: /Pick a month/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Aug 2026' }))
    expect(within(roles).getAllByRole('button', { name: /HR-20[345] · / })).toHaveLength(3)
    // Pressed again, the row closes.
    fireEvent.click(row(/Revenue Specialist × 2/))
    expect(within(roles).queryByRole('region')).toBeNull()
  })

  it('no request open: Open roles says so', () => {
    const board = { ...HIRING_BOARD, requests: HIRING_BOARD.requests.filter(r => !['submitted', 'needs_info', 'acknowledged'].includes(r.status)) }
    render(<HiringInsightsView board={board} today="2026-11-16" />)
    expect(within(screen.getByRole('region', { name: 'Open roles' })).getByText('No open roles')).toBeInTheDocument()
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
