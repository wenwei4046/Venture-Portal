import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Journal Entries per the user's Claude Design handoff (Phase 4
// of the Finance revamp): the list opens each voucher on a page of its own —
// its number and a chip, the description, Date / Segment / Amount cards, the
// lines closing on their totals, and Delete / Copy / Edit (an auto payroll
// accrual offers Fix mistakes) — and the voucher form adds a line on Ins.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), notFound: vi.fn(), entry: null as Record<string, unknown> | null }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({ deleteJournalVoucher: vi.fn(), createJournalVoucher: vi.fn(), updateJournalVoucher: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data: Record<string, unknown> = {
        journal_entries: mocks.entry,
        journal_lines: [
          { account_code: '1300', debit: 8163.33, credit: 0, description: 'Accrued' },
          { account_code: '5027', debit: 0, credit: 8163.33, description: null },
        ],
        chart_of_accounts: [{ code: '1300', name: 'Interest receivable' }, { code: '5027', name: 'Interest Income - Loans' }],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q
      q.maybeSingle = async () => ({ data: data[table], error: null })
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: data[table], error: null }).then(res)
      return q
    },
  }),
}))

import JournalVoucherPage from './page'
import JournalVoucherForm from '../_components/JournalVoucherForm'

const entry = (reference_type = 'manual_jv') => ({
  id: 'je1', entry_no: 'HV-JV-2610-024', transaction_date: '2026-10-06', description: 'HC term loan interest accrual — Oct',
  segment: 'treasury', reference_type, total_amount: 8163.33, is_reversed: false,
})
const card = (name: string) => screen.getByRole('group', { name })
const page = () => JournalVoucherPage({ params: Promise.resolve({ id: 'je1' }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.entry = entry()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['reconciliation'] }))
  mocks.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

describe('a journal voucher’s own page', () => {
  it('heads with its number, a chip and the description, then three cards', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Journal Entries' })).toHaveAttribute('href', '/reconciliation/journal-entries')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · JOURNAL VOUCHER')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HV-JV-2610-024')
    expect(screen.getByText('posted').closest('.chip')).toHaveClass('ledger')
    expect(screen.getByText('HC term loan interest accrual — Oct')).toBeInTheDocument()
    expect(card('Date')).toHaveTextContent('06 Oct 2026')
    expect(card('Segment')).toHaveTextContent('Treasury')
    expect(card('Amount')).toHaveAttribute('data-tone', 'primary')
    expect(card('Amount')).toHaveTextContent('RM 8,163.33')
    expect(card('Amount')).toHaveTextContent('Balanced · debits = credits')
  })

  it('lists the lines closing on their totals, and offers Delete, Copy and Edit', async () => {
    render(await page())
    const lines = screen.getByRole('heading', { level: 2, name: 'Lines' }).closest('section') as HTMLElement
    expect(within(lines).getByText('2 LINES')).toBeInTheDocument()
    expect(within(lines).getByText('1300 · Interest receivable').closest('tr')).toHaveTextContent('8,163.33')
    expect(within(lines).getByText('1300 · Interest receivable').closest('tr')).toHaveTextContent('Accrued')
    expect(lines.querySelector('tfoot')).toHaveTextContent('Total')
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/reconciliation/journal-entries/je1/edit')
    expect(screen.getByRole('link', { name: 'Copy' })).toHaveAttribute('href', '/reconciliation/journal-entries/new?from=je1')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('offers an auto payroll accrual Fix mistakes', async () => {
    mocks.entry = entry('payroll_accrual')
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · JOURNAL VOUCHER · AUTO')
    expect(screen.getByText('auto · payroll').closest('.chip')).toHaveClass('info')
    expect(screen.getByRole('link', { name: 'Fix mistakes' })).toHaveAttribute('href', '/reconciliation/journal-entries/je1/edit')
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('is not found for another kind of entry', async () => {
    mocks.entry = entry('payment_voucher')
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('the voucher form', () => {
  it('adds a line on Ins and puts the cursor in its account', () => {
    render(<JournalVoucherForm accounts={[]} />)
    expect(document.querySelectorAll('[data-jv-line]')).toHaveLength(2)
    fireEvent.keyDown(screen.getByLabelText(/^Description/), { key: 'Insert' })
    const lines = document.querySelectorAll('[data-jv-line]')
    expect(lines).toHaveLength(3)
    expect(document.activeElement).toBe(lines[2].querySelector('input'))
  })
})
