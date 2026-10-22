import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { shareRequestFromRow, type ShareRequest } from '@/lib/member/share-requests'
import ShareRequestsPanel from './ShareRequestsPanel'

const { decide, refresh } = vi.hoisted(() => ({ decide: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../share-request-actions', () => ({ decideShareRequest: decide }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

const LUCAS = 'lucas', ANTHONY = 'anthony'
const request = (over: Record<string, unknown> = {}): ShareRequest => shareRequestFromRow({
  id: 'r1', status: 'hr', orderId: 'o1', orderNo: 'HC-SO-2610-004', periodMonth: '2026-10', subDepartmentId: 'fair',
  owner: { id: LUCAS, name: 'LUCAS' }, note: 'Closed it together', createdAt: '2026-10-21T02:00:00Z', updatedAt: '2026-10-21T02:30:00Z',
  decidedAt: null, decidedByName: null, decisionNote: null, mine: null,
  bill: { date: '2026-10-04', customer: 'Mdm Tan', venue: 'MITEC', total: 4300, ownerId: LUCAS, counts: true, periodMonth: '2026-10' },
  parts: [{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, answer: 'accepted', answeredAt: '2026-10-21T02:30:00Z', note: null }],
  holders: [{ id: LUCAS, name: 'LUCAS', pct: 1, owner: true }],
  events: [
    { step: 'sent', name: 'LUCAS', at: '2026-10-21T02:00:00Z', note: 'Closed it together' },
    { step: 'accepted', name: 'ANTHONY', at: '2026-10-21T02:30:00Z', note: null },
  ],
  ...over,
})!

const props = { unavailable: null, canDecide: true, basePath: '/revenue/fair', returnTo: '/revenue/fair/2026-10-01?view=requests', period: '2026-10-01' }

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('Comm Cal › Requests', () => {
  it('lists the month’s share requests — what waits on HR says so', () => {
    render(<ShareRequestsPanel {...props} requests={[
      request(),
      request({ id: 'r2', orderNo: 'HC-SO-2610-009', status: 'partner', parts: [{ id: ANTHONY, name: 'ANTHONY', pct: 0.3, answer: 'pending' }] }),
    ]} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'HC-SO-2610-004Mdm TanLUCASANTHONY 50%RM 4,300.0021 Oct, 10:00To approve',
      'HC-SO-2610-009Mdm TanLUCASANTHONY 30%RM 4,300.0021 Oct, 10:00Waiting for ANTHONY',
    ])
  })

  it('says so when nobody asked', () => {
    render(<ShareRequestsPanel {...props} requests={[]} />)
    expect(screen.getByText('No salesperson asked to share a bill of October 2026.')).toBeTruthy()
  })

  it('opens a request on its whole trail: who sent it, who accepted, the split HR would write', () => {
    render(<ShareRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('SplitLUCAS 50% · ANTHONY 50%')
    expect(drawer).toHaveTextContent('NoteClosed it together')
    expect(drawer).toHaveTextContent('ANTHONY50% · RM 2,150.00Accepted')
    expect(drawer).toHaveTextContent('Share request sent21 Oct, 10:00LUCAS')
    expect(drawer).toHaveTextContent('Accepted21 Oct, 10:30ANTHONY')
  })

  it('approves — the request comes back approved and the month is read again', async () => {
    decide.mockResolvedValue({ ok: true, request: request({ status: 'approved', decidedByName: 'HR Manager',
      holders: [{ id: LUCAS, name: 'LUCAS', pct: 0.5, owner: true }, { id: ANTHONY, name: 'ANTHONY', pct: 0.5, owner: false }],
      events: [...request().events, { step: 'approved', name: 'HR Manager', at: '2026-10-21T03:00:00Z', note: null }] }) })
    render(<ShareRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('r1', true, null))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toHaveTextContent('Approved by HR21 Oct, 11:00HR Manager')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('rejects only with a reason the salespeople can read', async () => {
    decide.mockResolvedValue({ ok: true, request: request({ status: 'rejected', decisionNote: 'Not a shared sale' }) })
    render(<ShareRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reject = screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement
    expect(reject.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Not a shared sale' } })
    fireEvent.click(reject)
    await waitFor(() => expect(decide).toHaveBeenCalledWith('r1', false, 'Not a shared sale'))
  })

  it('shows a refusal in words, and keeps the drawer open', async () => {
    decide.mockResolvedValue({ ok: false, reason: 'HC-SO-2610-004 is BEN’s now — it moved since LUCAS asked. Reject this request.' })
    render(<ShareRequestsPanel {...props} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('it moved since LUCAS asked')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('without Revenue · Edit, reads it and decides nothing', () => {
    render(<ShareRequestsPanel {...props} canDecide={false} requests={[request()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('a request still with the colleagues cannot be approved yet', () => {
    render(<ShareRequestsPanel {...props} requests={[request({ status: 'partner', parts: [{ id: ANTHONY, name: 'ANTHONY', pct: 0.5, answer: 'pending' }] })]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-004'))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByRole('dialog')).toHaveTextContent('Waiting for ANTHONY')
  })
})
