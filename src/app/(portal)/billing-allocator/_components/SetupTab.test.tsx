import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData } from './types'

// 2026-10-10 — the handoff's Setup tab, in English: three tables — Companies
// (Company / Code / an "In allocation" chip, "x / y ENABLED"), Categories
// (Account / Name) and Templates (Name / Method / Default RM / Category / a
// Status chip; the per-company % of a Percentage template kept as Split %).
// Switching a company on or off, and adding or editing a category or a
// template, stay — in English.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveAllocCategory: vi.fn(),
  deleteAllocCategory: vi.fn(),
  saveAllocTemplate: vi.fn(),
  deleteAllocTemplate: vi.fn(),
  setAllocCompanyEnabled: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../actions', () => ({
  saveAllocCategory: mocks.saveAllocCategory,
  deleteAllocCategory: mocks.deleteAllocCategory,
  saveAllocTemplate: mocks.saveAllocTemplate,
  deleteAllocTemplate: mocks.deleteAllocTemplate,
  setAllocCompanyEnabled: mocks.setAllocCompanyEnabled,
}))
vi.mock('@/components/AccountPicker', () => ({
  default: (p: { value: string; onChange: (code: string) => void }) => (
    <input aria-label="COA account" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}))

import SetupTab from './SetupTab'

function data(): AllocatorData {
  return {
    period: '2026-09',
    companies: [{ id: 'co-hc', label: 'HC' }, { id: 'co-hm', label: 'HM' }],
    companySettings: [
      { id: 'co-hc', label: 'HC', name: 'HOUZS Century', code: 'HC', enabled: true },
      { id: 'co-hm', label: 'HM', name: 'HOUZS Mattress', code: 'HM', enabled: true },
      { id: 'co-hv', label: 'HV', name: 'HOUZS Venture', code: 'HV', enabled: false },
    ],
    departments: [],
    staff: [],
    snapshotPeriods: [],
    hrPeriods: [],
    snapshotSplitsByPeriod: {},
    coaAccounts: [],
    categories: [
      { id: 'cat-rent', name: 'Rental', coaCode: '6200' },
      { id: 'cat-misc', name: 'Misc', coaCode: '' },
    ],
    templates: [
      { id: 't-rent', name: 'Office Rental', method: 'headcount', amount: 18500, categoryId: 'cat-rent', status: 'active', splits: [] },
      { id: 't-audit', name: 'Audit Fee', method: 'percentage', amount: 4500, categoryId: null, status: 'inactive', splits: [{ companyId: 'co-hc', pct: 60 }, { companyId: 'co-hm', pct: 40 }] },
    ],
    txns: [],
    invoices: [],
  }
}
const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
// The phone's chevron cell is not a column.
const headers = (el: HTMLElement) => Array.from(el.querySelectorAll('thead th:not(.lt-toggle)')).map((th) => th.textContent?.trim())

beforeEach(() => vi.clearAllMocks())

describe('the allocator’s Setup, the handoff’s way', () => {
  it('lists the companies with their code and whether each is in the allocation', async () => {
    mocks.setAllocCompanyEnabled.mockResolvedValue({})
    render(<SetupTab data={data()} />)
    const companies = section('Companies')
    expect(companies.querySelector('.count')).toHaveTextContent('2 / 3 ENABLED')
    expect(headers(companies)).toEqual(['Company', 'Code', 'In allocation', ''])
    const hc = within(companies).getByText('HOUZS Century').closest('tr') as HTMLElement
    expect(hc).toHaveTextContent('HC')
    expect(within(hc).getByText('enabled').closest('.chip')).toHaveClass('ledger')
    const hv = within(companies).getByText('HOUZS Venture').closest('tr') as HTMLElement
    expect((within(hv).getByText('off').closest('.chip') as HTMLElement).className.trim()).toBe('chip')
    await act(async () => {
      fireEvent.click(within(hv).getByRole('button', { name: 'Turn on' }))
    })
    expect(mocks.setAllocCompanyEnabled).toHaveBeenCalledWith('co-hv', true)
  })

  it('lists the categories by account and name, and adds one in English', async () => {
    mocks.saveAllocCategory.mockResolvedValue({})
    render(<SetupTab data={data()} />)
    const cats = section('Categories')
    expect(cats.querySelector('.count')).toHaveTextContent('2')
    expect(headers(cats)).toEqual(['Account', 'Name', ''])
    expect(within(cats).getByText('Rental').closest('tr')).toHaveTextContent('6200')
    fireEvent.click(within(cats).getByRole('button', { name: '+ Add category' }))
    fireEvent.change(within(cats).getByLabelText('Name'), { target: { value: 'Utilities' } })
    fireEvent.change(within(cats).getByLabelText('COA account'), { target: { value: '6300' } })
    await act(async () => {
      fireEvent.click(within(cats).getByRole('button', { name: 'Save' }))
    })
    expect(mocks.saveAllocCategory).toHaveBeenCalledWith({ name: 'Utilities', coaCode: '6300' })
  })

  it('lists the templates with a status chip and keeps a Percentage template’s split', () => {
    render(<SetupTab data={data()} />)
    const tpl = section('Templates')
    expect(tpl.querySelector('.count')).toHaveTextContent('2')
    expect(headers(tpl)).toEqual(['Name', 'Method', 'Default RM', 'Category', 'Split %', 'Status', ''])
    const rent = within(tpl).getByText('Office Rental').closest('tr') as HTMLElement
    expect(rent).toHaveTextContent('Headcount')
    expect(rent).toHaveTextContent('18,500.00')
    expect(rent).toHaveTextContent('Rental')
    expect(within(rent).getByText('active').closest('.chip')).toHaveClass('ledger')
    const audit = within(tpl).getByText('Audit Fee').closest('tr') as HTMLElement
    expect(audit).toHaveTextContent('HC 60% · HM 40%')
    expect(within(audit).getByText('inactive').closest('.chip')).toHaveClass('info')
    fireEvent.click(within(tpl).getByRole('button', { name: '+ Add template' }))
    expect(within(tpl).getByLabelText('Default RM')).toBeInTheDocument()
  })

  it('reads in English — no Chinese left on the tab', () => {
    const { container } = render(<SetupTab data={data()} />)
    expect(container.textContent ?? '').not.toMatch(/[一-鿿]/)
  })
})
