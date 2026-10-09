import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { DailyBankData } from '@/lib/daily-bank-data'

// 2026-10-09 — Daily Bank per the user's Claude Design handoff (Phase 3 of the
// Finance revamp): the day beside the title with ← and →, PNG / PDF / Get
// image at the head, five cards (Balance B/F, Received today, Pending
// payment, Total available, Banks), the Bank × Department board on the sheet
// — a band per bank's B/F, money in green, pending in brown parentheses, the
// available row on green — and a By bank view, one table per bank.

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))

import DailyBankView from './DailyBankView'

const COLUMNS = [
  { key: 'venture', label: 'Venture' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'finance', label: 'Finance' },
]
const amounts = (venture: number, marketing: number, finance: number) => ({ venture, marketing, finance })

function data(date = '2026-10-09'): DailyBankData {
  const hlb = {
    bankId: 'b-hlb', bankName: 'Hong Leong', glCode: '3001',
    bf: amounts(1000, 500, 0), inToday: amounts(200, 0, 0), outToday: amounts(0, 0, 0), current: amounts(1200, 500, 0),
    pending: [{ voucherNo: 'HV-PV-202610-0041', payee: 'Syarikat Logistik', description: 'Warehouse rental Oct', amounts: amounts(300, 0, 0), total: 300 }],
    pendingTotal: amounts(300, 0, 0), available: amounts(900, 500, 0),
    receipts: [{ voucherNo: 'HV-OR-202610-0050', payer: 'HOUZS Century', description: 'Settles HV-INV-202610-0013', amount: 200 }],
    otherInToday: 0,
  }
  const alliance = {
    bankId: 'b-all', bankName: 'Alliance', glCode: '3002',
    bf: amounts(0, 0, -50), inToday: amounts(0, 0, 0), outToday: amounts(0, 0, 0), current: amounts(0, 0, -50),
    pending: [], pendingTotal: amounts(0, 0, 0), available: amounts(0, 0, -50), receipts: [], otherInToday: 0,
  }
  return { date, banks: [hlb, alliance], totals: { available: amounts(900, 500, -50), grand: 1350 }, columns: COLUMNS }
}

const card = (name: string) => screen.getByRole('group', { name })
const head = (title: string) => screen.getByRole('heading', { name: title }).closest('.sect-head') as HTMLElement
const tableOf = (title: string) => head(title).parentElement?.querySelector('table') as HTMLTableElement
const headers = (table: HTMLTableElement) => Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)
const rowOf = (table: HTMLTableElement, text: string) => within(table).getByText(text).closest('tr') as HTMLElement

beforeEach(() => vi.clearAllMocks())

describe('Daily Bank on the sheet', () => {
  it('heads with the day between its arrows, and the image, PNG and PDF', () => {
    render(<DailyBankView data={data()} today="2026-10-09" />)
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · DAILY BANK')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Daily Bank')
    expect(screen.getByText('Today · 9 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(mocks.push).toHaveBeenCalledWith('/daily-bank?date=2026-10-08')
    fireEvent.change(screen.getByLabelText('Pick a day'), { target: { value: '2026-10-01' } })
    expect(mocks.push).toHaveBeenCalledWith('/daily-bank?date=2026-10-01')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/daily-bank/export?date=2026-10-09')
    expect(screen.getByRole('button', { name: 'PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get image' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
  })

  it('offers the way back to today from another day', () => {
    render(<DailyBankView data={data('2026-10-07')} today="2026-10-09" />)
    expect(screen.getByText('7 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(mocks.push).toHaveBeenCalledWith('/daily-bank?date=2026-10-09')
  })

  it('sums the day in five cards', () => {
    render(<DailyBankView data={data()} today="2026-10-09" />)
    expect(card('Balance B/F')).toHaveTextContent('RM 1,450.00')
    expect(card('Received today')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Received today')).toHaveTextContent('RM 200.00')
    expect(card('Received today')).toHaveTextContent('1 receipt')
    expect(card('Pending payment')).toHaveAttribute('data-tone', 'wait')
    expect(card('Pending payment')).toHaveTextContent('RM 300.00')
    expect(card('Pending payment')).toHaveTextContent('1 awaiting Principal')
    expect(card('Total available')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total available')).toHaveTextContent('RM 1,350.00')
    expect(card('Total available')).toHaveTextContent('Cash truly free')
    expect(card('Banks')).toHaveTextContent('2')
    expect(card('Banks')).toHaveTextContent('3 departments')
  })

  it('draws the Bank × Department board: a band per bank, money in green, pending in parentheses, the available row', () => {
    render(<DailyBankView data={data()} today="2026-10-09" />)
    expect(screen.getByRole('button', { name: /^Bank × Department/ })).toHaveAttribute('data-active')
    expect(head('Bank × Department').querySelector('.count')).toHaveTextContent('TODAY · 9 OCT 2026')
    const board = tableOf('Bank × Department')
    expect(headers(board)).toEqual(['Bank \\ Dept', 'Venture', 'Marketing', 'Finance', 'Total'])
    const band = rowOf(board, 'Hong Leong · Balance B/F')
    expect(band).toHaveClass('db-band')
    expect(band).toHaveTextContent('1,500.00')
    const received = rowOf(board, '· Received today')
    expect(received.querySelector('.db-in')).toHaveTextContent('200.00')
    const pending = rowOf(board, '· Syarikat Logistik')
    expect(within(pending).getByText('Pending')).toHaveClass('chip')
    expect(pending).toHaveTextContent('HV-PV-202610-0041 · Warehouse rental Oct')
    expect(pending.querySelector('.db-pend')).toHaveTextContent('(300.00)')
    const available = within(board).getAllByText('⌊ Available balance')[0].closest('tr') as HTMLElement
    expect(available).toHaveClass('db-avail')
    expect(available).toHaveTextContent('1,400.00')
    // Alliance's finance column is overdrawn: red parentheses.
    expect(rowOf(board, 'Alliance · Balance B/F').querySelector('.db-neg')).toHaveTextContent('(50.00)')
    const foot = board.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total available')
    expect(foot).toHaveTextContent('1,350.00')
    expect(document.querySelector('.db-note')).toHaveTextContent('Each department column reads top→bottom')
  })

  it('on a phone reads the board as a card per bank: what is free, how it got there, what waits', () => {
    render(<DailyBankView data={data()} today="2026-10-09" />)
    const phone = document.querySelector('.db-phone') as HTMLElement
    expect(phone).toHaveClass('md:hidden')
    expect(tableOf('Bank × Department').closest('.db-box')).toHaveClass('hidden', 'md:block')
    const [hlb, alliance] = Array.from(phone.querySelectorAll<HTMLElement>('.db-card'))
    expect(hlb.querySelector('.db-card-head')).toHaveTextContent('Hong Leong')
    expect(hlb.querySelector('.db-card-head')).toHaveTextContent('1,400.00')
    expect(hlb.querySelector('.db-card-head')).toHaveTextContent('B/F 1,500.00 · +200.00 · −300.00')
    const venture = within(hlb).getByText('Venture').closest('.db-card-dept') as HTMLElement
    expect(venture).toHaveTextContent('900.00')
    expect(venture).toHaveTextContent('B/F 1,000.00 · +200.00 · −300.00')
    expect(within(hlb).queryByText('Finance')).toBeNull() // nothing moved there
    expect(hlb.querySelector('.db-card-pend')).toHaveTextContent('Syarikat Logistik · Venture')
    expect(hlb.querySelector('.db-card-pend')).toHaveTextContent('(300.00)')
    expect(alliance.querySelector('.db-card-head .db-neg')).toHaveTextContent('(50.00)')
    expect(phone.querySelector('.db-card-total')).toHaveTextContent('Total available')
    expect(phone.querySelector('.db-card-total')).toHaveTextContent('1,350.00')
  })

  it('lists each bank on its own in By bank', () => {
    render(<DailyBankView data={data()} today="2026-10-09" />)
    const tab = screen.getByRole('button', { name: /^By bank/ })
    expect(tab.querySelector('[data-tab-count]')).toHaveTextContent('2')
    fireEvent.click(tab)
    expect(head('Hong Leong').querySelector('.count')).toHaveTextContent('BANK BALANCE RM 1,700.00')
    const hlb = tableOf('Hong Leong')
    expect(headers(hlb)).toEqual(['Pay to', 'PV No.', 'Description', 'Received (RM)', 'Pending payment (RM)'])
    expect(rowOf(hlb, '· HOUZS Century')).toHaveTextContent('HV-OR-202610-0050')
    expect(rowOf(hlb, '· HOUZS Century').querySelector('.db-in')).toHaveTextContent('200.00')
    expect(rowOf(hlb, '· Syarikat Logistik').querySelector('.db-pend')).toHaveTextContent('(300.00)')
    expect(hlb.querySelector('tfoot')).toHaveTextContent('Available (after pending)')
    expect(hlb.querySelector('tfoot')).toHaveTextContent('1,400.00')
    expect(tableOf('Alliance').querySelector('tfoot .db-neg')).toHaveTextContent('(50.00)')
  })
})
