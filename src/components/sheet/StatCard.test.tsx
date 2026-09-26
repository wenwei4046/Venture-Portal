import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard, StatCards, statColumns } from './StatCard'

describe('statColumns', () => {
  it('keeps up to six cards on one row', () => {
    expect(statColumns(1)).toEqual({ wide: 1, medium: 1 })
    expect(statColumns(5)).toEqual({ wide: 5, medium: 3 })
    expect(statColumns(6)).toEqual({ wide: 6, medium: 3 })
  })

  it('splits more than six into two even rows', () => {
    expect(statColumns(7)).toEqual({ wide: 4, medium: 3 })
    expect(statColumns(8)).toEqual({ wide: 4, medium: 3 })
    expect(statColumns(10)).toEqual({ wide: 5, medium: 3 })
  })

  it('never asks for zero columns', () => {
    expect(statColumns(0).wide).toBe(1)
  })
})

describe('StatCards', () => {
  it('counts only the cards that are there', () => {
    const { container } = render(
      <StatCards label="Totals">
        <StatCard label="A" value="1" icon="coin" />
        {null}
        {false}
        <StatCard label="B" value="2" icon="coin" />
      </StatCards>,
    )
    const grid = container.querySelector<HTMLElement>('.stat-cards-grid')
    expect(grid?.style.getPropertyValue('--stat-cols')).toBe('2')
    expect(screen.getByRole('region', { name: 'Totals' })).toBeDefined()
  })

  it('shows its quiet line under the cards', () => {
    render(
      <StatCards label="Totals" note="Unmatched agents 0">
        <StatCard label="A" value="1" icon="coin" />
      </StatCards>,
    )
    expect(screen.getByText('Unmatched agents 0')).toHaveClass('stat-cards-note')
  })
})

describe('StatCard', () => {
  it('names itself by its label and carries its tone for the sheet to paint', () => {
    render(<StatCard label="Total CTC" value="RM 1.00" icon="coin" tone="primary" note="Live preview" />)
    const card = screen.getByRole('group', { name: 'Total CTC' })
    expect(card).toHaveAttribute('data-tone', 'primary')
    expect(card).toHaveTextContent('RM 1.00')
    expect(card).toHaveTextContent('Live preview')
    expect(card.querySelector('.stat-card-icon svg')).not.toBeNull()
  })

  it('leaves an ordinary card untinted', () => {
    render(<StatCard label="Basic" value="RM 1.00" icon="wallet" />)
    expect(screen.getByRole('group', { name: 'Basic' })).not.toHaveAttribute('data-tone')
  })

  it('opens what it counts when it has somewhere to go', () => {
    render(<StatCard label="Bills" value="199" icon="receipt" href="/revenue/fair/2026-09-01/orders" />)
    expect(screen.getByRole('link', { name: 'Bills' })).toHaveAttribute('href', '/revenue/fair/2026-09-01/orders')
  })
})
