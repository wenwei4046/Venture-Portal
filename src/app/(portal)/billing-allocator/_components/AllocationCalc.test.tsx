import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, TxnRow } from './types'

// + New allocation (2026-10-14, the Finance revamp v2 — D11, the prototype's
// `vCalc` in the drawer): the expense's five fields on a white card, the
// preview a row a share with the billable total, + Add expense and Save
// allocation — and the system's Calculate kept whole: a template fills the
// expense, Percentage and Custom are typed company by company (HV's own share
// first), the headcount can come off another month's snapshot (and says so),
// several expenses save as one batch, and Correct overwrites a record.

const mocks = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn() }))
vi.mock('../actions', () => ({ saveAllocBatch: mocks.save, updateAllocTxn: mocks.update }))

import AllocationCalc from './AllocationCalc'

const DATA: AllocatorData = {
  period: '2026-09',
  companies: [
    { id: 'co-2990', label: '2990' },
    { id: 'co-car', label: 'CAR' },
  ],
  companySettings: [],
  departments: [{ id: 'dept:mkt', label: 'Marketing (dept)' }],
  staff: [
    { id: 's1', name: 'A', status: 'active', department: '', createdAt: '', splits: [{ targetId: 'co-2990', label: '2990', pct: 100 }] },
    { id: 's2', name: 'B', status: 'active', department: '', createdAt: '', splits: [{ targetId: 'co-car', label: 'CAR', pct: 50 }, { targetId: null, label: 'HOUZS Venture (own)', pct: 50 }] },
    { id: 's3', name: 'C', status: 'active', department: '', createdAt: '', splits: [{ targetId: 'dept:mkt', label: 'Marketing (dept)', pct: 100 }] },
    { id: 's4', name: 'D', status: 'inactive', department: '', createdAt: '', splits: [{ targetId: 'co-car', label: 'CAR', pct: 100 }] },
  ],
  snapshotPeriods: ['2026-09', '2026-08'],
  hrPeriods: [],
  snapshotSplitsByPeriod: {
    '2026-08': [
      { targetId: 'co-2990', pct: 100 },
      { targetId: 'co-car', pct: 100 },
      { targetId: 'co-car', pct: 100 },
    ],
  },
  coaAccounts: [],
  categories: [
    { id: 'cat-rent', name: 'Rental', coaCode: '7012' },
    { id: 'cat-web', name: 'Website & Software', coaCode: '' },
  ],
  templates: [
    { id: 'tp1', name: 'Office Rental', method: 'headcount', amount: 1000, categoryId: 'cat-rent', status: 'active', splits: [] },
    { id: 'tp2', name: 'Old one', method: 'equal', amount: 0, categoryId: null, status: 'inactive', splits: [] },
  ],
  txns: [],
  invoices: [],
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
const preview = () => within(screen.getByRole('group', { name: 'Preview' })).getAllByText((_, el) => !!el && el.parentElement?.getAttribute('role') === 'group').map((el) => el.textContent)
const save = () => screen.getByRole('button', { name: 'Save allocation' })
const show = (props: Partial<Parameters<typeof AllocationCalc>[0]> = {}) => {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<AllocationCalc open onClose={onClose} onSaved={onSaved} data={DATA} edit={null} {...props} />)
  return { onClose, onSaved }
}

beforeEach(() => vi.clearAllMocks())

describe('+ New allocation', () => {
  it('draws the design’s five fields and the split before an amount — the headcount’s shares at 0.00', () => {
    show()
    for (const label of ['Template', 'Description', 'Amount RM', 'Method', 'Category']) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.getByLabelText('Method')).toHaveValue('headcount')
    // Three heads on the current list (the inactive person not counted): 2990 1, CAR 0.5, Marketing 1, HV own 0.5.
    expect(preview()).toEqual([
      'HV own (not billed)0.5 staff · 16.7%0.00',
      '29901 staff · 33.3%0.00',
      'CAR0.5 staff · 16.7%0.00',
      'Marketing1 staff · 33.3%0.00',
      'Billable totalRM 0.00',
    ])
    expect(save()).toHaveAttribute('data-off', 'true')
  })

  it('a template fills the expense; the amount splits on the current list, HV’s own share left out of the total', () => {
    show()
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'tp1' } })
    expect(screen.getByLabelText('Description')).toHaveValue('Office Rental')
    expect(screen.getByLabelText('Amount RM')).toHaveValue('1000')
    expect(screen.getByLabelText('Category')).toHaveValue('cat-rent')
    expect(within(screen.getByLabelText('Category')).getByRole('option', { name: '7012 · Rental' })).toBeInTheDocument()
    // An inactive template is not offered.
    expect(within(screen.getByLabelText('Template')).queryByRole('option', { name: 'Old one' })).toBeNull()
    // RM 1,000 on three heads: 2990 333.33, CAR 166.67, Marketing 333.33 — HV's own 166.67 left out.
    expect(screen.getByText('Billable total').parentElement).toHaveTextContent('RM 833.33')
    expect(save()).not.toHaveAttribute('data-off')
  })

  it('saves the month’s batch on the list it previewed, and says so', async () => {
    mocks.save.mockResolvedValue({ txnNos: ['ALC-202609-008'] })
    const { onClose, onSaved } = show()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Office Rental' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '700' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat-rent' } })
    fireEvent.click(save())
    await flush()
    expect(mocks.save).toHaveBeenCalledWith({
      period: '2026-09',
      hcMode: 'current',
      hcPeriod: undefined,
      expenses: [{ description: 'Office Rental', amount: 700, method: 'headcount', categoryId: 'cat-rent', percentSplits: undefined, customSplits: undefined }],
    })
    expect(onSaved).toHaveBeenCalledWith('ALC-202609-008 saved — appears in Records')
    expect(onClose).toHaveBeenCalled()
  })

  it('says what is missing, and a refusal, and does not close', async () => {
    mocks.save.mockResolvedValue({ txnNos: [], error: 'No headcount snapshot for 2026-08 — save one on the Staff tab first' })
    const { onClose } = show()
    fireEvent.click(save())
    expect(screen.getByRole('alert')).toHaveTextContent('A description and an amount are needed before you can save.')
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '100' } })
    fireEvent.click(save())
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('No headcount snapshot for 2026-08')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Percentage is typed company by company, HV’s own box first; the preview waits for 100%', async () => {
    mocks.save.mockResolvedValue({ txnNos: ['ALC-202609-008'] })
    show()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'AI tools' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'percentage' } })
    expect(screen.getAllByRole('textbox', { name: /%$/ }).map((i) => i.getAttribute('aria-label'))).toEqual(['HV own (not billed) %', '2990 %', 'CAR %'])
    fireEvent.change(screen.getByLabelText('HV own (not billed) %'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('2990 %'), { target: { value: '20' } })
    expect(screen.getByText('"AI tools": percentages must total 100 (got 60)')).toBeInTheDocument()
    expect(save()).toHaveAttribute('data-off', 'true')
    fireEvent.change(screen.getByLabelText('CAR %'), { target: { value: '40' } })
    expect(preview()).toEqual(['HV own (not billed)40.0%400.00', '299020.0%200.00', 'CAR40.0%400.00', 'Billable totalRM 600.00'])
    fireEvent.click(save())
    await flush()
    expect(mocks.save.mock.calls[0][0].expenses[0]).toMatchObject({
      method: 'percentage',
      percentSplits: [
        { companyId: null, pct: 40 },
        { companyId: 'co-2990', pct: 20 },
        { companyId: 'co-car', pct: 40 },
      ],
    })
  })

  it('reads the headcount off another month’s snapshot when it is picked, and says so', async () => {
    mocks.save.mockResolvedValue({ txnNos: ['ALC-202609-008'] })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Headcount from · current list' }))
    fireEvent.change(screen.getByLabelText('Headcount from'), { target: { value: '2026-08' } })
    expect(screen.getByText('Using the August 2026 list for September 2026.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Headcount from · August 2026 snapshot' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '300' } })
    expect(preview()).toEqual(['29901 staff · 33.3%100.00', 'CAR2 staff · 66.7%200.00', 'Billable totalRM 300.00'])
    fireEvent.click(save())
    await flush()
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ hcMode: 'snapshot', hcPeriod: '2026-08' })
  })

  it('+ Add expense saves several in one batch; each is checked', async () => {
    mocks.save.mockResolvedValue({ txnNos: ['ALC-202609-008', 'ALC-202609-009'] })
    const { onSaved } = show()
    fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }))
    const [first, second] = screen.getAllByRole('group', { name: /^Expense \d$/ })
    fireEvent.change(within(first).getByLabelText('Description'), { target: { value: 'Rent' } })
    fireEvent.change(within(first).getByLabelText('Amount RM'), { target: { value: '700' } })
    fireEvent.change(within(second).getByLabelText('Description'), { target: { value: 'Water' } })
    fireEvent.change(within(second).getByLabelText('Method'), { target: { value: 'equal' } })
    fireEvent.click(save())
    expect(screen.getByRole('alert')).toHaveTextContent('Each expense’s amount is needed before you can save.')
    fireEvent.change(within(second).getByLabelText('Amount RM'), { target: { value: '100' } })
    fireEvent.click(save())
    await flush()
    expect(mocks.save.mock.calls[0][0].expenses.map((e: { description: string; method: string }) => [e.description, e.method])).toEqual([
      ['Rent', 'headcount'],
      ['Water', 'equal'],
    ])
    expect(onSaved).toHaveBeenCalledWith('2 allocations saved — they appear in Records')
  })
})

describe('Correct', () => {
  const TXN: TxnRow = {
    id: 't6', txnNo: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", billedRef: null, locked: false, amount: 2149.2, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, createdAt: '',
    details: [
      { companyId: 'co-2990', companyLabel: '2990', detail: '20%', amount: 429.84, isOwnShare: false },
      { companyId: 'co-car', companyLabel: 'CAR', detail: '40%', amount: 859.68, isOwnShare: false },
      { companyId: null, companyLabel: 'HOUZS Venture (own)', detail: '40% (own)', amount: 859.68, isOwnShare: true },
    ],
  }

  it('loads the record and overwrites it — its number kept, no second expense', async () => {
    mocks.update.mockResolvedValue({ txnNo: 'ALC-202609-006' })
    const { onSaved } = show({ edit: TXN })
    expect(screen.getByRole('dialog', { name: 'Correct ALC-202609-006' })).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue("AI TOOLS-SEP'2026")
    expect(screen.getByLabelText('Method')).toHaveValue('percentage')
    expect(screen.getByLabelText('HV own (not billed) %')).toHaveValue('40')
    expect(screen.getByLabelText('CAR %')).toHaveValue('40')
    expect(screen.getByText('Saving overwrites ALC-202609-006 — its number stays, its split is replaced.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add expense' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '2000' } })
    fireEvent.click(save())
    await flush()
    expect(mocks.update).toHaveBeenCalledWith({
      txnId: 't6',
      hcMode: 'current',
      hcPeriod: undefined,
      expense: expect.objectContaining({ description: "AI TOOLS-SEP'2026", amount: 2000, method: 'percentage', categoryId: 'cat-web' }),
    })
    expect(onSaved).toHaveBeenCalledWith('ALC-202609-006 corrected — the same number, the new split')
  })

  it('a headcount record from a snapshot comes back on that month', () => {
    show({ edit: { ...TXN, method: 'headcount', hcPeriod: '2026-08', details: [] } })
    expect(screen.getByLabelText('Headcount from')).toHaveValue('2026-08')
  })
})
