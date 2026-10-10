import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Bank Reconciliation and the Journal Entries list per the
// user's Claude Design handoff (Phase 4 of the Finance revamp).
// Reconciliation: Upload statement in the head, one card per bank — "✓ Ties
// to GL" or the difference — and the monthly sessions with chips. Journal
// Entries: the list opens each voucher's own page, closing on a total.
// 2026-10-10 — the audit's fixes: Upload statement opens a modal (it was a
// form under the cards at ?upload=1), the sessions are a sheet table, and
// AUTO is the amber tag (it was a grey chip).

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('./_components/UploadStatementForm', () => ({ default: () => <form aria-label="Upload statement form" /> }))
vi.mock('./actions', () => ({ setSessionStatus: vi.fn(), deleteSession: vi.fn(), uploadStatement: vi.fn() }))
vi.mock('./journal-entries/actions', () => ({ deleteJournalVoucher: vi.fn() }))
// The tables' saved column layouts come from the browser client; here there are none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data: Record<string, unknown[]> = {
        bank_accounts: [
          { id: 'b1', bank_name: 'Hong Leong', account_number: '5123-0098-77', current_balance: 2095750, gl_account_code: '1010', is_primary: true },
          { id: 'b2', bank_name: 'Maybank', account_number: '5141-7720-9031', current_balance: 354250.2, gl_account_code: '1030', is_primary: false },
        ],
        trial_balance: [{ account_code: '1010', balance: 2095750 }, { account_code: '1030', balance: 351650.2 }],
        bank_recon_sessions: [
          { id: 's1', bank_account_id: 'b2', period_month: '2026-09-01', source_filename: 'MBB-sep.xlsx', status: 'open', created_at: '2026-10-02' },
          { id: 's2', bank_account_id: 'b1', period_month: '2026-09-01', source_filename: 'HL_SEP26.csv', status: 'done', created_at: '2026-10-01' },
        ],
        bank_recon_lines: [
          { session_id: 's1', match_kind: 'matched' }, { session_id: 's1', match_kind: null },
          { session_id: 's2', match_kind: 'matched' },
        ],
        journal_entries: [
          { id: 'je1', entry_no: 'HV-JV-2610-024', transaction_date: '2026-10-06', description: 'HC term loan interest accrual — Oct', segment: 'treasury', total_amount: 8163.33, reference_type: 'manual_jv', created_at: '2026-10-06' },
          { id: 'je2', entry_no: 'HV-JV-2610-021', transaction_date: '2026-10-05', description: 'Payroll accrual — Directors', segment: 'director', total_amount: 42920, reference_type: 'payroll_accrual', created_at: '2026-10-05' },
        ],
        journal_lines: [{ entry_id: 'je1' }, { entry_id: 'je1' }, { entry_id: 'je2' }, { entry_id: 'je2' }],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'range']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: data[table] ?? [], error: null }).then(res)
      return q
    },
  }),
}))

import ReconciliationPage from './page'
import JournalEntriesPage from './journal-entries/page'

const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['reconciliation'] }))
})

describe('Bank Reconciliation on the sheet', () => {
  it('shows each bank against the GL in a card', async () => {
    render(await ReconciliationPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · BANK RECONCILIATION')
    expect(card('Hong Leong · bank vs GL')).toHaveTextContent('✓ Ties to GL')
    expect(card('Hong Leong · bank vs GL')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Maybank · bank vs GL')).toHaveTextContent('RM 2,600.00')
    expect(card('Maybank · bank vs GL')).toHaveAttribute('data-tone', 'danger')
    expect(card('Maybank · bank vs GL')).toHaveTextContent('Cache 354,250.20 · GL 351,650.20')
  })

  it('opens the upload form in a modal from the head', async () => {
    render(await ReconciliationPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const button = screen.getByRole('button', { name: 'Upload statement' })
    expect(button.closest('.page-head')).not.toBeNull()
    fireEvent.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Upload statement' })
    expect(within(dialog).getByRole('form', { name: 'Upload statement form' })).toBeInTheDocument()
  })

  it('opens the modal for an old ?upload=1 link, and lists the sessions with chips', async () => {
    render(await ReconciliationPage({ searchParams: Promise.resolve({ upload: '1' }) }))
    expect(screen.getByRole('dialog', { name: 'Upload statement' })).toBeInTheDocument()
    const sessions = screen.getByRole('heading', { level: 2, name: 'Monthly reconciliations' }).closest('section') as HTMLElement
    expect(within(sessions).getByText('2 SESSIONS')).toBeInTheDocument()
    expect(within(sessions).getByRole('table').closest('.st-box')).not.toBeNull()
    const chip = (tr: HTMLElement, text: string) => within(tr).getAllByText(text).find((e) => !e.closest('.q-sub'))!.closest('.chip')
    const open = within(sessions).getByText('MBB-sep.xlsx').closest('tr') as HTMLElement
    expect(chip(open, 'open')).toHaveClass('alert')
    expect(within(open).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/reconciliation/s1')
    const done = within(sessions).getByText('HL_SEP26.csv').closest('tr') as HTMLElement
    expect(chip(done, 'done')).toHaveClass('ledger')
  })
})

describe('the Journal Entries list on the sheet', () => {
  it('opens each voucher on its own page and closes on a total', async () => {
    render(await JournalEntriesPage())
    expect(screen.getByRole('link', { name: '← Back to Reconciliation' })).toHaveAttribute('href', '/reconciliation')
    expect(screen.getByRole('link', { name: '+ New Entry' })).toHaveAttribute('href', '/reconciliation/journal-entries/new')
    const list = screen.getByRole('heading', { level: 2, name: 'Vouchers' }).closest('section') as HTMLElement
    expect(within(list).getByText('2 ENTRIES')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'HV-JV-2610-024' })).toHaveAttribute('href', '/reconciliation/journal-entries/je1')
    expect(within(list).getByText('AUTO')).toHaveClass('adm-tag')
    expect(list.querySelector('tfoot')).toHaveTextContent('51,083.33')
    expect(list.querySelector('.st-box')).not.toBeNull()
  })
})
