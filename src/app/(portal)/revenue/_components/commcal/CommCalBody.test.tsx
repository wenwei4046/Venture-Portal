import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Comm Cal (2026-10-10, the HR revamp): the strip (ERP · Pays from · Data
// source), five cards, the months — and the old panels' every power inside
// the Data source drawer.

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav }))
vi.mock('../../cutover-actions', () => ({ setFirstPaidMonth: vi.fn(), clearFirstPaidMonth: vi.fn() }))
vi.mock('../../link-actions', () => ({ linkErpKey: vi.fn(), setErpFeedWindow: vi.fn(), unlinkErpKey: vi.fn() }))
vi.mock('../../sync-actions', () => ({ ignoreErpAgent: vi.fn(), matchErpSalesperson: vi.fn(), replayHeldErpEvents: vi.fn(), unignoreErpAgent: vi.fn() }))
vi.mock('@/lib/nav-warm', () => ({ warmOnIntent: vi.fn(), cancelWarmIntent: vi.fn() }))

import CommCalBody, { type CommCalData } from './CommCalBody'

const recent = new Date(Date.now() - 15 * 60_000).toISOString()

function data(over: Partial<CommCalData> = {}): CommCalData {
  return {
    sub: { id: 'sub-fair', name: 'Fair', slug: 'fair', schemeId: 's' },
    months: [
      { period: '2026-10-01', label: 'October 2026', href: '/revenue/fair/2026-10-01', orders: 128, unmatched: 0, run: null, claims: 4, source: { tone: 'ledger', text: 'ERP live · 15 min ago', file: null } },
      { period: '2026-08-01', label: 'August 2026', href: '/revenue/fair/2026-08-01', orders: 316, unmatched: 0, run: null, claims: 0, source: { tone: 'info', text: 'Settled by hand · 281 held', file: "SALARY CLAIM FORM_AUGUST'26.xlsx" } },
    ],
    cards: [
      { label: 'Months with sales data', value: '5', note: 'Since June 2026', icon: 'calendar', tone: 'default' },
      { label: 'October commission', value: 'Not computed', note: 'Open October to compute', icon: 'percent', tone: 'alert', href: '/revenue/fair/2026-10-01', noteLink: true },
    ],
    cutover: { firstPaidMonth: '2026-09-01', setAt: '2026-09-26T04:00:00Z', setByName: 'Principal', note: null },
    settledRange: 'June–August',
    link: {
      subDepartmentId: 'sub-fair', linked: true, keyHint: '····k027', linkedAt: '2026-09-13T00:00:00Z', linkedByName: 'Principal',
      receiverUrl: 'https://venture-portal-chi.vercel.app/api/erp/v1/sales-orders', envSecretSet: false, minOrderDate: '2026-08-01', windowSetByName: null, windowSetAt: null,
    },
    sync: {
      subDepartmentId: 'sub-fair', lastEventAt: recent, events: [], held: [], unmatched: [],
      ignored: [{ agentKey: 'mayson', agentName: 'MAYSON', erpSalespersonId: '27e443eb-0000', note: null, orders: 3, total: 22772 }],
      staff: [],
    } as unknown as CommCalData['sync'],
    canManage: true,
    canEdit: true,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('Comm Cal', () => {
  it('says the feed, the first month paid and who settled the rest', () => {
    render(<CommCalBody data={data()} />)
    expect(screen.getByText('ERP receiving')).toBeInTheDocument()
    expect(screen.getByText(/last delivery 15 min ago/)).toBeInTheDocument()
    expect(screen.getByText('Pays from September 2026')).toBeInTheDocument()
    expect(screen.getByText(/June–August settled by hand · Principal, 26 Sep/)).toBeInTheDocument()
  })

  it('opens a month from its row, and its double claims from the red line', () => {
    render(<CommCalBody data={data()} />)
    fireEvent.click(screen.getByRole('row', { name: /August 2026/ }))
    expect(nav.push).toHaveBeenCalledWith('/revenue/fair/2026-08-01')
    fireEvent.click(screen.getByText('4 possible double claims'))
    expect(nav.push).toHaveBeenLastCalledWith('/revenue/fair/2026-10-01?view=claims')
  })

  it('shows the file a hand-settled month came from under its chip', () => {
    render(<CommCalBody data={data()} />)
    expect(screen.getByText("SALARY CLAIM FORM_AUGUST'26.xlsx")).toBeInTheDocument()
  })

  it('opens the latest month from the amber "Not computed" card', () => {
    render(<CommCalBody data={data()} />)
    fireEvent.click(screen.getByRole('button', { name: /October commission/ }))
    expect(nav.push).toHaveBeenCalledWith('/revenue/fair/2026-10-01')
  })

  it('keeps the ERP link and the feed in the Data source drawer', () => {
    render(<CommCalBody data={data()} />)
    fireEvent.click(screen.getByRole('button', { name: /Data source/ }))
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByText('Houzs ERP')).toBeInTheDocument()
    expect(within(drawer).getByText('key ····k027 · pasted by Principal on 13 Sep 2026')).toBeInTheDocument()
    expect(within(drawer).getByText('Replace key')).toBeInTheDocument()
    expect(within(drawer).getByText('MAYSON')).toBeInTheDocument()
    expect(within(drawer).getByText('3 bills · RM 22,772.00')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hides Change and the key controls from whoever cannot manage Revenue', () => {
    render(<CommCalBody data={data({ canManage: false })} />)
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Data source/ }))
    expect(screen.queryByText('Replace key')).toBeNull()
  })

  it('shows what it is handed for a sub-department with no month yet', () => {
    render(<CommCalBody data={data({ months: [], cards: [] })} empty={<p>No sales data yet.</p>} />)
    expect(screen.getByText('No sales data yet.')).toBeInTheDocument()
    expect(screen.queryByText('Months with sales data')).toBeNull()
  })
})
