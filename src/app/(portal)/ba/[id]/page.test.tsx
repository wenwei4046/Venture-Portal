import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — a financing's own page (the user's Claude Design handoff,
// Invoice Financing): the BA reference as the title with its status chip, the
// borrower and the bank under it, six cards — face, what the borrower is
// charged, what HC is owed, HV's margin, when it matures, the interest
// billing — its terms, dates, billing and the borrower's facility in groups,
// its documents, and what Finance can do: bill the borrower, pay HC, mark it
// settled.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), refresh: vi.fn(),
  generateBaInvoice: vi.fn(), generateBaPv: vi.fn(), setBaStatus: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09' }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({
  createBa: vi.fn(), updateBa: vi.fn(), deleteBa: vi.fn(), setBaStatus: mocks.setBaStatus, setBaLimit: vi.fn(), uploadBaAttachment: vi.fn(),
  getBaAttachmentUrl: vi.fn(), deleteBaAttachment: vi.fn(), extractBaFromDocument: vi.fn(), generateBaInvoice: mocks.generateBaInvoice, generateBaPv: mocks.generateBaPv,
}))

import BaPage from './page'

const BA = {
  id: 'a1b2c3d4-0000', ba_no: 'BA-2610-02', bank_name: 'Maybank Islamic', face_amount: 100000, bank_annual_rate: 0.04, start_date: '2026-09-01',
  tenor_days: 45, maturity_date: '2026-10-16', charge_rate_monthly: 0.025, hc_rate_monthly: 0.015, borrower_company_id: 'co-car', borrower_name: null,
  status: 'active', notes: 'Rolled from BA-2607-01',
}

function database(ba: typeof BA | null = BA, invoice: unknown = null, pv: unknown = null) {
  const lists: Record<string, unknown[]> = {
    ba_facilities: [BA, { ...BA, id: 'other', face_amount: 100000 }],
    ba_attachments: [{ id: 'att1', ba_id: BA.id, file_name: 'bank-advice.pdf' }],
    bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '1234567890' }],
  }
  const singles: Record<string, unknown> = {
    ba_facilities: ba,
    companies: { name: 'Carres', short_code: 'CAR' },
    ba_limits: { limit_amount: 500000 },
    invoices: invoice,
    payment_vouchers: pv,
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: lists[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'order']) q[m] = () => q
      q.single = async () => ({ data: singles[table] ?? null, error: singles[table] ? null : { message: 'none' } })
      q.maybeSingle = async () => ({ data: singles[table] ?? null, error: null })
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const page = (id = BA.id) => BaPage({ params: Promise.resolve({ id }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  database()
})

describe('a financing’s own page', () => {
  it('heads with its reference and status, six cards, its terms in groups and its documents', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Invoice Financing' })).toHaveAttribute('href', '/ba')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · INVOICE FINANCING')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BA-2610-02')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('matures in 7d')
    expect(document.querySelector('.page-head .chip')).toHaveClass('alert')
    expect(document.querySelector('.page-head p')).toHaveTextContent('Carres (CAR) · Maybank Islamic')

    expect(card('Face amount')).toHaveAttribute('data-tone', 'primary')
    expect(card('Face amount')).toHaveTextContent('RM 100,000.00')
    // 100,000 × 2.5% × 45 ÷ 30 = 3,750; × 1.5% = 2,250; margin 1,500.
    expect(card('Charge borrower')).toHaveTextContent('RM 3,750.00')
    expect(card('Charge borrower')).toHaveTextContent('2.50% /mo · 45 days · bill 5028')
    expect(card('Owe HC')).toHaveAttribute('data-tone', 'danger')
    expect(card('Owe HC')).toHaveTextContent('RM 2,250.00')
    expect(card('HV margin')).toHaveTextContent('RM 1,500.00')
    expect(card('Matures')).toHaveAttribute('data-tone', 'wait')
    expect(card('Matures')).toHaveTextContent('16 Oct 2026')
    expect(card('Matures')).toHaveTextContent('7 days left')
    expect(card('Interest billing')).toHaveTextContent('To bill')
    expect(card('Interest billing')).toHaveTextContent('Not invoiced yet')

    const details = screen.getByRole('region', { name: 'Details' })
    for (const text of ['Carres (CAR)', 'Maybank Islamic', '100,000.00', '4.00% p.a. (ref)', '2.50% /mo', '1.50% /mo', '1 Sep 2026', '45', 'To bill', 'Limit', '500,000.00', '200,000.00', '300,000.00', '40%', 'Rolled from BA-2607-01']) {
      expect(within(details).getAllByText(text).length, text).toBeGreaterThan(0)
    }
    expect(screen.getByRole('region', { name: 'Documents' })).toHaveTextContent('bank-advice.pdf')
  })

  it('bills the borrower, pays HC through a PV and marks it settled', async () => {
    mocks.generateBaInvoice.mockResolvedValue({ invoiceNo: 'HV-INV-202610-0050' })
    mocks.setBaStatus.mockResolvedValue({})
    render(await page())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bill borrower' })) })
    expect(mocks.generateBaInvoice).toHaveBeenCalledWith(BA.id)
    expect(await screen.findByText(/HV-INV-202610-0050/)).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pay HC' }))
    expect(screen.getByText(/Interest to HOUZS Century: RM 2,250.00/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark settled' })) })
    expect(mocks.setBaStatus).toHaveBeenCalledWith(BA.id, 'settled')
  })

  it('says what was billed and paid, and a settled one is only reopened', async () => {
    database({ ...BA, status: 'settled' }, { invoice_no: 'HV-INV-202610-0050', status: 'issued' }, { voucher_no: 'HV-PV-202610-0090', status: 'paid' })
    render(await page())
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
    expect(card('Interest billing')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Interest billing')).toHaveTextContent('HV-INV-202610-0050')
    const actions = screen.getByRole('heading', { name: 'Actions' }).closest('section') as HTMLElement
    expect(actions).toHaveTextContent('HV-INV-202610-0050 · issued')
    expect(actions).toHaveTextContent('HV-PV-202610-0090 · paid')
    expect(within(actions).queryByRole('button', { name: 'Bill borrower' })).toBeNull()
    expect(within(actions).getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('404s a financing that is not there', async () => {
    database(null)
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
