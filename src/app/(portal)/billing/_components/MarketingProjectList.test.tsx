import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-10 — the handoff's Marketing projects: a sortable sheet table
// (▽ filters, a Range on the amount), the status as a chip, "N PROJECTS",
// and an Invoice button on each project — it opens the month's invoice for
// that contract. Edit and + New contract stay (the page's own functions).

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

import MarketingProjectList from './MarketingProjectList'

const companyMap = new Map([
  ['co-hc', { name: 'HOUZS Century', code: 'HC' }],
  ['co-hd', { name: 'HOUZS Design', code: 'HD' }],
])
const contract = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  description: `Project ${id}`,
  amount: 1000,
  status: 'active',
  start_date: '2026-10-16',
  end_date: '2026-10-31',
  company_id: 'co-hc',
  approved_by: 'p1',
  ...over,
})
const CONTRACTS = [
  contract('ct-1', { description: 'Marketing retainer — Q4', amount: 6000, start_date: '2026-10-01', end_date: '2026-12-31' }),
  contract('ct-2', { description: 'Rebranding package', status: 'completed', company_id: 'co-hd', amount: 7500 }),
  contract('ct-3', { description: 'New campaign', approved_by: null }),
]
const head = () => screen.getByRole('heading', { name: 'Marketing projects' }).closest('.sect-head') as HTMLElement
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement

beforeEach(() => vi.clearAllMocks())

describe('Marketing projects on the sheet', () => {
  it('counts the projects and lists them in a sortable table with filters', () => {
    render(<MarketingProjectList contracts={CONTRACTS} companyMap={companyMap} canCreate invoiceByContract={{}} period="2026-10-01" />)
    expect(head().querySelector('.count')).toHaveTextContent('3 PROJECTS')
    const heads = Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
    expect(heads).toEqual(['project', 'company', 'amount', 'dates', 'status', 'action'])
    expect(screen.getByRole('button', { name: 'Filter Project' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    expect(rowOf('Marketing retainer — Q4')).toHaveTextContent('HOUZS Century (HC)')
    expect(rowOf('Marketing retainer — Q4')).toHaveTextContent('1 Oct – 31 Dec 2026')
  })

  it('chips the status — active green, waiting for the Principal blue, completed quiet', () => {
    render(<MarketingProjectList contracts={CONTRACTS} companyMap={companyMap} canCreate invoiceByContract={{}} period="2026-10-01" />)
    expect(within(rowOf('Marketing retainer — Q4')).getByText('active').closest('.chip')).toHaveClass('ledger')
    expect(within(rowOf('New campaign')).getByText('pending approval').closest('.chip')).toHaveClass('wait')
    const done = within(rowOf('Rebranding package')).getByText('completed').closest('.chip') as HTMLElement
    expect(done.className.trim()).toBe('chip')
  })

  it('gives each project an Invoice button that opens its invoice this month, and keeps Edit and + New contract', () => {
    render(
      <MarketingProjectList
        contracts={CONTRACTS}
        companyMap={companyMap}
        canCreate
        invoiceByContract={{ 'ct-1': { id: 'inv-9', no: 'HV-INV-202610-0009' } }}
        period="2026-10-01"
      />,
    )
    expect(within(rowOf('Marketing retainer — Q4')).getByRole('link', { name: 'Invoice' })).toHaveAttribute('href', '/invoices/inv-9')
    const none = within(rowOf('New campaign')).getByRole('button', { name: 'Invoice' })
    expect(none).toBeDisabled()
    expect(none).toHaveAttribute('title', expect.stringContaining('No invoice for this project in October 2026'))
    expect(within(rowOf('New campaign')).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/billing/contracts/ct-3/edit')
    expect(screen.getByRole('link', { name: '+ New contract' })).toHaveAttribute('href', '/billing/contracts/new')
  })

  it('says so when there is no project yet', () => {
    render(<MarketingProjectList contracts={[]} companyMap={companyMap} canCreate invoiceByContract={{}} period="2026-10-01" />)
    expect(head().querySelector('.count')).toHaveTextContent('0 PROJECTS')
    expect(screen.getByText(/No Marketing project contracts yet/)).toBeInTheDocument()
  })
})
