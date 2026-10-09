import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

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
const LIMITS = [{ companyId: 'co-car', label: 'Carres (CAR)', limit: 500000, used: 200000 }]

const view = () => render(<BaView rows={ROWS} companies={[{ id: 'co-car', label: 'Carres (CAR)' }]} banks={[{ id: 'b1', label: 'HLB' }]} limits={LIMITS} autoReadAvailable={false} openCalc={false} />)
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => vi.clearAllMocks())

describe('Invoice Financing on the sheet', () => {
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
    const status = (ref: string) => {
      const row = screen.getAllByText(ref)[0].closest('tr') as HTMLElement
      return Array.from(row.querySelectorAll('.chip')).find((c) => /matures|overdue|settled|cancelled/.test(c.textContent ?? '')) as HTMLElement
    }
    expect(status('BA-1')).toHaveTextContent('matures in 52d')
    expect(status('BA-2')).toHaveClass('alert')
    expect(status('BA-2')).toHaveTextContent('matures in 6d')
    expect(status('BA-3')).toHaveClass('ledger')
    expect(status('BA-3')).toHaveTextContent('settled')
    const limits = screen.getByRole('heading', { name: 'Limits' }).closest('section') as HTMLElement
    expect(within(limits).getByText('Carres (CAR)')).toBeInTheDocument()
    expect(limits.querySelector('.sect-head .count')).toHaveTextContent('1 COMPANY · 40% USED')
  })

  it('opens a financing’s own page on a double-click, and opens the record form inline', () => {
    view()
    fireEvent.doubleClick(screen.getAllByText('BA-1')[0].closest('tr') as HTMLElement)
    expect(mocks.push).toHaveBeenCalledWith('/ba/1')
    fireEvent.click(screen.getByRole('button', { name: 'Record financing' }))
    expect(screen.getByRole('button', { name: 'Close form' })).toBeInTheDocument()
  })
})
