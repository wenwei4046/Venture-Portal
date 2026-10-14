import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import Link from 'next/link'
import type { HubLedger, HubRow } from '../_lib/hub-ledger'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): Payments' hub read
// as receipts — *Receive*, the cards All receipts … Received … Voided (no
// payroll), the figures +RM in green, Bank among the columns, the page's own
// first buttons, the exports of the credit side; no requests.

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
vi.mock('./VoucherDrawer', async (orig) => {
  const real = await orig<typeof import('./VoucherDrawer')>()
  return { ...real, VoucherDrawer: ({ id }: { id: string | null }) => (mocks.drawer(id), id ? <div data-testid="drawer">{id}</div> : null) }
})
vi.mock('./AmendDateButton', () => ({ default: () => null }))
vi.mock('./AmendRepaymentButton', () => ({ default: () => null }))

import VoucherHub from './VoucherHub'

const row = (over: Partial<HubRow> & { id: string }): HubRow => ({
  kind: 'voucher',
  no: `HV-OR-202610-${over.id}`,
  name: 'HOUZS Century',
  desc: 'Settle 1 invoice(s) — HOUZS Century (HV-INV-202609-0058)',
  amount: 25768.1,
  status: 'paid',
  date: '2026-10-10',
  cat: 'AR - HOUZS Century',
  pool: 'Venture Pool',
  bank: 'Hong Leong Bank',
  href: null,
  cards: ['all', over.status ?? 'paid'] as HubRow['cards'],
  items: 1,
  batch: null,
  amendDate: null,
  amendAmount: false,
  ...over,
})

const LEDGER: HubLedger = {
  receipts: true,
  seesPayroll: true,
  byPerson: true,
  hero: { label: 'Total received · October 2026', amount: 132331.89 },
  cards: [
    { key: 'all', count: 2, other: 1, amount: 27268.1 },
    { key: 'draft', count: 0, other: 0, amount: 0 },
    { key: 'pending_approval', count: 0, other: 0, amount: 0 },
    { key: 'approved', count: 0, other: 0, amount: 0 },
    { key: 'paid', count: 1, other: 1, amount: 26768.1 },
    { key: 'voided', count: 1, other: 0, amount: 500 },
  ],
  rows: [
    row({ id: '0522' }),
    row({ id: '0470', name: 'Hookka', amount: 500, status: 'voided', cards: ['all', 'voided'] }),
    row({ id: 'rpy-1', kind: 'extra', no: null, name: 'The Cont', desc: 'Loan repayment', amount: 1000, href: '/fund-out/l1', bank: 'Alliance Bank' }),
  ],
  batches: [],
  initialCard: 'all',
  initialQuery: '',
  empty: false,
}

const draw = () =>
  render(
    <VoucherHub
      ledger={LEDGER}
      canSetDefault={false}
      dept={[]}
      payroll={null}
      claims={[]}
      actions={
        <>
          <Link href="/payments/new?mode=receipt">Create receipt</Link>
          <Link href="/payments/new?mode=loan_repayment">Loan repayment</Link>
        </>
      }
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/receipts')
})

describe('Receipt’s hub', () => {
  it('says Daily · Receive, its own first buttons and Export — no requests', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByText('Daily · Receive')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Receive')
    expect(screen.getByRole('link', { name: 'Create receipt' })).toHaveAttribute('href', '/payments/new?mode=receipt')
    expect(screen.getByRole('link', { name: 'Loan repayment' })).toHaveAttribute('href', '/payments/new?mode=loan_repayment')
    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dept/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Claims/ })).toBeNull()
  })

  it('its cards: All receipts … Received … Voided, in receipts and +RM, no payroll', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByText('Total received · October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All receipts/ })).toHaveTextContent('2 receipts · 1 other')
    expect(screen.getByRole('button', { name: /All receipts/ })).toHaveTextContent('+RM 27,268.10')
    expect(screen.getByRole('button', { name: /^Received/ })).toHaveTextContent('1 receipt · 1 other')
    expect(screen.queryByRole('button', { name: /Payroll batches/ })).toBeNull()
  })

  it('its list: the figures +RM, green unless voided; the search asks for receipts', async () => {
    draw()
    await act(async () => undefined)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const amountOf = (r: HTMLElement) => within(r).getAllByRole('cell').at(-1)!
    expect(amountOf(rows[0])).toHaveTextContent('+RM 25,768.10')
    expect(amountOf(rows[0])).toHaveAttribute('data-tone', 'ledger')
    expect(amountOf(rows[1])).not.toHaveAttribute('data-tone')
    expect(screen.getByPlaceholderText('Search receipt #, from, description…')).toBeInTheDocument()
    expect(screen.getByText('3 · RM 27,268.10')).toBeInTheDocument()
  })

  it('Bank is among the columns to tick; Category is not', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(screen.getByRole('menuitemcheckbox', { name: /Bank/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemcheckbox', { name: /Category/ })).toBeNull()
  })

  it('a receipt opens the drawer; money outside the flow its own page', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getAllByText('HOUZS Century')[0])
    expect(screen.getByTestId('drawer')).toHaveTextContent('0522')
    fireEvent.click(screen.getByText('The Cont'))
    expect(mocks.push).toHaveBeenCalledWith('/fund-out/l1')
  })

  it('exports the credit side', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }))
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excel' }))
    expect(assign).toHaveBeenCalledWith('/payments/export?format=xlsx&direction=credit')
  })
})
