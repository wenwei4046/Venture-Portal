import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { billingFromRow, type BillingPage as Page } from '@/lib/marketing/billing'

// 2026-10-24 — ②b-2b: Billing, the manager's (the user's answers 43–48, 50, 51) — the month's lines by client, Confirm
// (one, or a client's all), Withdraw, a line with no amount sent to its project, an outside client without its billing
// details sent to its page, the months walked and the ones still to confirm named. The database's side is
// tests/member-sql/validate-marketing-billing.mjs.

const actions = vi.hoisted(() => ({ confirmMktBills: vi.fn(), withdrawMktBill: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import BillingPage from './BillingPage'

const ADDR = { line1: 'No 8, Jalan Kenari 5', line2: '', postcode: '47100', city: 'Puchong', state: 'Selangor', country: 'Malaysia' }
const line = (over: Record<string, unknown>) => ({ title: 't', status: 'active', doneAt: null, from: null, until: null, bill: null, ...over })
const ROW = {
  today: '2026-10-24', month: '2026-10-01', now: '2026-10-01',
  lines: [
    line({ project: 'p1', track: 'MKT-CAR-2610-001', sub: 's-car', product: 'Post pack', kind: 'one', status: 'done', doneAt: '2026-10-11T04:00:00Z', amount: 500 }),
    line({ project: 'p2', track: 'MKT-CAR-2610-002', sub: 's-car', product: 'Social Media Management', kind: 'recurring', from: '2026-08-01', amount: 2800 }),
    line({ project: 'p3', track: 'MKT-BLUE-2610-001', sub: 's-blue', product: 'Event day', kind: 'one', status: 'done', doneAt: '2026-10-20T04:00:00Z', amount: null }),
    line({ project: 'p4', track: 'MKT-REDT-2610-001', sub: 's-red', product: 'Social Media Management', kind: 'recurring', from: '2026-10-01', amount: 3000,
      bill: { id: 'b4', amount: 3000, words: "Social Media Management - Oct'26", by: 'Sia', at: '2026-10-24T03:00:00Z' } }),
  ],
  subs: [
    { id: 's-car', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, company: 'Carres Sdn Bhd', bill: null },
    { id: 's-blue', code: 'BLUE', name: 'Blue Van', dot: 'y', emoji: '🏢', client: true, company: null, bill: { name: 'Blue Van Trading', address: null, phone: null, email: null } },
    { id: 's-red', code: 'REDT', name: 'Red Truck', dot: 'z', emoji: '🚚', client: true, company: null,
      bill: { name: 'Red Truck Sdn Bhd', address: ADDR, phone: null, email: 'accounts@redtruck.my' } },
  ],
  open: [{ month: '2026-09-01', due: 2 }],
}
const page = (over: Record<string, unknown> = {}) => billingFromRow({ ...ROW, ...over }) as Page
const card = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
})

describe('Billing', () => {
  it('the month’s figures, the months still to confirm, ‹ › — never past this month', () => {
    render(<BillingPage initial={page()} />)
    expect(screen.getAllByText('Oct 2026').length).toBe(2) // the month on top, and the clients’ card
    // To confirm: Carres's two (500 + 2,800) — on its card too; confirmed: Red Truck's 3,000 — on its line too.
    expect(screen.getAllByText('RM 3,300.00').length).toBe(2)
    expect(screen.getAllByText('RM 3,000.00').length).toBe(2)
    expect(within(screen.getByLabelText('Months still to confirm')).getByRole('link', { name: 'Sep 2026 2' }).getAttribute('href')).toBe('/marketing/billing?m=2026-09')
    expect(screen.getByRole('link', { name: 'Back to Sep 2026' }).getAttribute('href')).toBe('/marketing/billing?m=2026-09')
    expect(screen.queryByRole('link', { name: /On to/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'This month' })).toBeNull()
  })

  it('an earlier month walks on, and back to this one', () => {
    render(<BillingPage initial={page({ month: '2026-08-01', lines: [], subs: [], open: [] })} />)
    expect(screen.getByRole('link', { name: 'On to Sep 2026' }).getAttribute('href')).toBe('/marketing/billing?m=2026-09')
    expect(screen.getByRole('link', { name: 'This month' }).getAttribute('href')).toBe('/marketing/billing')
    expect(screen.getByText('Nothing billed in Aug 2026')).toBeTruthy()
  })

  it('by client: a group company billed as Finance keeps it; an outside client in its own details — or asked for them', () => {
    render(<BillingPage initial={page()} />)
    expect(within(card('Carres')).getByText(/Carres Sdn Bhd · as Finance keeps it/)).toBeTruthy()
    expect(within(card('Carres')).getByText('Group company')).toBeTruthy()
    expect(within(card('Red Truck')).getByText(/Red Truck Sdn Bhd · No 8, Jalan Kenari 5 · 47100 Puchong · Selangor, Malaysia · accounts@redtruck\.my/)).toBeTruthy()
    const blue = card('Blue Van')
    expect(within(blue).getByText(/No billing address yet/)).toBeTruthy()
    expect(within(blue).getByRole('link', { name: 'Add it on its page' }).getAttribute('href')).toBe('/marketing/subsidiaries/BLUE?edit=1')
  })

  it('a line: its project, what it is, its amount — none: sent to its project, nothing to confirm', () => {
    render(<BillingPage initial={page()} />)
    const car = card('Carres')
    expect(within(car).getByRole('link', { name: 'MKT-CAR-2610-001' }).getAttribute('href')).toBe('/marketing/projects/p1')
    expect(within(car).getByText('One-time · done 11 Oct')).toBeTruthy()
    expect(within(car).getByText('Monthly · from Aug 2026')).toBeTruthy()
    const blue = card('Blue Van')
    expect(within(blue).getByText('No amount')).toBeTruthy()
    expect(within(blue).getByRole('link', { name: 'Set it →' }).getAttribute('href')).toBe('/marketing/projects/p3')
    expect(within(blue).queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(within(card('Red Truck')).getByText(/Confirmed · Sia · 24 Oct/)).toBeTruthy()
  })

  it('Confirm sends the month and the line; the month comes back as it now stands', async () => {
    const after = page({ lines: ROW.lines.map(l => (l.project === 'p1' ? { ...l, bill: { id: 'b1', amount: 500, words: "Post pack - Oct'26", by: 'Sia', at: '2026-10-24T05:00:00Z' } } : l)) })
    actions.confirmMktBills.mockResolvedValue({ ok: true, page: after, confirmed: 1 })
    render(<BillingPage initial={page()} />)
    const car = card('Carres')
    await act(async () => {
      fireEvent.click(within(car).getAllByRole('button', { name: 'Confirm' })[0])
    })
    expect(actions.confirmMktBills).toHaveBeenCalledWith('2026-10-01', ['p1'])
    await waitFor(() => expect(within(card('Carres')).getByText(/Confirmed · Sia/)).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe('Confirmed · MKT-CAR-2610-001')
  })

  it('a client’s Confirm all sends its lines with an amount; a refusal is said', async () => {
    actions.confirmMktBills.mockResolvedValue({ ok: false, reason: 'MKT-CAR-2610-002 is not billed in Oct 2026.' })
    render(<BillingPage initial={page()} />)
    await act(async () => {
      fireEvent.click(within(card('Carres')).getByRole('button', { name: 'Confirm all 2' }))
    })
    expect(actions.confirmMktBills).toHaveBeenCalledWith('2026-10-01', ['p1', 'p2'])
    expect((await screen.findByRole('status')).textContent).toBe('MKT-CAR-2610-002 is not billed in Oct 2026.')
  })

  it('Withdraw takes a confirmation back', async () => {
    actions.withdrawMktBill.mockResolvedValue({ ok: true, page: page({ lines: ROW.lines.map(l => ({ ...l, bill: null })) }) })
    render(<BillingPage initial={page()} />)
    await act(async () => {
      fireEvent.click(within(card('Red Truck')).getByRole('button', { name: 'Withdraw' }))
    })
    expect(actions.withdrawMktBill).toHaveBeenCalledWith('b4')
    await waitFor(() => expect(within(card('Red Truck')).getByRole('button', { name: 'Confirm' })).toBeTruthy())
  })
})
