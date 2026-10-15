import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { BaRow } from '@/app/(portal)/ba/_components/BaView'
import { baHubModel, baRecordModel } from '@/lib/fin-app/ba-model'

// Fund › Invoice Financing in the Finance phone app (2026-10-15, part 5c): the
// hub's cards open their lists, a financing opens as its page with the desktop
// page's steps; Record financing saves through the page's own action; a step's
// refusal stays on the record in words; Delete is asked first; a limit is set
// on its company.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  open: vi.fn(),
  createBa: vi.fn(),
  updateBa: vi.fn(),
  deleteBa: vi.fn(),
  setBaStatus: vi.fn(),
  setBaLimit: vi.fn(),
  generateBaInvoice: vi.fn(),
  generateBaPv: vi.fn(),
  uploadBaAttachment: vi.fn(),
  getBaAttachmentUrl: vi.fn(),
  deleteBaAttachment: vi.fn(),
  extractBaFromDocument: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/ba',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/ba/page-actions', () => ({ openBaFinancing: mocks.open }))
vi.mock('@/app/(portal)/ba/actions', () => ({
  createBa: mocks.createBa,
  updateBa: mocks.updateBa,
  deleteBa: mocks.deleteBa,
  setBaStatus: mocks.setBaStatus,
  setBaLimit: mocks.setBaLimit,
  generateBaInvoice: mocks.generateBaInvoice,
  generateBaPv: mocks.generateBaPv,
  uploadBaAttachment: mocks.uploadBaAttachment,
  getBaAttachmentUrl: mocks.getBaAttachmentUrl,
  deleteBaAttachment: mocks.deleteBaAttachment,
  extractBaFromDocument: mocks.extractBaFromDocument,
}))

import FinAppFrame from './FinAppFrame'
import BaApp from './BaApp'
import { resetNav } from './nav'

const ROW: BaRow = {
  id: 'ba-1',
  baNo: 'BA-2610-01',
  bankName: 'Maybank',
  faceAmount: 50_000,
  bankAnnualRate: 0.045,
  startDate: '2026-10-01',
  tenorDays: 90,
  maturityDate: '2026-12-30',
  chargeRateMonthly: 0.025,
  hcRateMonthly: 0.015,
  borrower: 'HS',
  borrowerCompanyId: 'hs',
  status: 'active',
  notes: null,
  interestInvoice: null,
  interestPv: null,
  attachments: [],
}
const LIMITS = [
  { companyId: 'hs', label: 'HOUZS Sofa (HS)', limit: 100_000, used: 50_000 },
  { companyId: 'hx', label: 'HOUZS X (HX)', limit: 0, used: 0 },
]
const COMPANIES = [
  { id: 'hs', label: 'HOUZS Sofa (HS)' },
  { id: 'hx', label: 'HOUZS X (HX)' },
]
const TODAY = '2026-10-15'
const HUB = baHubModel({ rows: [ROW], limits: LIMITS }, TODAY)
const RECORD = baRecordModel({ row: ROW, shortCode: 'HS', limit: 100_000, used: 50_000, banks: [{ id: 'b1', label: 'Maybank — 123' }] }, TODAY, { create: true, edit: true, void: true })

const draw = (search = '', record: typeof RECORD | null = null) =>
  render(
    <FinAppFrame platform="android" rows={['ba']}>
      <BaApp hub={HUB} search={search} today={TODAY} companies={COMPANIES} limits={LIMITS} autoRead={false} may={{ create: true, edit: true }} record={record} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/ba')
  mocks.open.mockResolvedValue({ ok: true, record: RECORD })
})
afterEach(() => vi.clearAllMocks())

describe('Invoice Financing on the phone', () => {
  it('a card opens its list, a financing its page with the desktop page’s steps', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^To charge borrowers/ }))
    expect(window.location.search).toBe('?f=charge')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /HS/ }))
    })
    expect(mocks.open).toHaveBeenCalledWith('ba-1')
    expect(screen.getAllByText('BA-2610-01').length).toBeGreaterThan(0)
    expect(screen.getByText('Facility · HS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate PV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bill interest' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Mark settled', 'Edit financing', 'Delete financing'])
  })

  it('Record financing saves the bank’s advice, the borrower and the terms, then opens it', async () => {
    mocks.createBa.mockResolvedValue({ id: 'ba-9' })
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Record financing' }))
    const sheet = await screen.findByRole('dialog', { name: 'Record financing' })
    expect(within(sheet).getByText(/To save, fill in the face amount, the BA ref, the borrower/)).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('BA ref #'), { target: { value: 'BA-2610-02' } })
    fireEvent.change(within(sheet).getByLabelText('Bank'), { target: { value: 'CIMB' } })
    fireEvent.change(within(sheet).getByLabelText('Borrower'), { target: { value: 'hs' } })
    fireEvent.change(within(sheet).getByLabelText('Face amount'), { target: { value: '60000' } })
    // HS has 50,000 of 100,000 in use: 60,000 more warns, and still saves.
    expect(within(sheet).getByText(/Over limit: HOUZS Sofa \(HS\) has RM 50,000.00 active of RM 100,000.00/)).toBeInTheDocument()
    expect(within(sheet).getByText('4,500.00')).toBeInTheDocument() // charge: 60,000 × 2.5% × 90/30
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save financing' }))
    })
    expect(mocks.createBa).toHaveBeenCalledWith({
      baNo: 'BA-2610-02',
      bankName: 'CIMB',
      faceAmount: 60000,
      bankAnnualRatePct: 0,
      startDate: TODAY,
      tenorDays: 90,
      chargeRatePctMonthly: 2.5,
      hcRatePctMonthly: 1.5,
      borrowerCompanyId: 'hs',
      borrowerName: '',
      notes: '',
    })
    expect(mocks.flash).toHaveBeenCalledWith('Financing recorded')
    expect(window.location.search).toBe('?id=ba-9')
  })

  it('Bill interest makes an invoice, so it is asked first; a refusal stays in the question in words', async () => {
    mocks.generateBaInvoice.mockResolvedValue({ error: 'Invoice INV-1 (draft) already exists for this BA — delete/void it first to regenerate' })
    window.history.replaceState(null, '', '/fin-app/page/ba?id=ba-1')
    await act(async () => {
      draw('id=ba-1', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bill interest' }))
    expect(mocks.generateBaInvoice).not.toHaveBeenCalled()
    const ask = await screen.findByRole('dialog', { name: 'Bill HS?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Bill interest' }))
    })
    expect(mocks.generateBaInvoice).toHaveBeenCalledWith('ba-1')
    expect(within(ask).getByText(/already exists for this BA/)).toBeInTheDocument()
    expect(mocks.flash).not.toHaveBeenCalled()
  })

  it('Delete is asked first, then back to the hub', async () => {
    mocks.deleteBa.mockResolvedValue({})
    window.history.replaceState(null, '', '/fin-app/page/ba?id=ba-1')
    await act(async () => {
      draw('id=ba-1', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Delete financing' }))
    const ask = await screen.findByRole('dialog', { name: 'Delete BA-2610-01?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Delete financing' }))
    })
    expect(mocks.deleteBa).toHaveBeenCalledWith('ba-1')
    expect(mocks.flash).toHaveBeenCalledWith('BA-2610-01 deleted')
  })

  it('a company’s limit is edited on its card', async () => {
    mocks.setBaLimit.mockResolvedValue({})
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Limits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit limit' })
    fireEvent.change(within(sheet).getByLabelText('BA limit · RM'), { target: { value: '150000' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    expect(mocks.setBaLimit).toHaveBeenCalledWith('hs', 150000)
    expect(mocks.flash).toHaveBeenCalledWith('Limit saved')
  })
})
