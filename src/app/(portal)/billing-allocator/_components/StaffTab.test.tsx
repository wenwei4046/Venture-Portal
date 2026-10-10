import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, StaffRow } from './types'

// 2026-10-10 — the handoff's Staff tab, in English: "Staff · N PEOPLE", one
// sortable table of everyone (Name / Department / Status chip / Splits as text
// / Added as a date), "Search name / department / company…". The list's own
// functions stay, as English actions: + Add person (the editor dialog), Save
// the month's snapshot, the saved snapshots (each opens its review), and
// Import from HR (with its confirmation).

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveAllocStaff: vi.fn(),
  deleteAllocStaff: vi.fn(),
  saveAllocSnapshot: vi.fn(),
  importAllocStaffFromHr: vi.fn(),
  getAllocSnapshot: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))
vi.mock('../actions', () => ({
  saveAllocStaff: mocks.saveAllocStaff,
  deleteAllocStaff: mocks.deleteAllocStaff,
  saveAllocSnapshot: mocks.saveAllocSnapshot,
  importAllocStaffFromHr: mocks.importAllocStaffFromHr,
  getAllocSnapshot: mocks.getAllocSnapshot,
}))

import StaffTab from './StaffTab'

const person = (id: string, name: string, status: StaffRow['status'], splits: StaffRow['splits'], createdAt = '2026-03-02T02:00:00Z'): StaffRow => ({
  id,
  name,
  status,
  department: 'Finance',
  createdAt,
  splits,
})
const STAFF = [
  person('a', 'Aina', 'active', [
    { targetId: 'co-hc', label: 'HC', pct: 40 },
    { targetId: 'co-hm', label: 'HM', pct: 30 },
    { targetId: null, label: 'HOUZS Venture (own)', pct: 30 },
  ]),
  person('r', 'Raj', 'inactive', [], '2025-11-03T02:00:00Z'),
]

function data(over: Partial<AllocatorData> = {}): AllocatorData {
  return {
    period: '2026-09',
    companies: [{ id: 'co-hc', label: 'HC' }, { id: 'co-hm', label: 'HM' }],
    companySettings: [],
    departments: [],
    staff: STAFF,
    snapshotPeriods: ['2026-08'],
    hrPeriods: ['2026-09', '2026-08'],
    snapshotSplitsByPeriod: {},
    coaAccounts: [],
    categories: [],
    templates: [],
    txns: [],
    invoices: [],
    ...over,
  }
}
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

beforeEach(() => vi.clearAllMocks())

describe('the allocator’s Staff, the handoff’s way', () => {
  it('lists everyone in one table: name, department, a status chip, the splits as text, the date added', () => {
    render(<StaffTab data={data()} />)
    const head = screen.getByRole('heading', { name: 'Staff' }).closest('.sect-head') as HTMLElement
    expect(head.querySelector('.count')).toHaveTextContent('2 PEOPLE')
    expect(screen.getByPlaceholderText('Search name / department / company…')).toBeInTheDocument()
    const aina = rowOf('Aina')
    // The chip in its column (the phone's small print carries it too).
    expect(within(aina).getAllByText('active')[0].closest('.chip')).toHaveClass('ledger')
    expect(aina).toHaveTextContent('HC 40% · HM 30% · HV own 30%')
    expect(aina).toHaveTextContent('2 Mar 2026')
    const raj = rowOf('Raj')
    expect(within(raj).getAllByText('inactive')[0].closest('.chip')).toHaveClass('info')
    expect(raj).toHaveTextContent('no splits')
    expect(screen.getByRole('button', { name: 'Filter Status' })).toBeInTheDocument()
  })

  it('reads in English — no Chinese left on the tab', () => {
    const { container } = render(<StaffTab data={data()} />)
    expect(container.textContent ?? '').not.toMatch(/[一-鿿]/)
  })

  it('adds a person in an English dialog', async () => {
    mocks.saveAllocStaff.mockResolvedValue({})
    render(<StaffTab data={data()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add person' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a person' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Mei Ling' } })
    expect(within(dialog).getByText(/Splits · total 100%/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '+ Add a split' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })
    expect(mocks.saveAllocStaff).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mei Ling', status: 'active', splits: [{ targetId: null, pct: 100 }] }))
  })

  it('saves the month’s snapshot, and opens a saved one', async () => {
    mocks.saveAllocSnapshot.mockResolvedValue({})
    mocks.getAllocSnapshot.mockResolvedValue({
      savedAt: '2026-08-31T10:00:00Z',
      rows: [
        { staffName: 'Aina', status: 'active', department: 'Finance', targetId: 'co-hc', pct: 50 },
        { staffName: 'Aina', status: 'active', department: 'Finance', targetId: null, pct: 50 },
      ],
    })
    render(<StaffTab data={data()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save September 2026 snapshot' }))
    })
    expect(mocks.saveAllocSnapshot).toHaveBeenCalledWith('2026-09')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aug 2026 →' }))
    })
    const dialog = await screen.findByRole('dialog', { name: 'Snapshot · August 2026' })
    expect(dialog).toHaveTextContent('By company · 1.00 heads')
    expect(dialog).toHaveTextContent('List · 1 person')
    expect(within(dialog).getByPlaceholderText('Search name / department / company…')).toBeInTheDocument()
  })

  it('imports HR’s list only after saying it replaces the whole list', async () => {
    mocks.importAllocStaffFromHr.mockResolvedValue({ imported: 12 })
    render(<StaffTab data={data()} />)
    fireEvent.change(screen.getByLabelText('Import from HR'), { target: { value: '2026-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import HR list' }))
    expect(screen.getByText(/This replaces the whole list/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    })
    expect(mocks.importAllocStaffFromHr).toHaveBeenCalledWith('2026-08')
    expect(await screen.findByText(/Imported 12 people/)).toBeInTheDocument()
  })
})
