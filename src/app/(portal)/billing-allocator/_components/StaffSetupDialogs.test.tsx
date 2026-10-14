import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData } from './types'

// The allocator's Staff and Setup dialogs (2026-10-14, the Finance revamp v2 —
// D11; the design's *Edit* and *+ Add staff* open them, the system's in the
// kit's sheet): a person and their splits (no more than 100%), taken off the
// list from the same dialog, asked first; a saved snapshot; HR's list
// imported over the whole list, asked first; a category and its account; a
// template, its default % a company.

const mocks = vi.hoisted(() => ({
  saveStaff: vi.fn(),
  delStaff: vi.fn(),
  importHr: vi.fn(),
  saveCat: vi.fn(),
  delCat: vi.fn(),
  saveTpl: vi.fn(),
  delTpl: vi.fn(),
}))
vi.mock('../actions', () => ({
  saveAllocStaff: mocks.saveStaff,
  deleteAllocStaff: mocks.delStaff,
  importAllocStaffFromHr: mocks.importHr,
  saveAllocCategory: mocks.saveCat,
  deleteAllocCategory: mocks.delCat,
  saveAllocTemplate: mocks.saveTpl,
  deleteAllocTemplate: mocks.delTpl,
}))
vi.mock('../../statements/invoice-actions', () => ({ hubHrFigures: vi.fn() }))

import { ImportDialog, SnapshotDialog, StaffDialog } from './StaffDialogs'
import { CategoryDialog, TemplateDialog } from './SetupDialogs'

const DATA: AllocatorData = {
  period: '2026-09',
  companies: [
    { id: 'co-2990', label: '2990' },
    { id: 'co-car', label: 'CAR' },
  ],
  companySettings: [
    { id: 'co-2990', label: '2990', name: '2990 Sdn Bhd', code: '2990', enabled: true },
    { id: 'co-car', label: 'CAR', name: 'Carres', code: 'CAR', enabled: true },
    { id: 'co-hk', label: 'HK', name: 'Hookka', code: 'HK', enabled: false },
  ],
  departments: [{ id: 'dept:mkt', label: 'Marketing (dept)' }],
  staff: [
    { id: 's1', name: 'Carrie Ong', status: 'active', department: 'Finance', createdAt: '', splits: [{ targetId: null, label: 'HOUZS Venture (own)', pct: 30 }, { targetId: 'co-hk', label: 'HK', pct: 70 }] },
  ],
  snapshotPeriods: [],
  hrPeriods: ['2026-09', '2026-08'],
  snapshotSplitsByPeriod: {},
  coaAccounts: [
    { code: '7012', name: 'Rental Income', type: 'other_income', parent_code: null, is_active: true },
    { code: '9091', name: 'Water & Electricity', type: 'expense', parent_code: null, is_active: true },
  ],
  categories: [{ id: 'cat-rent', name: 'Rental', coaCode: '7012' }],
  templates: [],
  txns: [],
  invoices: [],
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
const dialog = () => [...document.querySelectorAll('[data-fin-dialog] [role="dialog"]')].pop() as HTMLElement
const props = () => ({ open: true, onClose: vi.fn(), onDone: vi.fn() })

beforeEach(() => vi.clearAllMocks())

describe('a person on the Staff list', () => {
  it('adds one: name, department, status and splits — HV’s own share first — no more than 100%', async () => {
    mocks.saveStaff.mockResolvedValue({})
    const p = props()
    render(<StaffDialog {...p} data={DATA} person={null} />)
    expect(dialog()).toHaveTextContent('Add staff')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lang Xuen Li' } })
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Finance' } })
    fireEvent.change(screen.getByLabelText('Split 1 %'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add split' }))
    fireEvent.change(screen.getByLabelText('Split 2 bills'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Split 2 %'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('The splits come to 110% — no more than 100%.')).toBeInTheDocument()
    expect(mocks.saveStaff).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Split 2 %'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(mocks.saveStaff).toHaveBeenCalledWith({
      id: undefined,
      name: 'Lang Xuen Li',
      status: 'active',
      department: 'Finance',
      splits: [
        { targetId: null, pct: 50 },
        { targetId: 'co-car', pct: 50 },
      ],
    })
    expect(p.onDone).toHaveBeenCalledWith('Lang Xuen Li saved')
    expect(p.onClose).toHaveBeenCalled()
  })

  it('edits one, keeping a switched-off company it still names; Remove asks first', async () => {
    mocks.delStaff.mockResolvedValue({})
    const p = props()
    render(<StaffDialog {...p} data={DATA} person={DATA.staff[0]} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Carrie Ong')
    expect(screen.getByLabelText('Split 2 bills')).toHaveValue('co-hk')
    expect(within(screen.getByLabelText('Split 2 bills')).getByRole('option', { name: 'HK (switched off)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(dialog()).toHaveTextContent('Remove Carrie Ong?')
    expect(dialog()).toHaveTextContent('They leave the list, and this month’s headcount snapshot is saved again without them.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove' }))
    await flush()
    expect(mocks.delStaff).toHaveBeenCalledWith('s1')
    expect(p.onDone).toHaveBeenCalledWith('Carrie Ong removed from the list')
  })

  it('says why when the save is refused', async () => {
    mocks.saveStaff.mockResolvedValue({ error: 'Splits total 120% — cannot exceed 100%' })
    const p = props()
    render(<StaffDialog {...p} data={DATA} person={DATA.staff[0]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Splits total 120% — cannot exceed 100%')
    expect(p.onClose).not.toHaveBeenCalled()
  })
})

describe('a saved snapshot', () => {
  it('sums each company’s heads and lists who was in it, inactive ones last; searchable', () => {
    const rows = [
      { staffName: 'Carrie Ong', status: 'active', department: 'Finance', targetId: null, pct: 30 },
      { staffName: 'Carrie Ong', status: 'active', department: 'Finance', targetId: 'co-2990', pct: 70 },
      { staffName: 'Ah Kow', status: 'inactive', department: 'Admin', targetId: 'co-2990', pct: 100 },
      { staffName: 'Bee', status: 'active', department: 'Sales', targetId: 'co-2990', pct: 100 },
    ]
    const labelOf = (id: string | null) => (id === null ? 'HV own' : id === 'co-2990' ? '2990' : '?')
    render(<SnapshotDialog open onClose={vi.fn()} period="2026-08" rows={rows} savedAt="2026-08-31T06:30:00Z" labelOf={labelOf} />)
    expect(dialog()).toHaveTextContent('Snapshot · August 2026')
    expect(dialog()).toHaveTextContent('Saved 31 Aug 2026 · 14:30')
    expect(screen.getByRole('group', { name: 'By company' })).toHaveTextContent('29901.70 · 85.0%HV own0.30 · 15.0%')
    expect(within(screen.getByRole('list', { name: 'The list' })).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'BeeSales · 2990 100%',
      'Carrie OngFinance · HV own 30% · 2990 70%',
      'Ah KowAdmin · inactive · 2990 100%',
    ])
    fireEvent.change(screen.getByPlaceholderText('Search name / department / company…'), { target: { value: 'sales' } })
    expect(within(screen.getByRole('list', { name: 'The list' })).getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('Import from HR', () => {
  it('asks first — the whole list is replaced — on the month picked', async () => {
    mocks.importHr.mockResolvedValue({ imported: 48 })
    const p = props()
    render(<ImportDialog {...p} hrPeriods={DATA.hrPeriods} />)
    expect(dialog()).toHaveTextContent('Import HR’s list?')
    expect(dialog()).toHaveTextContent('This replaces the whole list with HR’s allocation for the month')
    fireEvent.change(screen.getByLabelText('HR month'), { target: { value: '2026-08' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }))
    await flush()
    expect(mocks.importHr).toHaveBeenCalledWith('2026-08')
    expect(p.onDone).toHaveBeenCalledWith('Imported 48 people from HR’s August 2026 list')
  })
})

describe('Setup', () => {
  it('a category: its name and the account its lines post to; none is the invoice’s default', async () => {
    mocks.saveCat.mockResolvedValue({})
    const p = props()
    render(<CategoryDialog {...p} data={DATA} category={null} />)
    expect(screen.getByLabelText('Account')).toHaveValue('')
    expect(within(screen.getByLabelText('Account')).getByRole('option', { name: 'No account — the invoice’s default' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('A name is needed before you can save.')).toBeInTheDocument()
    expect(mocks.saveCat).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Utilities' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '9091' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(mocks.saveCat).toHaveBeenCalledWith({ id: undefined, name: 'Utilities', coaCode: '9091' })
    expect(p.onDone).toHaveBeenCalledWith('Utilities saved')
  })

  it('a category is deleted from its own dialog, asked first', async () => {
    mocks.delCat.mockResolvedValue({})
    const p = props()
    render(<CategoryDialog {...p} data={DATA} category={DATA.categories[0]} />)
    expect(screen.getByLabelText('Account')).toHaveValue('7012')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(dialog()).toHaveTextContent('Delete Rental?')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(mocks.delCat).toHaveBeenCalledWith('cat-rent')
    expect(p.onDone).toHaveBeenCalledWith('Rental deleted')
  })

  it('a template: a Percentage one keeps each company’s default %', async () => {
    mocks.saveTpl.mockResolvedValue({})
    const p = props()
    render(<TemplateDialog {...p} data={DATA} template={null} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'AI tools' } })
    fireEvent.change(screen.getByLabelText('Default RM'), { target: { value: '1863.18' } })
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat-rent' } })
    fireEvent.change(screen.getByLabelText('2990 %'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('CAR %'), { target: { value: '40' } })
    expect(dialog()).toHaveTextContent('Total60%')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(mocks.saveTpl).toHaveBeenCalledWith({
      id: undefined,
      name: 'AI tools',
      method: 'percentage',
      amount: 1863.18,
      categoryId: 'cat-rent',
      status: 'active',
      splits: [
        { companyId: 'co-2990', pct: 20 },
        { companyId: 'co-car', pct: 40 },
      ],
    })
    expect(p.onDone).toHaveBeenCalledWith('AI tools saved')
  })

  it('a template keeps its status, and is deleted from its own dialog, asked first', async () => {
    mocks.saveTpl.mockResolvedValue({})
    mocks.delTpl.mockResolvedValue({})
    const tpl = { id: 'tp9', name: 'Old', method: 'equal' as const, amount: 0, categoryId: null, status: 'inactive', splits: [] }
    const p = props()
    const { unmount } = render(<TemplateDialog {...p} data={DATA} template={tpl} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(mocks.saveTpl).toHaveBeenCalledWith(expect.objectContaining({ id: 'tp9', status: 'inactive', amount: 0 }))
    unmount()
    render(<TemplateDialog {...props()} data={DATA} template={tpl} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(dialog()).toHaveTextContent('It leaves the Template list in + New allocation. Allocations made from it stay as they are.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(mocks.delTpl).toHaveBeenCalledWith('tp9')
  })
})
