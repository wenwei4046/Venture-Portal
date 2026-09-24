import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CostingGap } from '../load'
import CostingGapsSection from './CostingGapsSection'

function gap(code: string, overrides: Partial<CostingGap> = {}): CostingGap {
  return { item_code: code, item_group: 'SOFA', product_name: `Sofa ${code}`, brand_code: 'ZANOTTI', lines: 2, bills: 1, qty: 2, revenue: 500, in_sku_master: true, has_price: false, reason: 'unpriced', erp_product_id: code, ...overrides }
}
const fixtures = [
  gap('2376-1A(P)/LHF & R', { lines: 3, bills: 2, revenue: 1200.25 }),
  gap('READY', { lines: 2, bills: 2, revenue: 300, has_price: true }),
  gap('MISSING', { lines: 1, bills: 1, revenue: 800, reason: 'not_in_sku_master', in_sku_master: false, erp_product_id: null, brand_code: 'AKEMI', product_name: 'Mattress King', item_group: 'MATTRESS' }),
  gap('SIZE', { lines: 5, bills: 3, revenue: 0, reason: 'no_height' }),
  gap('UNKNOWN', { lines: 1, bills: 1, revenue: 100, reason: 'future_reason', brand_code: null, product_name: null, item_group: null }),
]
const period = { from: '2026-08-01', to: '2027-01-01' }
function summary() { return screen.getByRole('region', { name: 'Costing gaps' }).querySelector('.sku-count')! }
function codeRows() { return within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent) }

afterEach(cleanup)

describe('Costing gaps work list', () => {
  it('shows the exclusive end-date boundary and totals sales lines and revenue without summing overlapping bills', () => {
    render(<CostingGapsSection gaps={fixtures} {...period} />)
    expect(screen.getByText('Sales from 2026-08-01 up to, but not including, 2027-01-01.')).toBeInTheDocument()
    expect(summary()).toHaveTextContent('5 codes · 12 sales lines · RM 2,400.25 revenue')
    expect(summary()).not.toHaveTextContent('bills')
    expect(screen.getByText('Bills are counted per code; the same bill may appear in several rows.')).toBeInTheDocument()
    expect(codeRows()).toEqual(['2376-1A(P)/LHF & R', 'MISSING', 'READY', 'UNKNOWN', 'SIZE'])
    expect(screen.getByRole('link', { name: 'Open SKU Master' })).toHaveAttribute('href', '/revenue/products')
  })

  it('combines search with the reason filter and recalculates totals for the matching records', () => {
    render(<CostingGapsSection gaps={fixtures} {...period} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason' }), { target: { value: 'unpriced' } })
    expect(summary()).toHaveTextContent('2 codes · 5 sales lines · RM 1,500.25 revenue')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search costing gaps' }), { target: { value: '  ready  ' } })
    expect(summary()).toHaveTextContent('1 codes · 2 sales lines · RM 300.00 revenue')
    expect(codeRows()).toEqual(['READY'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search costing gaps' }), { target: { value: 'akemi' } })
    expect(screen.getByText('No costing gaps match these filters.')).toBeInTheDocument()
    expect(summary()).toHaveTextContent('0 codes · 0 sales lines · RM 0.00 revenue')
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason' }), { target: { value: '' } })
    expect(codeRows()).toEqual(['MISSING'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search costing gaps' }), { target: { value: 'king' } })
    expect(codeRows()).toEqual(['MISSING'])
  })

  it('gives actionable instructions for already-priced and missing codes, and encodes exact SKU codes in review links', () => {
    render(<CostingGapsSection gaps={fixtures} {...period} />)
    const ready = screen.getByText('READY').closest('tr')!
    expect(within(ready).getByText('Price now available. Recost the affected orders in Comm Cal.')).toBeInTheDocument()
    expect(within(ready).queryByRole('link')).not.toBeInTheDocument()
    const missing = screen.getByText('MISSING').closest('tr')!
    expect(within(missing).getByText('Check this code in the ERP catalogue.')).toBeInTheDocument()
    expect(within(missing).queryByRole('link')).not.toBeInTheDocument()
    const exact = screen.getByText('2376-1A(P)/LHF & R').closest('tr')!
    expect(within(exact).getByRole('link', { name: 'Review SKU price' })).toHaveAttribute('href', '/revenue/products?q=2376-1A(P)%2FLHF%20%26%20R')
    const size = screen.getByText('SIZE').closest('tr')!
    expect(within(size).getByRole('link')).toHaveAttribute('href', '/revenue/products?q=SIZE')
  })

  it('retains unrecognised reasons and null descriptions instead of hiding source records', () => {
    render(<CostingGapsSection gaps={fixtures} {...period} />)
    expect(screen.getByRole('option', { name: 'future_reason' })).toHaveValue('future_reason')
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason' }), { target: { value: 'future_reason' } })
    expect(codeRows()).toEqual(['UNKNOWN'])
    const unknown = screen.getByText('UNKNOWN').closest('tr')!
    expect(within(unknown).getAllByText('—')).toHaveLength(2)
    expect(summary()).toHaveTextContent('1 codes · 1 sales lines · RM 100.00 revenue')
  })

  it('searches and totals every record beyond the first window, while load-more changes only visible rows', () => {
    const many = Array.from({ length: 205 }, (_, i) => gap(`CODE-${String(i).padStart(3, '0')}`, { revenue: 205 - i, lines: 1 }))
    render(<CostingGapsSection gaps={many} {...period} />)
    expect(screen.getByText('200 of 205 codes shown')).toBeInTheDocument()
    expect(summary()).toHaveTextContent('205 codes · 205 sales lines · RM 21,115.00 revenue')
    expect(screen.queryByText('CODE-204')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }))
    expect(screen.getByText('CODE-204')).toBeInTheDocument()
    expect(screen.getByText('205 of 205 codes shown')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search costing gaps' }), { target: { value: 'CODE-204' } })
    expect(codeRows()).toEqual(['CODE-204'])
    expect(summary()).toHaveTextContent('1 codes · 1 sales lines · RM 1.00 revenue')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search costing gaps' }), { target: { value: '' } })
    expect(screen.getByText('200 of 205 codes shown')).toBeInTheDocument()
  })

  it('distinguishes an empty reporting period from a filtered-out result', () => {
    render(<CostingGapsSection gaps={[]} {...period} />)
    expect(screen.getByText('No costing gaps were found in this sales period.')).toBeInTheDocument()
    expect(screen.queryByText('No costing gaps match these filters.')).not.toBeInTheDocument()
    expect(summary()).toHaveTextContent('0 codes · 0 sales lines · RM 0.00 revenue')
  })
})
