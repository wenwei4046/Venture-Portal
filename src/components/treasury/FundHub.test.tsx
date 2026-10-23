import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import dayjs from 'dayjs'
import type { FundRecord } from '@/lib/fund-hub'

// Fund OUT's and Fund IN's hub (2026-10-15, the Finance revamp v2 — D12): the
// head, *Fund out · {Month YYYY}*, the user's cards in the design's colours,
// the list each opens (−RM red out, +RM green in, a cancelled one faint), a
// deal's drawer — the dark hero, its three groups, the trail — and the steps
// the deal's own page takes from the list: Open in Approvals for whoever
// decides it, Cancel / Withdraw one still waiting (asked first), Edit a
// pending fund source, Amend terms on a live deal.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), flash: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/office-time', () => ({ officeTime: (at?: string) => dayjs(at) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))

import FundHub, { type FundCan } from './FundHub'

const deal = (over: Partial<FundRecord>): FundRecord => ({
  id: 'x',
  side: 'out',
  party: 'Carres (CAR)',
  type: 'loan',
  typeLabel: 'Loan out',
  amount: 1000,
  outstanding: null,
  rate: 0.02,
  status: 'active',
  overdue: null,
  date: '2026-10-05',
  createdAt: '2026-10-04T02:00:00Z',
  createdBy: 'Aina',
  approvedAt: '2026-10-05T03:00:00Z',
  approvedBy: 'Principal',
  maturity: '2027-10-05',
  months: 12,
  compound: false,
  minPayInterest: false,
  fundingSource: null,
  notes: null,
  bank: null,
  account: null,
  approval: null,
  decidable: false,
  cancelPending: false,
  repaid: 0,
  repaidAt: null,
  repaidBy: null,
  ...over,
})

const LOANS: FundRecord[] = [
  deal({ id: 'a', party: 'Carres (CAR)', amount: 100000, outstanding: 80000, repaid: 20000, fundingSource: 'HC', notes: 'EMI 分期 · 月息2% · 12期' }),
  deal({ id: 'b', party: 'Hookka (HK)', amount: 50000, outstanding: 40000, overdue: { amount: 12333.34, since: '2026-08-20', days: 50 }, date: '2026-09-20' }),
  deal({ id: 'c', party: 'The Conts (CONTS)', amount: 30000, status: 'pending_approval', approvedAt: null, approvedBy: null, date: '2026-10-12', approval: { id: 'req-1', submittedBy: 'u-fin' }, decidable: true }),
  deal({ id: 'd', party: 'Design Cave (DC)', amount: 20000, status: 'repaid', date: '2026-01-05' }),
  deal({ id: 'e', party: 'HOUZS Kitchen (HK2)', amount: 15000, status: 'cancelled', approvedAt: null, approvedBy: null, date: '2026-10-01' }),
]

const ALL: FundCan = { edit: true, void: true, amend: true }
const withdraw = vi.fn()

function hub(over: Partial<Parameters<typeof FundHub>[0]> = {}) {
  return render(
    <FundHub
      side="out"
      records={LOANS}
      month="2026-10"
      today="2026-10-15"
      initialCard="all"
      can={ALL}
      canSetDefault
      onWithdraw={withdraw}
      head={<button type="button">Create fund out</button>}
      {...over}
    />,
  )
}

const cardBtn = (name: RegExp) => screen.getByRole('button', { name })
const list = () => screen.getAllByRole('row').filter((r) => r.getAttribute('tabindex') === '0')
const drawer = () => screen.getByRole('dialog', { name: /^Fund (out|in) · / })

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/fund-out')
})

describe('the hub', () => {
  it('heads Fund OUT as the design does, its total what was disbursed this month', () => {
    hub()
    expect(screen.getByRole('heading', { level: 1, name: 'Fund OUT' })).toBeInTheDocument()
    expect(screen.getByText('Fund · Fund OUT')).toBeInTheDocument()
    expect(screen.getByText('Fund out · October 2026')).toBeInTheDocument()
    // Carres (5 Oct) went through; The Conts waits; HOUZS Kitchen was cancelled; Hookka moved in September.
    expect(screen.getByText('RM 100,000.00', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create fund out' })).toBeInTheDocument()
  })

  it('draws the user’s cards in the design’s colours, Pending approval black', () => {
    hub()
    const all = cardBtn(/^All fund out/)
    expect(all).toHaveAttribute('data-tone', 'all')
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveTextContent('5 transfers · 1 pending')
    expect(all).toHaveTextContent('RM 200,000.00')
    expect(cardBtn(/^Active/)).toHaveAttribute('data-tone', 'approved')
    expect(cardBtn(/^Active/)).toHaveTextContent('2 transfers')
    expect(cardBtn(/^Overdue/)).toHaveAttribute('data-tone', 'issued')
    expect(cardBtn(/^Overdue/)).toHaveTextContent('RM 50,000.00')
    expect(cardBtn(/^Pending approval/)).toHaveAttribute('data-tone', 'pending_approval')
    expect(cardBtn(/^Repaid/)).toHaveAttribute('data-tone', 'paid')
    expect(cardBtn(/^Cancelled/)).toHaveAttribute('data-tone', 'quiet')
    expect(cardBtn(/^Cancelled/)).toHaveTextContent('RM 15,000.00')
  })

  it('lists a card’s deals, its count and sum the card’s, the amount red out and a cancelled one faint', () => {
    hub()
    expect(list()).toHaveLength(5)
    expect(screen.getByText('5 · RM 200,000.00')).toBeInTheDocument()
    const carres = list().find((r) => r.textContent?.includes('Carres'))!
    expect(within(carres).getByText('−RM 100,000.00')).toHaveAttribute('data-tone', 'danger')
    expect(within(carres).getByText('2.000% /mo · 12 months')).toBeInTheDocument()
    const cancelled = list().find((r) => r.textContent?.includes('HOUZS Kitchen'))!
    expect(within(cancelled).getByText('−RM 15,000.00')).toHaveAttribute('data-faint', 'true')

    fireEvent.click(cardBtn(/^Overdue/))
    expect(list()).toHaveLength(1)
    expect(list()[0]).toHaveTextContent('Hookka (HK)')
    expect(screen.getByText('1 · RM 50,000.00')).toBeInTheDocument()
    expect(window.location.search).toBe('?status=overdue')

    fireEvent.click(cardBtn(/^Cancelled/))
    expect(screen.getByText('1 · RM 15,000.00')).toBeInTheDocument()
  })

  it('gives a loan’s funding source a Source column of its own, after the Description — it filters, and search still finds it', async () => {
    hub()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Source/ }))
    const heads = screen.getAllByRole('columnheader').map((h) => h.querySelector('span')?.textContent)
    expect(heads).toEqual(['Name', 'Description', 'Source', 'Amount'])
    const carres = list().find((r) => r.textContent?.includes('Carres'))!
    expect(within(carres).getByText('HC')).toBeInTheDocument()
    expect(within(carres).queryByText(/SC HC/)).toBeNull()
    expect(within(list().find((r) => r.textContent?.includes('Hookka'))!).getByText('—')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter Source' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter · Source' })).getByRole('menuitemcheckbox', { name: /HC/ }))
    expect(list()).toHaveLength(1)
    expect(list()[0]).toHaveTextContent('Carres (CAR)')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter · Source' })).getByRole('button', { name: 'Clear' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Search company, description…' }), { target: { value: 'sc hc' } })
    expect(list()).toHaveLength(1)
    expect(list()[0]).toHaveTextContent('Carres (CAR)')
  })

  it('has no Source column on Fund IN', async () => {
    hub({ side: 'in', records: [deal({ id: 's', side: 'in', type: 'director_loan', typeLabel: 'Director loan' })] })
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    expect(screen.queryByRole('menuitemcheckbox', { name: /Source/ })).toBeNull()
  })

  it('opens on the card asked for, and searches party, description and notes', () => {
    hub({ initialCard: 'active' })
    expect(cardBtn(/^Active/)).toHaveAttribute('aria-pressed', 'true')
    expect(list()).toHaveLength(2)
    fireEvent.change(screen.getByPlaceholderText('Search company, description…'), { target: { value: '月息2%' } })
    expect(list()).toHaveLength(1)
    expect(list()[0]).toHaveTextContent('Carres (CAR)')
  })

  it('reads Fund IN as money in: +RM green, its own head and words', () => {
    const sources = [
      deal({ id: 's1', side: 'in', type: 'subsidiary', typeLabel: 'Subsidiary', party: 'HOUZS Century (HC)', amount: 300000, date: '2026-10-02', maturity: '2026-10-30' }),
      deal({ id: 's2', side: 'in', type: 'director_loan', typeLabel: 'Director loan', party: 'Loo K.W.', amount: 70000, date: '2026-08-01' }),
    ]
    hub({ side: 'in', records: sources, head: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Fund IN' })).toBeInTheDocument()
    expect(screen.getByText('Fund in · October 2026')).toBeInTheDocument()
    expect(cardBtn(/^All fund in/)).toHaveTextContent('2 transfers · 0 pending')
    expect(cardBtn(/^Subsidiary/)).toHaveAttribute('data-tone', 'approved')
    expect(cardBtn(/^Director saving/)).toHaveAttribute('data-tone', 'paid')
    expect(cardBtn(/^Director loan/)).toHaveAttribute('data-tone', 'payroll')
    expect(cardBtn(/^Dept pool/)).toHaveAttribute('data-tone', 'issued')
    expect(cardBtn(/^Outsource/)).toHaveAttribute('data-tone', 'company')
    expect(cardBtn(/^Pending approval/)).toHaveAttribute('data-tone', 'pending_approval')
    const hc = list().find((r) => r.textContent?.includes('HOUZS Century'))!
    expect(within(hc).getByText('+RM 300,000.00')).toHaveAttribute('data-tone', 'ledger')
    expect(within(hc).getByText('Subsidiary · 2.000% /mo · 12 months')).toBeInTheDocument()
  })
})

describe('the drawer', () => {
  it('shows a live loan: the hero, its groups, the trail, Amend terms', () => {
    hub()
    fireEvent.click(list().find((r) => r.textContent?.includes('Carres'))!)
    const d = drawer()
    expect(d).toHaveTextContent('Fund out · Loan out')
    expect(d).toHaveTextContent('−RM 100,000.00')
    expect(d).toHaveTextContent('To Carres (CAR)')
    expect(d).toHaveTextContent('Disbursed — bank and loan ledger are updated.')
    expect(within(d).getByText('Transfer to')).toBeInTheDocument()
    expect(within(d).getByText('SC HC')).toBeInTheDocument()
    expect(within(d).getByText('EMI 分期 · 月息2% · 12期')).toBeInTheDocument()
    expect(within(d).getByText('When & where')).toBeInTheDocument()
    expect(within(d).getByText('Booking')).toBeInTheDocument()
    expect(within(d).getByText('RM 80,000.00')).toBeInTheDocument()
    expect(within(d).getByText('RM 20,000.00 repaid')).toBeInTheDocument()
    expect(within(d).getByText('Created')).toBeInTheDocument()
    // The trail's step, by the approver.
    expect(within(d).getByText('Disbursed')).toBeInTheDocument()
    expect(within(d).getByText(/^Principal 05 Oct 2026/)).toBeInTheDocument()
    // Its switches only when on (both off here).
    expect(within(d).queryByText('Interest')).toBeNull()
    expect(within(d).getByRole('link', { name: 'View full page ↗' })).toHaveAttribute('href', '/fund-out/a')
    expect(within(d).getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/fund-out/a?print=1')
    expect(within(d).getByRole('link', { name: 'Amend terms' })).toHaveAttribute('href', '/fund-out/a/edit')
    expect(within(d).queryByRole('button', { name: 'Cancel loan' })).toBeNull()
  })

  it('says how much is overdue on a late loan', () => {
    hub()
    fireEvent.click(list().find((r) => r.textContent?.includes('Hookka'))!)
    expect(drawer()).toHaveTextContent('Overdue — RM 12,333.34 past its day since 20 Aug 2026.')
    expect(within(drawer()).getByText('since 20 Aug 2026 · 50 days')).toBeInTheDocument()
  })

  it('says a fund source’s bank, its account and its switches', () => {
    const sources = [
      deal({
        id: 's1', side: 'in', type: 'subsidiary', typeLabel: 'Subsidiary', party: 'HOUZS Century (HC)', amount: 150000, compound: true, minPayInterest: true,
        bank: { name: 'Hong Leong Bank', number: '23600599248' }, account: { code: '4052', name: 'Amount Due to - HOUZS Century' }, notes: '[BI#3] Conts - 58k',
      }),
    ]
    hub({ side: 'in', records: sources, head: null })
    fireEvent.click(list()[0])
    const d = drawer()
    expect(within(d).getByText('Received from')).toBeInTheDocument()
    expect(within(d).getByText('[BI#3] Conts - 58k')).toBeInTheDocument()
    expect(within(d).getByText('Hong Leong Bank')).toBeInTheDocument()
    expect(within(d).getByText('23600599248')).toBeInTheDocument()
    expect(within(d).getByText('Amount Due to - HOUZS Century')).toBeInTheDocument()
    expect(within(d).getByText('4052')).toBeInTheDocument()
    expect(within(d).getByText('Compound · Minimum pay')).toBeInTheDocument()
    expect(within(d).getByText('Received')).toBeInTheDocument()
  })

  it('sends whoever decides a pending loan to Approvals, and cancels it only when asked', async () => {
    withdraw.mockResolvedValueOnce(undefined)
    hub()
    fireEvent.click(list().find((r) => r.textContent?.includes('The Conts'))!)
    const d = drawer()
    expect(d).toHaveTextContent('Waiting for Principal approval before the money leaves.')
    expect(within(d).getByRole('link', { name: 'Open in Approvals' })).toHaveAttribute('href', '/approvals/req-1')
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel loan' }))
    const ask = screen.getByRole('dialog', { name: 'Cancel the loan to The Conts (CONTS)?' })
    expect(ask).toHaveTextContent('It never went out — the RM 30,000.00 loan is cancelled and its approval request closes.')
    expect(withdraw).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel loan' }))
    })
    expect(withdraw).toHaveBeenCalledWith('c')
    expect(mocks.flash).toHaveBeenCalledWith('Loan to The Conts (CONTS) cancelled')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('says a refusal in the confirm, and keeps it open', async () => {
    withdraw.mockResolvedValueOnce({ error: 'The loan was not cancelled: it is already approved' })
    hub()
    fireEvent.click(list().find((r) => r.textContent?.includes('The Conts'))!)
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Cancel loan' }))
    const ask = screen.getByRole('dialog', { name: 'Cancel the loan to The Conts (CONTS)?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel loan' }))
    })
    expect(within(ask).getByRole('alert')).toHaveTextContent('The loan was not cancelled: it is already approved')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('offers no step a reader may not take', () => {
    const notMine = LOANS.map((r) => (r.id === 'c' ? { ...r, decidable: false } : r))
    hub({ records: notMine, can: { edit: false, void: false, amend: false } })
    fireEvent.click(list().find((r) => r.textContent?.includes('The Conts'))!)
    expect(within(drawer()).queryByRole('link', { name: 'Open in Approvals' })).toBeNull()
    expect(within(drawer()).queryByRole('button', { name: 'Cancel loan' })).toBeNull()
    fireEvent.click(list().find((r) => r.textContent?.includes('Carres'))!)
    expect(within(drawer()).queryByRole('link', { name: 'Amend terms' })).toBeNull()
  })

  it('gives a pending fund source Edit and Withdraw', async () => {
    withdraw.mockResolvedValueOnce(undefined)
    const sources = [deal({ id: 's9', side: 'in', type: 'outsource', typeLabel: 'Outsource', party: 'Kingsley', amount: 8000, status: 'pending_approval', approvedAt: null, approvedBy: null })]
    hub({ side: 'in', records: sources, head: null })
    fireEvent.click(list()[0])
    const d = drawer()
    expect(d).toHaveTextContent('Fund in · Outsource')
    expect(d).toHaveTextContent('+RM 8,000.00')
    expect(d).toHaveTextContent('From Kingsley')
    expect(d).toHaveTextContent('Waiting for Principal approval before it is booked.')
    expect(within(d).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/fund-in/s9/edit')
    fireEvent.click(within(d).getByRole('button', { name: 'Withdraw' }))
    const ask = screen.getByRole('dialog', { name: 'Withdraw the fund source from Kingsley?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Withdraw' }))
    })
    expect(withdraw).toHaveBeenCalledWith('s9')
    expect(mocks.flash).toHaveBeenCalledWith('Fund source from Kingsley withdrawn')
  })

  it('opens from the right-click menu, which keeps Print schedule and Amend terms', () => {
    hub()
    fireEvent.contextMenu(list().find((r) => r.textContent?.includes('Carres'))!)
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Print schedule/ })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Amend terms/ }))
    expect(mocks.push).toHaveBeenCalledWith('/fund-out/a/edit')
  })
})
