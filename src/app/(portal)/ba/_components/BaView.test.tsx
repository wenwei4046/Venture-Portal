import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — Invoice Financing (was "Bank BA") per the user's Claude Design
// handoff (Phase 3 of the Finance revamp): the page renamed, Calculator and
// Record financing at the head, four cards, the Financing register first and
// the Limits after it, each financing's status as a chip, and a financing
// opening its own page on a double-click.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09' }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))
vi.mock('../actions', () => ({
  createBa: vi.fn(), updateBa: vi.fn(), deleteBa: vi.fn(), setBaStatus: vi.fn(), setBaLimit: vi.fn(), uploadBaAttachment: vi.fn(),
  getBaAttachmentUrl: vi.fn(), deleteBaAttachment: vi.fn(), extractBaFromDocument: vi.fn(), generateBaInvoice: vi.fn(), generateBaPv: vi.fn(),
}))

import * as actions from '../actions'
import BaView, { type BaRow } from './BaView'

const ba = (id: string, over: Partial<BaRow> = {}): BaRow => ({
  id, baNo: `BA-${id}`, bankName: 'Maybank Islamic', faceAmount: 100000, bankAnnualRate: 0.04, startDate: '2026-09-01', tenorDays: 90,
  maturityDate: '2026-11-30', chargeRateMonthly: 0.025, hcRateMonthly: 0.015, borrower: 'CAR', borrowerCompanyId: 'co-car', status: 'active',
  notes: null, interestInvoice: null, interestPv: null, attachments: [], ...over,
})
const ROWS = [
  ba('1'),
  ba('2', { maturityDate: '2026-10-15' }), // 6 days left
  ba('3', { status: 'settled', interestInvoice: { no: 'HV-INV-202609-0040', status: 'paid' } }),
]
const LIMITS = [
  { companyId: 'co-car', label: 'Carres (CAR)', limit: 500000, used: 200000 },
  { companyId: 'co-hk', label: 'Hookka (HK)', limit: 300000, used: 0 },
  { companyId: 'co-new', label: 'Newco (NEW)', limit: 0, used: 0 },
]
const COMPANIES = [
  { id: 'co-car', label: 'Carres (CAR)' },
  { id: 'co-hk', label: 'Hookka (HK)' },
  { id: 'co-new', label: 'Newco (NEW)' },
]

const view = (props: { canSetDefault?: boolean; canRecord?: boolean } = {}) =>
  render(<BaView rows={ROWS} companies={COMPANIES} banks={[{ id: 'b1', label: 'HLB' }]} limits={LIMITS} autoReadAvailable={false} openCalc={false} {...props} />)
const card = (name: string) => screen.getByRole('group', { name })
const table = () => document.querySelector('table.ledger-table') as HTMLTableElement
const row = (ref: string) => within(table()).getByText(ref).closest('tr') as HTMLElement
const limits = () => screen.getByRole('heading', { name: 'Limits' }).closest('section') as HTMLElement

beforeEach(() => vi.clearAllMocks())

describe('Invoice Financing on the sheet', () => {
  it('keeps Record financing to whoever may record it (Treasury · Create, 2026-10-16)', () => {
    view({ canRecord: false })
    expect(screen.queryByRole('button', { name: 'Record financing' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Calculator' })).toBeInTheDocument()
  })

  it('heads as Invoice Financing with the calculator and Record financing, and sums the active book', () => {
    view()
    expect(screen.getByRole('link', { name: '← Fund In' })).toHaveAttribute('href', '/fund-in')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · INVOICE FINANCING')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Invoice Financing')
    expect(screen.getByRole('button', { name: 'Calculator' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record financing' })).toBeInTheDocument()
    // Two active: 200,000 face; charge 2 × 7,500; HC 2 × 4,500; margin 2 × 3,000.
    expect(card('Active face')).toHaveAttribute('data-tone', 'primary')
    expect(card('Active face')).toHaveTextContent('RM 200,000.00')
    expect(card('Active face')).toHaveTextContent('2 active')
    expect(card('To charge borrowers')).toHaveAttribute('data-tone', 'ledger')
    expect(card('To charge borrowers')).toHaveTextContent('RM 15,000.00')
    expect(card('To pay HC')).toHaveAttribute('data-tone', 'danger')
    expect(card('To pay HC')).toHaveTextContent('RM 9,000.00')
    expect(card('HV margin')).toHaveTextContent('RM 6,000.00')
  })

  it('lists the register first and the limits after it, each status a chip', () => {
    view()
    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['Financing register', 'Limits'])
    const status = (ref: string) =>
      Array.from(row(ref).querySelectorAll('.chip')).find((c) => /matures|overdue|settled|cancelled/.test(c.textContent ?? '')) as HTMLElement
    expect(status('BA-1')).toHaveTextContent('matures in 52d')
    expect(status('BA-2')).toHaveClass('alert')
    expect(status('BA-2')).toHaveTextContent('matures in 6d')
    expect(status('BA-3')).toHaveClass('ledger')
    expect(status('BA-3')).toHaveTextContent('settled')
    expect(limits().querySelector('.sect-head .count')).toHaveTextContent('2 COMPANIES · 25% USED')
  })

  it('opens a financing’s own page on a double-click, and opens the record form inline', () => {
    view()
    fireEvent.doubleClick(row('BA-1'))
    expect(mocks.push).toHaveBeenCalledWith('/ba/1')
    fireEvent.click(screen.getByRole('button', { name: 'Record financing' }))
    expect(screen.getByRole('button', { name: 'Close form' })).toBeInTheDocument()
  })
})

// 2026-10-10 — the register per the handoff: Period as days then dates, the
// interest billing as a chip, one Mark settled at the end of an active row,
// and the rest — bill, pay, edit, delete, reopen — on the row's right-click.
describe('the Financing register', () => {
  it('reads the period as days then dates, and the billing as a chip', () => {
    view()
    expect(row('BA-1')).toHaveTextContent('90d · 1 Sep – 30 Nov')
    const billing = (ref: string) => Array.from(row(ref).querySelectorAll('.chip')).find((c) => /bill/.test(c.textContent ?? '')) as HTMLElement
    expect(billing('BA-1')).toHaveTextContent('to bill')
    expect(billing('BA-1')).toHaveClass('alert')
    expect(billing('BA-3')).toHaveTextContent('billed')
    expect(billing('BA-3')).toHaveClass('ledger')
    expect(within(table()).queryByRole('button', { name: /Bill borrower|Pay HC|Edit|Delete|Reopen/ })).toBeNull()
  })

  it('ends an active row with Mark settled', async () => {
    vi.mocked(actions.setBaStatus).mockResolvedValue({})
    view()
    const settle = within(row('BA-1')).getByRole('button', { name: 'Mark settled' })
    expect(settle).toHaveClass('fund-btn-line')
    expect(within(row('BA-3')).queryByRole('button', { name: 'Mark settled' })).toBeNull()
    await act(async () => {
      fireEvent.click(settle)
    })
    expect(actions.setBaStatus).toHaveBeenCalledWith('1', 'settled')
  })

  it('offers billing, paying HC, editing and deleting on the right-click', async () => {
    vi.mocked(actions.generateBaInvoice).mockResolvedValue({ invoiceNo: 'HV-INV-202610-0051' })
    view()
    const menuOf = (ref: string) => {
      fireEvent.contextMenu(row(ref))
      return screen.getByRole('menu', { name: `Actions for ${ref}` })
    }
    const labels = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)
    expect(labels(menuOf('BA-1'))).toEqual(['打开', '在新分页打开', 'Bill borrower', 'Pay HC', 'Edit', 'Delete'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(labels(menuOf('BA-3'))).toEqual(['打开', '在新分页打开', 'Pay HC', 'Reopen', 'Edit', 'Delete'])
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Pay HC/ }))
    const pv = screen.getByRole('dialog', { name: 'Generate PV — BA-3' })
    expect(pv).toHaveTextContent('Interest to HOUZS Century: RM 4,500.00')
    fireEvent.click(within(pv).getByRole('button', { name: 'Close' }))
    const bill = within(menuOf('BA-1')).getByRole('menuitem', { name: /Bill borrower/ })
    await act(async () => {
      fireEvent.click(bill)
    })
    expect(actions.generateBaInvoice).toHaveBeenCalledWith('1')
    expect(await screen.findByText(/Invoice HV-INV-202610-0051 created as draft/)).toBeInTheDocument()
    fireEvent.click(within(menuOf('BA-2')).getByRole('menuitem', { name: /Edit/ }))
    expect(screen.getByRole('heading', { name: /Editing — BA-2/ })).toBeInTheDocument()
  })

  it('filters every column, Face, Period, Charge and Owe HC by range as well', () => {
    view()
    const hasRange = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Filter ${name}` }))
      const dialog = screen.getByRole('dialog', { name: `Filter ${name}` })
      const range = within(dialog).queryByRole('button', { name: 'Range' }) !== null
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      return range
    }
    expect(['Ref', 'Borrower', 'Face', 'Period', 'Charge', 'Owe HC', 'Interest billing', 'Status'].map((n) => [n, hasRange(n)])).toEqual([
      ['Ref', false], ['Borrower', false], ['Face', true], ['Period', true], ['Charge', true], ['Owe HC', true], ['Interest billing', false], ['Status', false],
    ])
    // The Charge range is in ringgit: BA-1 and BA-3 charge 7,500, BA-2 too — all in.
    fireEvent.click(screen.getByRole('button', { name: 'Filter Charge' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter Charge' })).getByRole('button', { name: 'Range' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Min' }), { target: { value: '7000' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Max' }), { target: { value: '8000' } })
    expect(table().querySelectorAll('tbody tr')).toHaveLength(3)
  })

  it('lets an account that may set the default keep the arrangement for everyone', () => {
    view({ canSetDefault: true })
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(within(screen.getByRole('dialog', { name: 'Columns' })).getByRole('button', { name: '设为预设' })).toBeInTheDocument()
  })
})

// 2026-10-10 — the Limits per the handoff: a card per company with its own
// Edit limit, every active BA listed, "No active BA." when there is none.
describe('the Limits', () => {
  it('draws a card per company with every active BA, or a line saying there is none', () => {
    view()
    const cards = limits().querySelectorAll('.fund-lim')
    expect(cards).toHaveLength(2)
    const car = cards[0] as HTMLElement
    expect(car).toHaveTextContent('Carres (CAR)BA limit')
    expect(car).toHaveTextContent('40% of limit')
    expect(car.querySelector('.fund-lim-used')).toHaveTextContent('RM 200,000.00')
    expect(car).toHaveTextContent('outstanding · limit RM 500,000.00 · available RM 300,000.00')
    expect(car.querySelectorAll('.fund-lim-ba')).toHaveLength(2)
    expect(car.querySelectorAll('.fund-lim-ba')[0]).toHaveTextContent('⏰ RM 100,000.00 — Maybank Islamic · matures 15 Oct 2026 (6d) · BA-2')
    expect(cards[1]).toHaveTextContent('No active BA.')
    expect(within(limits()).queryByRole('button', { name: 'Edit limits' })).toBeNull()
  })

  it('edits a limit on its own card', async () => {
    vi.mocked(actions.setBaLimit).mockResolvedValue({})
    view()
    const car = limits().querySelectorAll('.fund-lim')[0] as HTMLElement
    fireEvent.click(within(car).getByRole('button', { name: 'Edit limit' }))
    const input = within(car).getByRole('textbox', { name: 'Limit for Carres (CAR)' })
    expect(input).toHaveValue('500000')
    fireEvent.change(input, { target: { value: '600000' } })
    await act(async () => {
      fireEvent.click(within(car).getByRole('button', { name: 'Save' }))
    })
    expect(actions.setBaLimit).toHaveBeenCalledWith('co-car', 600000)
  })

  it('gives another company a limit', async () => {
    vi.mocked(actions.setBaLimit).mockResolvedValue({})
    view()
    const add = within(limits()).getByRole('group', { name: 'Set a limit for another company' })
    fireEvent.change(within(add).getByRole('combobox', { name: 'Company' }), { target: { value: 'co-new' } })
    fireEvent.change(within(add).getByRole('textbox', { name: 'Limit' }), { target: { value: '250000' } })
    await act(async () => {
      fireEvent.click(within(add).getByRole('button', { name: 'Save' }))
    })
    expect(actions.setBaLimit).toHaveBeenCalledWith('co-new', 250000)
  })
})

// 2026-10-10 — Record financing per the handoff's form: Bank advice, then the
// Borrower, then the Terms; the face amount large with RM before it; day
// chips; the money each rate comes to under it; the results as tiles; a ref
// and a borrower before it saves.
describe('Record financing', () => {
  it('lays out the handoff’s form and works the figures as they are typed', async () => {
    vi.mocked(actions.createBa).mockResolvedValue({ id: 'new' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Record financing' }))
    const form = screen.getByRole('region', { name: 'Record financing' })
    expect(within(form).getByRole('heading', { level: 2 })).toHaveTextContent('Record financing')
    expect(within(form).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Bank advice', 'Borrower', 'Terms'])
    const save = within(form).getByRole('button', { name: 'Save financing →' })
    expect(save).toBeDisabled()

    const face = within(form).getByLabelText('Face amount')
    expect(face.closest('.fund-box')).toHaveClass('fund-big')
    expect(face.closest('.fund-box')).toHaveTextContent('RM')
    fireEvent.change(face, { target: { value: '100000' } })
    fireEvent.click(within(form).getByRole('button', { name: '60' }))
    expect(within(form).getByRole('button', { name: '60' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByLabelText('Days')).toHaveValue('60')
    // 100,000 × 2.5% × 60 ÷ 30 = 5,000; × 1.5% = 3,000; no bank rate typed.
    const below = (label: string) => within(form).getByLabelText(label).closest('.fund-f')!.querySelector('.fund-f-below') as HTMLElement
    expect(below('Charge borrower')).toHaveTextContent('= RM 5,000.00')
    expect(below('To HC')).toHaveTextContent('= RM 3,000.00')
    expect(below('Bank rate')).toHaveTextContent('= RM 0.00 · ref only')
    expect(form.querySelector('.fund-res-days')).toHaveTextContent('60 days · matures 8 Dec 2026')
    expect(form.querySelector('.fund-tile.fund-in')).toHaveTextContent('Charge borrower5,000.00bill · 5028')
    expect(form.querySelector('.fund-tile.fund-owe')).toHaveTextContent('Owe HC3,000.00pay · 6001')
    expect(form.querySelector('.fund-margin')).toHaveTextContent('HV margin2,000.00')

    // A ref and a borrower before it saves.
    expect(save).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('BA ref #'), { target: { value: 'BA-2610-02' } })
    expect(save).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Company'), { target: { value: 'co-car' } })
    expect(save).toBeEnabled()
    await act(async () => {
      fireEvent.click(save)
    })
    expect(actions.createBa).toHaveBeenCalledWith(
      expect.objectContaining({ baNo: 'BA-2610-02', faceAmount: 100000, tenorDays: 60, chargeRatePctMonthly: 2.5, hcRatePctMonthly: 1.5, borrowerCompanyId: 'co-car' }),
    )
  })

  it('takes a borrower typed as free text', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Record financing' }))
    const form = screen.getByRole('region', { name: 'Record financing' })
    fireEvent.change(within(form).getByLabelText('Face amount'), { target: { value: '50000' } })
    fireEvent.change(within(form).getByLabelText('BA ref #'), { target: { value: 'BA-2610-03' } })
    fireEvent.change(within(form).getByLabelText('Or free text'), { target: { value: 'Outside Sdn Bhd' } })
    expect(within(form).getByRole('button', { name: 'Save financing →' })).toBeEnabled()
  })

  it('opens the Financing calculator in the same layout', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Calculator' }))
    const calc = screen.getByRole('dialog', { name: 'Financing calculator' })
    expect(within(calc).getByRole('heading', { level: 2 })).toHaveTextContent('Financing calculator')
    fireEvent.change(within(calc).getByLabelText('Face amount'), { target: { value: '100000' } })
    expect(calc.querySelector('.fund-margin')).toHaveTextContent('HV margin3,000.00')
    expect(within(calc).getByRole('button', { name: '90' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(calc).queryByRole('button', { name: /Save/ })).toBeNull()
  })
})
