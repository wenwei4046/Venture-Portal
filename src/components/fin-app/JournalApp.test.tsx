import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { JournalHubModel, JournalRecordModel } from '@/lib/fin-app/journal-model'

// Daily › Journal Entries in the Finance phone app (2026-10-15, part 5c): the
// hub's cards open their lists, a voucher opens as its page with the desktop
// page's steps; the voucher sheet posts through the page's own RPCs, answered
// in words; Delete is asked first.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  openVoucher: vi.fn(),
  openSheet: vi.fn(),
  post: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/journal',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/reconciliation/journal-entries/page-actions', () => ({ openJournalVoucher: mocks.openVoucher, openJournalSheet: mocks.openSheet }))
vi.mock('@/app/(portal)/reconciliation/journal-entries/actions', () => ({
  postJournalVoucherInWords: mocks.post,
  saveJournalVoucherInWords: mocks.save,
  deleteJournalVoucherInWords: mocks.remove,
}))

import FinAppFrame from './FinAppFrame'
import JournalApp from './JournalApp'
import { resetNav } from './nav'

const HUB: JournalHubModel = {
  hero: { value: 'RM 100.00', label: 'Posted · October 2026' },
  cards: [
    { key: 'month', tone: 'all', icon: 'calendar', label: 'This month', sub: '1 voucher', value: 'RM 100.00' },
    { key: 'manual', tone: 'company', icon: 'doc', label: 'Manual vouchers', sub: '1 voucher', value: 'RM 100.00' },
    { key: 'auto', tone: 'payroll', icon: 'payroll', label: 'Payroll accruals', sub: '0 vouchers · auto', value: 'RM 0.00' },
  ],
  lists: {
    month: [{ id: 'jv-1', title: 'Interest accrual', desc: '5 Oct 2026 · 2 lines · Venture (Office)', amount: 100, ym: '2026-10', auto: false }],
    manual: [{ id: 'jv-1', title: 'Interest accrual', desc: '5 Oct 2026 · 2 lines · Venture (Office)', amount: 100, ym: '2026-10', auto: false }],
    auto: [],
  },
}

const RECORD: JournalRecordModel = {
  id: 'jv-1',
  no: 'JE-202610-0001',
  auto: false,
  date: '2026-10-05',
  dateWords: '5 Oct 2026',
  description: 'Interest accrual',
  segment: 'corporate',
  segmentWords: 'Venture (Office)',
  debit: 100,
  credit: 100,
  balanced: true,
  lines: [
    { account: '1300', name: 'Interest receivable', debit: 100, credit: 0, note: null },
    { account: '5027', name: 'Interest Income - Loans', debit: 0, credit: 100, note: null },
  ],
  can: { edit: true, copy: true, delete: true },
}

const ACCOUNTS = [
  { code: '1300', name: 'Interest receivable', type: 'asset' as const, parent_code: null, is_active: true },
  { code: '5027', name: 'Interest Income - Loans', type: 'revenue' as const, parent_code: null, is_active: true },
]

const draw = (search = '', record: JournalRecordModel | null = null) =>
  render(
    <FinAppFrame platform="android" rows={['journal']}>
      <JournalApp hub={HUB} search={search} today="2026-10-15" canCreate record={record} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/journal')
  mocks.openVoucher.mockResolvedValue({ ok: true, record: RECORD })
  mocks.openSheet.mockResolvedValue({ ok: true, accounts: ACCOUNTS, prefill: null })
})
afterEach(() => vi.clearAllMocks())

describe('Journal Entries on the phone', () => {
  it('a card opens its list, a voucher its page with the desktop page’s steps', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Manual vouchers/ }))
    expect(window.location.search).toBe('?f=manual')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Interest accrual/ }))
    })
    expect(mocks.openVoucher).toHaveBeenCalledWith('jv-1')
    expect(screen.getAllByText('JE-202610-0001').length).toBeGreaterThan(0)
    expect(screen.getByText('1300 · Interest receivable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('+ New entry posts a balanced voucher and opens it', async () => {
    mocks.post.mockResolvedValue({ ok: true, id: 'jv-9' })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New entry' }))
    })
    const sheet = await screen.findByRole('dialog', { name: 'New journal voucher' })
    fireEvent.change(within(sheet).getByLabelText('Description'), { target: { value: 'Interest accrual — Oct' } })
    fireEvent.change(within(sheet).getByLabelText('Line 1 account'), { target: { value: '1300' } })
    fireEvent.change(within(sheet).getByLabelText('Line 1 debit'), { target: { value: '100' } })
    fireEvent.change(within(sheet).getByLabelText('Line 2 account'), { target: { value: '5027' } })
    fireEvent.change(within(sheet).getByLabelText('Line 2 credit'), { target: { value: '100' } })
    expect(within(sheet).getByText('Balanced')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Post entry' }))
    })
    expect(mocks.post).toHaveBeenCalledWith({
      transaction_date: '2026-10-15',
      description: 'Interest accrual — Oct',
      segment: 'unallocated',
      lines: [
        { account_code: '1300', debit: 100, credit: 0, description: undefined },
        { account_code: '5027', debit: 0, credit: 100, description: undefined },
      ],
    })
    expect(mocks.flash).toHaveBeenCalledWith('Voucher posted')
    expect(window.location.search).toBe('?id=jv-9')
  })

  it('an unbalanced voucher is held back, saying by how much; a refusal stays in the sheet in words', async () => {
    mocks.post.mockResolvedValue({ ok: false, reason: 'Account 1000 is a header account' })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New entry' }))
    })
    const sheet = await screen.findByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Description'), { target: { value: 'x' } })
    fireEvent.change(within(sheet).getByLabelText('Line 1 account'), { target: { value: '1300' } })
    fireEvent.change(within(sheet).getByLabelText('Line 1 debit'), { target: { value: '100' } })
    fireEvent.change(within(sheet).getByLabelText('Line 2 account'), { target: { value: '5027' } })
    fireEvent.change(within(sheet).getByLabelText('Line 2 credit'), { target: { value: '90' } })
    expect(within(sheet).getByText('Out of balance · 10.00')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Post entry' }))
    })
    expect(mocks.post).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('Line 2 credit'), { target: { value: '100' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Post entry' }))
    })
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Account 1000 is a header account')
  })

  it('Delete is the ⋯’s, asked first, then back to the list', async () => {
    mocks.remove.mockResolvedValue({ ok: true, id: 'jv-1' })
    window.history.replaceState(null, '', '/fin-app/page/journal?id=jv-1&from=manual')
    await act(async () => {
      draw('id=jv-1&from=manual', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Delete voucher' }))
    const ask = await screen.findByRole('dialog', { name: 'Delete JE-202610-0001?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Delete voucher' }))
    })
    expect(mocks.remove).toHaveBeenCalledWith('jv-1')
    expect(mocks.flash).toHaveBeenCalledWith('JE-202610-0001 deleted')
    expect(window.location.search).toBe('?f=manual')
  })
})
