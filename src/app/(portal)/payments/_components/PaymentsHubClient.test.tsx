import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { HubLedger, HubRow } from '../_lib/hub-ledger'

// Payments' hub (2026-10-14, the Finance revamp v2 — D02–D05): the cards pick
// the list at once (the URL keeps it), the search narrows it, a voucher opens
// the drawer, a salary batch its card, and the head's requests are menus.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), drawer: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
// The dialog's own behaviour is CreatePaymentDialog.test.tsx's; here, only that the hub opens and closes it.
vi.mock('./CreatePaymentDialog', () => ({
  default: ({ open, onClose, prefix }: { open: boolean; onClose: () => void; prefix: string }) =>
    open ? (
      <div data-testid="create-dialog">
        {prefix}
        <button type="button" onClick={onClose}>
          Close dialog
        </button>
      </div>
    ) : null,
}))
vi.mock('./VoucherDrawer', async (orig) => {
  const real = await orig<typeof import('./VoucherDrawer')>()
  return { ...real, VoucherDrawer: ({ id }: { id: string | null }) => (mocks.drawer(id), id ? <div data-testid="drawer">{id}</div> : null) }
})
vi.mock('./AmendDateButton', () => ({ default: () => null }))
vi.mock('./AmendRepaymentButton', () => ({ default: () => null }))

import PaymentsHubClient from './PaymentsHubClient'

const row = (over: Partial<HubRow> & { id: string }): HubRow => ({
  kind: 'voucher',
  no: `HV-PV-202610-${over.id}`,
  name: 'Tenaga Nasional',
  desc: 'Electricity Sep',
  amount: 100,
  status: 'paid',
  date: '2026-10-05',
  cat: 'Utilities',
  pool: 'Venture Pool',
  bank: null,
  href: null,
  cards: ['all', over.status ?? 'paid'] as HubRow['cards'],
  items: 1,
  batch: null,
  amendDate: null,
  amendAmount: false,
  ...over,
})

const LEDGER: HubLedger = {
  receipts: false,
  seesPayroll: true,
  byPerson: true,
  hero: { label: 'Total paid · October 2026', amount: 256684.6 },
  cards: [
    { key: 'all', count: 6, other: 1, amount: 67020.6 },
    { key: 'draft', count: 1, other: 0, amount: 1386 },
    { key: 'pending_approval', count: 1, other: 0, amount: 25000 },
    { key: 'approved', count: 0, other: 0, amount: 0 },
    { key: 'paid', count: 1, other: 1, amount: 15934.6 },
    { key: 'voided', count: 1, other: 0, amount: 18500 },
    { key: 'payroll', count: 1, other: 0, amount: 6200 },
  ],
  rows: [
    row({ id: '0001', name: 'Meta Platforms Ireland', desc: 'FB ads top-up', amount: 25000, status: 'pending_approval', cards: ['all', 'pending_approval'] }),
    row({ id: '0002', name: 'Google Asia Pacific', desc: 'Workspace Oct', amount: 1386, status: 'draft', cards: ['all', 'draft'] }),
    row({ id: '0003', amount: 2184.6 }),
    row({ id: '0004', name: 'Syarikat Logistik Jaya', amount: 18500, status: 'voided', cards: ['all', 'voided'] }),
    row({ id: 'batch:all:Payroll disbursement Sep 2026', kind: 'batch', no: null, name: 'Payroll disbursement Sep 2026', desc: '2 vouchers · all paid', amount: 6200, cards: ['all'], items: 2, batch: 'Payroll disbursement Sep 2026', cat: 'Payroll' }),
    row({ id: 'fsr-1', kind: 'extra', no: null, name: 'HOUZS Mattress (HM)', href: '/fund-in/fs9', amount: 13750 }),
  ],
  batches: [
    {
      key: 'Payroll disbursement Sep 2026',
      name: 'Payroll disbursement Sep 2026',
      count: 2,
      total: 6200,
      latest: '2026-10-06',
      statusText: 'all paid',
      locked: false,
      members: [
        { id: '0101', who: 'Aina Rahman', no: 'HV-PV-202610-0101', amount: 3000, status: 'paid' },
        { id: '0102', who: 'Lim Wei Jie', no: 'HV-PV-202610-0102', amount: 3200, status: 'paid' },
      ],
    },
  ],
  initialCard: 'all',
  initialQuery: '',
  empty: false,
}

const draw = (over: Partial<Parameters<typeof PaymentsHubClient>[0]> = {}) =>
  render(
    <PaymentsHubClient
      ledger={LEDGER}
      canCreate
      canSetDefault={false}
      canExport
      create={{ prefix: 'HV-PV-202610', today: '2026-10-14', open: false, initial: null }}
      {...over}
    />,
  )
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/payments')
})

describe('the head', () => {
  // 2026-10-29: Payments › Payment voucher — what is sent to be paid (Dept, Payroll, Claims) is Payment request's.
  it('says Daily · Payments › Payment voucher, with Create payment and Export, and no request menus', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payment voucher')
    expect(screen.getByRole('button', { name: 'Create payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeInTheDocument()
    for (const gone of [/^Dept/, /^Payroll( · \d+)?$/, /^Claims/]) expect(screen.queryByRole('button', { name: gone })).toBeNull()
  })

  it('has no Create payment without Create, no Export without Export', async () => {
    draw({ canCreate: false, canExport: false })
    await act(async () => undefined)
    expect(screen.queryByRole('button', { name: 'Create payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export ▾' })).toBeNull()
  })

  it('Create payment opens the dialog at once, on the page', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.queryByTestId('create-dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create payment' }))
    expect(screen.getByTestId('create-dialog')).toHaveTextContent('HV-PV-202610')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('arrives with it open from the Overview (?new=1), and closing it leaves the URL', async () => {
    window.history.replaceState(null, '', '/payments?new=1')
    draw({ create: { prefix: 'HV-PV-202610', today: '2026-10-14', open: true, initial: null } })
    await act(async () => undefined)
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByTestId('create-dialog')).toBeNull()
    expect(window.location.search).toBe('')
  })
})

describe('the cards and the list', () => {
  it('opens on All, the total and every card', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByText('Total paid · October 2026')).toBeInTheDocument()
    expect(screen.getByText('RM 256,684.60')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All vouchers/ })).toHaveAttribute('aria-pressed', 'true')
    expect(names()).toHaveLength(6)
  })

  it('a card and its list count alike: the folded batch its members, the money outside the flow apart', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('button', { name: /All vouchers/ })).toHaveTextContent('6 vouchers · 1 other')
    // 4 vouchers + the batch's 2 + the repayment outside the flow, the same RM.
    expect(screen.getByText('7 · RM 67,020.60')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Paid/ })).toHaveTextContent('1 voucher · 1 other')
  })

  it('a card picks its list at once, and the URL keeps it', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: /^.*Pending approval/ }))
    expect(names()).toEqual(['Meta Platforms Ireland'])
    expect(window.location.search).toBe('?status=pending_approval')
  })

  it('the search narrows by number, name, description, category or pool', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByPlaceholderText('Search voucher #, payee, description…'), { target: { value: 'workspace' } })
    expect(names()).toEqual(['Google Asia Pacific'])
  })

  it('a voucher opens the drawer; money outside the flow its own page; a batch its card, opened', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByText('Meta Platforms Ireland'))
    expect(screen.getByTestId('drawer')).toHaveTextContent('0001')
    fireEvent.click(screen.getByText('HOUZS Mattress (HM)'))
    expect(mocks.push).toHaveBeenCalledWith('/fund-in/fs9')
    fireEvent.click(screen.getAllByText('Payroll disbursement Sep 2026')[0])
    expect(screen.getByRole('button', { name: /Payroll batches/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Aina Rahman')).toBeInTheDocument()
  })

  it('Payroll batches: the band counts them, a member opens the drawer', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: /Payroll batches/ }))
    expect(screen.getAllByText('1 batch · 2 vouchers').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Payroll disbursement Sep 2026/ }))
    expect(screen.getByText('2 vouchers · all paid · 06 Oct 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Lim Wei Jie/ }))
    expect(screen.getByTestId('drawer')).toHaveTextContent('0102')
  })
})
