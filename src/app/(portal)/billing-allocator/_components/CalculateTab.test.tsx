import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, StaffRow } from './types'

// 2026-10-07 — Calculate on the sheet (the user approved the allocator
// sample): every field labelled, and the preview as a table — Bill to, the
// basis, the share — with the billable total under it. 2026-10-10 — the
// handoff's "Expense" form section: the headcount source and each expense's
// fields in one form, Save allocation and + Add expense inside it, the Preview
// ("BILLABLE TOTAL · HV OWN LEFT OUT") after it.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), saveAllocBatch: vi.fn(), updateAllocTxn: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../actions', () => ({ saveAllocBatch: mocks.saveAllocBatch, updateAllocTxn: mocks.updateAllocTxn }))

import CalculateTab from './CalculateTab'

const person = (id: string, status: StaffRow['status'], splits: StaffRow['splits']): StaffRow => ({ id, name: id, status, department: '', createdAt: '', splits })

function data(): AllocatorData {
  return {
    period: '2026-09',
    companies: [{ id: 'co-2990', label: '2990' }, { id: 'co-car', label: 'CAR' }],
    companySettings: [],
    departments: [],
    // 2990 1.0 head, CAR 0.5, HV own 0.5 → 2.0 heads
    staff: [
      person('a', 'active', [{ targetId: 'co-2990', label: '2990', pct: 100 }]),
      person('b', 'active', [{ targetId: 'co-car', label: 'CAR', pct: 50 }, { targetId: null, label: 'HOUZS Venture (own)', pct: 50 }]),
      person('c', 'inactive', [{ targetId: 'co-car', label: 'CAR', pct: 100 }]),
    ],
    snapshotPeriods: ['2026-08'],
    hrPeriods: [],
    snapshotSplitsByPeriod: { '2026-08': [{ targetId: 'co-car', pct: 100 }] },
    coaAccounts: [],
    categories: [{ id: 'cat-rent', name: 'Rental', coaCode: '7012' }],
    templates: [],
    txns: [],
    invoices: [],
  }
}

function typeExpense() {
  fireEvent.change(screen.getAllByLabelText('Description')[0], { target: { value: 'Office Rental' } })
  fireEvent.change(screen.getAllByLabelText('Amount RM')[0], { target: { value: '1000' } })
}

beforeEach(() => vi.clearAllMocks())

describe('Calculate on the sheet', () => {
  it('previews the split as a table — who, on what basis, how much — with the billable total under it', () => {
    render(<CalculateTab data={data()} onDoneEditing={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByLabelText('Headcount from')).toHaveValue('current')
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull()
    typeExpense()
    const head = screen.getByRole('heading', { name: 'Preview' }).closest('.sect-head') as HTMLElement
    expect(head.querySelector('.count')).toHaveTextContent('BILLABLE TOTAL · HV OWN LEFT OUT')
    const table = screen.getByRole('table')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Bill to', 'Basis', 'Share'])
    const rowOf = (label: string) => within(table).getByText(label).closest('tr') as HTMLElement
    expect(rowOf('2990')).toHaveTextContent('Head: 1.00/2.00 (current)')
    expect(rowOf('2990')).toHaveTextContent('RM 500.00')
    expect(rowOf('CAR')).toHaveTextContent('RM 250.00')
    expect(rowOf('HV own')).toHaveTextContent('RM 250.00')
    expect(rowOf('HV own')).toHaveClass('own')
    expect(table.querySelector('tfoot')).toHaveTextContent('Billable total')
    expect(table.querySelector('tfoot')).toHaveTextContent('RM 750.00')
    expect(screen.getByRole('button', { name: 'Save allocation' })).toBeEnabled()
  })

  it('lays the expense out as the handoff’s form, Save and + Add expense inside it, the preview after it', () => {
    render(<CalculateTab data={data()} onDoneEditing={vi.fn()} onSaved={vi.fn()} />)
    const head = screen.getByRole('heading', { name: 'Expense' }).closest('.sect-head') as HTMLElement
    expect(head.querySelector('.count')).toHaveTextContent('HEADCOUNT FROM · STAFF TAB · 2.00 HEADS')
    const form = head.nextElementSibling as HTMLElement
    expect(form).toHaveClass('fin-form')
    for (const label of ['Headcount from', 'Template', 'Description', 'Amount RM', 'Method', 'Category']) {
      expect(within(form).getByLabelText(label)).toBeInTheDocument()
    }
    expect(within(form).getByRole('button', { name: 'Save allocation' })).toBeDisabled()
    fireEvent.click(within(form).getByRole('button', { name: '+ Add expense' }))
    expect(within(form).getAllByLabelText('Description')).toHaveLength(2)
    typeExpense()
    const preview = screen.getByRole('heading', { name: 'Preview' })
    expect(form.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('saves the month’s batch on the list it previewed', async () => {
    mocks.saveAllocBatch.mockResolvedValue({})
    const onSaved = vi.fn()
    render(<CalculateTab data={data()} onDoneEditing={vi.fn()} onSaved={onSaved} />)
    typeExpense()
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat-rent' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save allocation' }))
    })
    expect(mocks.saveAllocBatch).toHaveBeenCalledWith({
      period: '2026-09',
      hcMode: 'current',
      hcPeriod: undefined,
      expenses: [{ description: 'Office Rental', amount: 1000, method: 'headcount', categoryId: 'cat-rent', percentSplits: undefined, customSplits: undefined }],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('previews on another month’s list when that snapshot is picked, and says so', () => {
    render(<CalculateTab data={data()} onDoneEditing={vi.fn()} onSaved={vi.fn()} />)
    typeExpense()
    fireEvent.change(screen.getByLabelText('Headcount from'), { target: { value: '2026-08' } })
    expect(screen.getByText(/August 2026 list for September 2026/)).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('CAR').closest('tr')).toHaveTextContent('RM 1,000.00')
    expect(within(table).queryByText('2990')).toBeNull()
  })
})
