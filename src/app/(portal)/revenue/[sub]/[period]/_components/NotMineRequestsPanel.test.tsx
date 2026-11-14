import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { notMineRequestFromRow, type NotMineRequest } from '@/lib/member/not-mine-requests'
import NotMineRequestsPanel, { notMineHrStatus } from './NotMineRequestsPanel'

// Comm Cal › Requests — Not my order (2026-11-14 — the user: a salesperson writes "not my order" on their own bill, "and
// then HR approve。这样它就会直接变成是完完全全 don't count 的形式").
const { decide, refresh } = vi.hoisted(() => ({ decide: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../not-mine-request-actions', () => ({ decideNotMineRequest: decide }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

const request = (over: Record<string, unknown> = {}): NotMineRequest => notMineRequestFromRow({
  id: 'r1', status: 'hr', orderId: 'o1', orderNo: 'HC-SO-2611-044', periodMonth: '2026-11', subDepartmentId: 'fair',
  staff: { id: 'shawn', name: 'SHAWN' }, reason: 'Keyed for ANTHONY', createdAt: '2026-11-14T02:00:00Z', updatedAt: '2026-11-14T02:00:00Z',
  decidedAt: null, decidedByName: null, decisionNote: null,
  bill: { date: '2026-11-03', customer: 'Tan May Yi', venue: 'MID VALLEY', total: 2700, ownerId: 'shawn', counts: true, periodMonth: '2026-11' },
  ...over,
})!

const props = { unavailable: null, canDecide: true, basePath: '/revenue/fair', returnTo: '/revenue/fair/2026-11-01?view=requests', period: '2026-11-01' }

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('Comm Cal › Requests › Not my order', () => {
  it('lists the month’s requests — what waits on HR says so', () => {
    render(<NotMineRequestsPanel {...props} requests={[request(), request({ id: 'r2', orderNo: 'HC-SO-2611-045', status: 'rejected' })]} />)
    const rows = within(screen.getByRole('table', { name: 'Not my order requests, 1 to approve' })).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('cell').map(c => c.textContent))).toEqual([
      ['HC-SO-2611-044Tan May Yi', 'SHAWN', 'Keyed for ANTHONY', 'RM 2,700.00', '14 Nov, 10:00', 'To approve'],
      ['HC-SO-2611-045Tan May Yi', 'SHAWN', 'Keyed for ANTHONY', 'RM 2,700.00', '14 Nov, 10:00', 'Rejected'],
    ])
  })

  it('says when there are none, and when they could not be read', () => {
    render(<NotMineRequestsPanel {...props} requests={[]} />)
    expect(screen.getByText('No salesperson said a bill of November 2026 is not theirs.')).toBeTruthy()
    cleanup()
    render(<NotMineRequestsPanel {...props} requests={[]} unavailable="Comm Cal is not open to your account." />)
    expect(screen.getByRole('alert').textContent).toBe('The Not my order requests could not be read: Comm Cal is not open to your account.')
  })

  it('Approve takes the bill out — the drawer reads what the database answered', async () => {
    decide.mockResolvedValue({ ok: true, request: request({ status: 'approved', decidedAt: '2026-11-14T03:00:00Z', decidedByName: 'LI SEAN' }) })
    render(<NotMineRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2611-044'))
    expect(screen.getByRole('link', { name: 'HC-SO-2611-044' }).getAttribute('href'))
      .toBe('/revenue/fair/2026-11/orders/o1?from=%2Frevenue%2Ffair%2F2026-11-01%3Fview%3Drequests')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('r1', true, null))
    await waitFor(() => expect(screen.getAllByText('Not counted').length).toBeGreaterThan(0))
    expect(screen.getByText('Approved · not counted')).toBeTruthy()
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('Reject says why — and a refusal is said in the drawer', async () => {
    decide.mockResolvedValueOnce({ ok: false, reason: 'HC-SO-2611-044 is ANTHONY’s now — it moved since SHAWN asked. Reject this request.' })
    render(<NotMineRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2611-044'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await screen.findByText('HC-SO-2611-044 is ANTHONY’s now — it moved since SHAWN asked. Reject this request.')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reject = screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement
    expect(reject.disabled).toBe(true)
    decide.mockResolvedValueOnce({ ok: true, request: request({ status: 'rejected', decisionNote: 'It moved to ANTHONY.' }) })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'It moved to ANTHONY.' } })
    fireEvent.click(reject)
    await waitFor(() => expect(decide).toHaveBeenLastCalledWith('r1', false, 'It moved to ANTHONY.'))
  })

  it('without Revenue · Edit it only reads', () => {
    render(<NotMineRequestsPanel {...props} canDecide={false} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2611-044'))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })

  it('every status in words', () => {
    expect(notMineHrStatus({ status: 'hr' })).toEqual({ text: 'To approve', tone: 'alert' })
    expect(notMineHrStatus({ status: 'approved' })).toEqual({ text: 'Not counted', tone: 'ledger' })
    expect(notMineHrStatus({ status: 'rejected' })).toEqual({ text: 'Rejected', tone: 'danger' })
    expect(notMineHrStatus({ status: 'cancelled' })).toEqual({ text: 'Withdrawn', tone: 'plain' })
  })
})
