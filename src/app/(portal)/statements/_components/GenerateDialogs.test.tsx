import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// The hub's generators (2026-10-14, the Finance revamp v2 — D10's Create
// invoice ▾ and Payroll ▾), the system's own in the kit's sheet: each reads
// what it would write on the hub's month (or another, by its Period) before
// writing drafts — and moves to the month picked (2026-09-11: a modal seeded
// once kept the old month).

const mocks = vi.hoisted(() => ({
  marketing: vi.fn(),
  marketingPreview: vi.fn(),
  payrollPreview: vi.fn(),
  payroll: vi.fn(),
  delta: vi.fn(),
  topUp: vi.fn(),
  ownPreview: vi.fn(),
  own: vi.fn(),
}))
vi.mock('../invoice-actions', () => ({
  hubImportMarketing: mocks.marketing,
  hubMarketingPreview: mocks.marketingPreview,
  hubPayrollPreview: mocks.payrollPreview,
  hubGeneratePayrollInvoices: mocks.payroll,
  hubPayrollDelta: mocks.delta,
  hubTopUpPayroll: mocks.topUp,
  hubOwnSharePreview: mocks.ownPreview,
  hubGenerateOwnShare: mocks.own,
  hubHrFigures: vi.fn(),
}))

import { MarketingDialog, OwnShareDialog, PayrollInvoicesDialog, ReconcileDialog } from './GenerateDialogs'

const categories = [{ code: '5050', label: 'Salary Income', type: 'revenue' as const, parent_code: null }]
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
const dialog = () => screen.getByRole('dialog')
const hint = () => within(dialog()).getAllByText((_, el) => el?.tagName === 'P').map((p) => p.textContent)
const comp = (salary: number, allowance: number, epf: number, socso: number, eis: number) => ({ salary, allowance, epf, socso, eis })

beforeEach(() => vi.clearAllMocks())

describe('Import Marketing billing (2026-10-26)', () => {
  const line = (over: Record<string, unknown>) => ({
    bill: 'b', project: 'p', track: 'PRJ-CAR-2609-001', title: 'x', words: "Post pack - Sep'26", amount: 500,
    sub: { id: 's-car', code: 'CAR', name: 'Carres' }, party: { kind: 'subsidiary', id: 'co-car', name: 'Carres', code: 'CAR' },
    account: { code: '5019', name: 'Design Income' }, invoice: null, ...over,
  })
  const PREVIEW = {
    month: '2026-09-01',
    locked: false,
    lines: [
      line({ bill: 'b1' }),
      line({ bill: 'b2', track: 'PRJ-CAR-2609-002', words: "Lead Gen - Sep'26", amount: 2500, account: { code: '5012', name: 'Revenue - Lead Gen' },
        invoice: { id: 'i1', no: 'HV-INV-202609-0050', status: 'draft' } }),
      line({ bill: 'b3', track: 'PRJ-REDT-2609-001', words: "Social Media - Sep'26", amount: 3000, account: null,
        sub: { id: 's-rt', code: 'REDT', name: 'Red Truck' }, party: { kind: 'client', id: 's-rt', name: 'Red Truck Sdn Bhd', code: 'REDT' } }),
    ],
    typed: [{ id: 't1', no: 'HV-INV-202609-0013', status: 'paid', total: 2000, party: 'Rygis Private Gym', code: null, words: 'Marketing Service' }],
  }

  it('reads the month’s confirmed lines, a party a card — its lines, accounts and invoices — and the invoices typed by hand', async () => {
    mocks.marketingPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    render(<MarketingDialog open onClose={vi.fn()} onDone={vi.fn()} period="2026-09-01" />)
    await flush()
    expect(mocks.marketingPreview).toHaveBeenCalledWith('2026-09')
    const car = within(dialog()).getByRole('group', { name: 'Carres (CAR)' })
    expect(car).toHaveTextContent("Carres (CAR)3,000.00Post pack - Sep'26500.00PRJ-CAR-2609-001 · 5019 · Design Income · To import")
    expect(car).toHaveTextContent('PRJ-CAR-2609-002 · 5012 · Revenue - Lead Gen · On HV-INV-202609-0050 · draft')
    expect(within(dialog()).getByRole('group', { name: 'Red Truck Sdn Bhd' })).toHaveTextContent('Red Truck Sdn Bhd · client3,000.00')
    expect(within(dialog()).getByRole('group', { name: 'Red Truck Sdn Bhd' })).toHaveTextContent('No account · To import')
    expect(within(dialog()).getByRole('group', { name: 'Typed this month' })).toHaveTextContent('HV-INV-202609-0013 · Rygis Private Gym · paid2,000.00')
    expect(hint()).toContain('Marketing invoices were typed by hand this month too — check none bills the same work.')
    expect(within(dialog()).getByRole('button', { name: 'Import · 2 lines · RM 3,500.00' })).not.toHaveAttribute('data-off', 'true')
  })

  it('imports the lines on no invoice and says what it did', async () => {
    mocks.marketingPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    mocks.marketing.mockResolvedValue({ ok: true, value: { made: 1, added: 1, lines: 2, invoices: ['HV-INV-202609-0050', 'HV-INV-202609-0051'] } })
    const onDone = vi.fn()
    const onClose = vi.fn()
    render(<MarketingDialog open onClose={onClose} onDone={onDone} period="2026-09-01" />)
    await flush()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import · 2 lines · RM 3,500.00' }))
    await flush()
    expect(mocks.marketing).toHaveBeenCalledWith('2026-09')
    expect(onDone).toHaveBeenCalledWith('Marketing billing imported · 1 draft made · 1 draft added to · 2 lines')
    expect(onClose).toHaveBeenCalled()
  })

  it('a refusal stays in the window', async () => {
    mocks.marketingPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    mocks.marketing.mockResolvedValue({ ok: false, reason: 'Period Sep 2026 is closed. Contact Principal to reopen.' })
    const onClose = vi.fn()
    render(<MarketingDialog open onClose={onClose} onDone={vi.fn()} period="2026-09-01" />)
    await flush()
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Import/ }))
    await flush()
    expect(hint()).toContain('Period Sep 2026 is closed. Contact Principal to reopen.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('every line on an invoice, a closed month, another month with nothing: nothing to import', async () => {
    const imported = { ...PREVIEW, typed: [], lines: PREVIEW.lines.map((l) => ({ ...l, invoice: { id: 'i1', no: 'HV-INV-202609-0050', status: 'issued' } })) }
    mocks.marketingPreview
      .mockResolvedValueOnce({ ok: true, value: imported })
      .mockResolvedValueOnce({ ok: true, value: { ...PREVIEW, month: '2026-08-01', locked: true } })
      .mockResolvedValueOnce({ ok: true, value: { month: '2026-07-01', locked: false, lines: [], typed: [] } })
    render(<MarketingDialog open onClose={vi.fn()} onDone={vi.fn()} period="2026-09-01" />)
    await flush()
    expect(within(dialog()).getByRole('button', { name: 'Nothing to import' })).toHaveAttribute('data-off', 'true')
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-08' } })
    await flush()
    expect(mocks.marketingPreview).toHaveBeenLastCalledWith('2026-08')
    expect(hint()).toContain('August 2026 is closed — the Principal reopens it.')
    expect(within(dialog()).getByRole('button', { name: /^Import/ })).toHaveAttribute('data-off', 'true')
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-07' } })
    await flush()
    expect(hint()).toContain('Nothing confirmed by Marketing for July 2026.')
  })

  it('Cancel imports nothing', async () => {
    mocks.marketingPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    const onClose = vi.fn()
    render(<MarketingDialog open onClose={onClose} onDone={vi.fn()} period="2026-09-01" />)
    await flush()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(mocks.marketing).not.toHaveBeenCalled()
  })
})

describe('Generate payroll invoices', () => {
  const PREVIEW = [
    {
      companyId: 'co-2990',
      shortCode: '2990',
      name: '2990',
      total: 3481.12,
      groups: [
        { deptLabel: 'HR', segment: 'hr', components: comp(933.2, 279.96, 121.32, 16.13, 1.84) },
        { deptLabel: 'Finance', segment: 'finance', components: comp(1841.66, 20, 233.5, 30.07, 3.44) },
      ],
    },
  ]

  it('reads HR’s allocation for the month, a company a card, its departments and their parts; generates on the category', async () => {
    mocks.payrollPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    mocks.payroll.mockResolvedValue({ ok: true, value: { generated: 1, companies: ['2990'] } })
    const onDone = vi.fn()
    render(<PayrollInvoicesDialog open onClose={vi.fn()} onDone={onDone} period="2026-09-01" categories={categories} />)
    await flush()
    expect(mocks.payrollPreview).toHaveBeenCalledWith('2026-09')
    const card = within(dialog()).getByRole('group', { name: '2990' })
    expect(card).toHaveTextContent('2990 (2990)3,481.12')
    expect(card).toHaveTextContent('HR1,352.45Salary 933.20 · Allowance 279.96 · EPF 121.32 · SOCSO 16.13 · EIS 1.84')
    expect(screen.getByLabelText('Category')).toHaveValue('5050')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate drafts' }))
    await flush()
    expect(mocks.payroll).toHaveBeenCalledWith('2026-09', '5050')
    expect(onDone).toHaveBeenCalledWith('1 payroll invoice generated as drafts')
  })

  it('another month is read again; a month with no allocation has nothing to generate', async () => {
    mocks.payrollPreview.mockResolvedValueOnce({ ok: true, value: PREVIEW }).mockResolvedValueOnce({ ok: true, value: [] })
    render(<PayrollInvoicesDialog open onClose={vi.fn()} onDone={vi.fn()} period="2026-09-01" categories={categories} />)
    await flush()
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-08' } })
    await flush()
    expect(mocks.payrollPreview).toHaveBeenLastCalledWith('2026-08')
    expect(hint()).toContain('No staff billing allocation for August 2026 — nothing to bill.')
    expect(within(dialog()).getByRole('button', { name: 'Generate drafts' })).toHaveAttribute('data-off', 'true')
  })
})

describe('Reconcile payroll', () => {
  const seg = (deptLabel: string, billed: number, should: number) => ({ segment: deptLabel.toLowerCase(), deptLabel, billed, should, delta: Math.round((should - billed) * 100) / 100, componentDeltas: null })
  const ROWS = [
    { companyId: 'a', shortCode: 'HC', name: 'HOUZS Century', should: 11104.5, billed: 11104.5, delta: 0, segments: [], hasIssuedInvoice: true, positiveTotal: 0, negatives: [] },
    { companyId: 'b', shortCode: 'CAR', name: 'Carres', should: 10866.79, billed: 10666.79, delta: 200, segments: [seg('HR', 1352.45, 1552.45)], hasIssuedInvoice: true, positiveTotal: 200, negatives: [] },
    { companyId: 'c', shortCode: 'CMI', name: 'CMI', should: 500, billed: 0, delta: 500, segments: [seg('HR', 0, 500)], hasIssuedInvoice: false, positiveTotal: 500, negatives: [] },
  ]

  it('a company a card: matches, under-billed, not invoiced; tops up the under-billed ones only', async () => {
    mocks.delta.mockResolvedValue({ ok: true, value: ROWS })
    mocks.topUp.mockResolvedValue({ ok: true, value: { generated: ['CAR'], overBilled: [], missingInvoice: ['CMI'] } })
    const onDone = vi.fn()
    render(<ReconcileDialog open onClose={vi.fn()} onDone={onDone} period="2026-09-01" />)
    await flush()
    expect(within(dialog()).getByRole('group', { name: 'HOUZS Century' })).toHaveTextContent('HCmatches ✓—')
    expect(within(dialog()).getByRole('group', { name: 'Carres' })).toHaveTextContent('CARunder-billed 200.00+200.00Billed 10,666.79should 10,866.79HR: 1,352.45 → 1,552.45 (+200.00)')
    expect(within(dialog()).getByRole('group', { name: 'CMI' })).toHaveTextContent('not invoiced')
    expect(hint()).toContain('CMI has no payroll invoice this month — Generate payroll invoices makes it; it is not topped up here.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Top up · 1 draft · RM 200.00' }))
    await flush()
    expect(mocks.topUp).toHaveBeenCalledWith('2026-09')
    expect(onDone).toHaveBeenCalledWith('Adjustment drafts for CAR — review and issue them as usual')
  })

  it('all square: nothing to top up', async () => {
    mocks.delta.mockResolvedValue({ ok: true, value: [ROWS[0]] })
    render(<ReconcileDialog open onClose={vi.fn()} onDone={vi.fn()} period="2026-09-01" />)
    await flush()
    expect(within(dialog()).getByRole('button', { name: 'Nothing to top up' })).toHaveAttribute('data-off', 'true')
  })
})

// Every department with a residual comes back; only the ones the registry bills back are ticked (2026-09-29).
describe('Own-share → Venture (Office)', () => {
  const PREVIEW = {
    groups: [
      { deptLabel: 'HR', segment: 'hr', components: comp(11553.28, 2747.22, 1637, 203.85, 23.3) },
      { deptLabel: 'Director Office', segment: 'director_office', components: comp(699.05, 88.97, 91.51, 13.24, 1.51) },
      { deptLabel: 'Finance', segment: 'finance', components: comp(700, 40, 84, 10.41, 1.19) },
    ],
    total: 1729.88,
    billBack: ['director_office', 'finance'],
  }

  it('lists every department, ticks the registry’s; a tick for this run moves the total and is sent', async () => {
    mocks.ownPreview.mockResolvedValue({ ok: true, value: PREVIEW })
    mocks.own.mockResolvedValue({ ok: true, value: { generated: 1, total: 17894.53 } })
    const onDone = vi.fn()
    render(<OwnShareDialog open onClose={vi.fn()} onDone={onDone} period="2026-08-01" categories={categories} />)
    await flush()
    const boxes = within(screen.getByRole('group', { name: 'Departments' })).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true])
    expect(dialog()).toHaveTextContent('Bill to Venture (Office) · RM 1,729.88')
    fireEvent.click(boxes[0])
    expect(dialog()).toHaveTextContent('Bill to Venture (Office) · RM 17,894.53')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate draft' }))
    await flush()
    expect(mocks.own.mock.calls[0][0]).toBe('2026-08')
    expect(mocks.own.mock.calls[0][1]).toBe('5050')
    expect([...mocks.own.mock.calls[0][2]].sort()).toEqual(['director_office', 'finance', 'hr'])
    expect(onDone).toHaveBeenCalledWith('Own-share invoice to Venture (Office) generated as a draft · RM 17,894.53')
  })

  it('nothing ticked: nothing to generate', async () => {
    mocks.ownPreview.mockResolvedValue({ ok: true, value: { ...PREVIEW, billBack: [] } })
    render(<OwnShareDialog open onClose={vi.fn()} onDone={vi.fn()} period="2026-08-01" categories={categories} />)
    await flush()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate draft' }))
    expect(within(dialog()).getByRole('button', { name: 'Generate draft' })).toHaveAttribute('data-off', 'true')
    expect(mocks.own).not.toHaveBeenCalled()
  })
})
