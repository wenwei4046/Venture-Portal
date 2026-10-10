import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-10 — the handoff's Credit notes: a sortable sheet table with ▽
// filters, "N CREDIT NOTES", the CN # and Invoice # in the body face (Inter
// 500, not the mono), the status as a chip, and the actions a credit note has
// in its state — PDF; Approve / Delete a draft; Void an approved one.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), approveCreditNote: vi.fn(), deleteCreditNote: vi.fn(), voidCreditNote: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))
vi.mock('../actions', () => ({
  approveCreditNote: mocks.approveCreditNote,
  deleteCreditNote: mocks.deleteCreditNote,
  voidCreditNote: mocks.voidCreditNote,
}))

import CreditNotesList, { type CreditNoteRow } from './CreditNotesList'

const cn = (id: string, over: Partial<CreditNoteRow> = {}): CreditNoteRow => ({
  id,
  credit_note_no: `HV-CN-202610-000${id}`,
  invoice_no: 'HV-INV-202610-0011',
  party: 'HOUZS Bedding',
  amount: 220.4,
  reason: 'Overbilled 1 staff — left in Sep',
  status: 'draft',
  category_label: '5020 · Salary Income',
  created_at: '2026-10-05T02:00:00Z',
  ...over,
})
const ROWS = [cn('1'), cn('2', { status: 'approved', amount: 1500 }), cn('3', { status: 'voided', amount: 99 })]
const rowOf = (no: string) => screen.getByText(no).closest('tr') as HTMLElement

beforeEach(() => vi.clearAllMocks())

describe('Credit notes on the sheet', () => {
  it('counts them and lists them in a sortable table, the numbers in the body face', () => {
    render(<CreditNotesList rows={ROWS} />)
    const head = screen.getByRole('heading', { name: 'Credit notes' }).closest('.sect-head') as HTMLElement
    expect(head.querySelector('.count')).toHaveTextContent('3 CREDIT NOTES')
    const heads = Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
    expect(heads).toEqual(['cn', 'invoice', 'party', 'category', 'reason', 'amount', 'status', 'action'])
    const no = screen.getByText('HV-CN-202610-0001')
    expect(no).toHaveClass('font-sans', 'font-medium')
    expect(no.closest('td')?.className ?? '').not.toMatch(/font-mono/)
    expect(within(rowOf('HV-CN-202610-0001')).getByText('HV-INV-202610-0011')).toHaveClass('font-sans', 'font-medium')
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
  })

  it('chips each state — a draft quiet, approved orange, voided red', () => {
    render(<CreditNotesList rows={ROWS} />)
    expect((within(rowOf('HV-CN-202610-0001')).getByText('draft').closest('.chip') as HTMLElement).className.trim()).toBe('chip')
    expect(within(rowOf('HV-CN-202610-0002')).getByText('approved').closest('.chip')).toHaveClass('accent')
    expect(within(rowOf('HV-CN-202610-0003')).getByText('voided').closest('.chip')).toHaveClass('danger')
  })

  it('offers what each state can do, and asks in English before voiding', async () => {
    const ask = vi.fn(() => true)
    vi.stubGlobal('confirm', ask)
    mocks.voidCreditNote.mockResolvedValue(undefined)
    render(<CreditNotesList rows={ROWS} />)
    const draft = within(rowOf('HV-CN-202610-0001'))
    expect(draft.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/billing/credit-note-doc?id=1')
    expect(draft.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(draft.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    const approved = within(rowOf('HV-CN-202610-0002'))
    expect(approved.queryByRole('button', { name: 'Approve' })).toBeNull()
    await act(async () => {
      fireEvent.click(approved.getByRole('button', { name: 'Void' }))
    })
    expect(ask).toHaveBeenCalledWith(expect.stringMatching(/^Void HV-CN-202610-0002/))
    expect(mocks.voidCreditNote).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
