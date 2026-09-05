import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlidingTabs } from './SlidingTabs'

const tabs = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'tiers', label: 'Tier' },
  { key: 'overdue', label: 'Overdue' },
]

describe('SlidingTabs', () => {
  it('renders all tab items', () => {
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />)
    expect(screen.getByText('Treasury')).toBeDefined()
    expect(screen.getByText('Tier')).toBeDefined()
    expect(screen.getByText('Overdue')).toBeDefined()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={onChange} />)
    fireEvent.click(screen.getByText('Tier'))
    expect(onChange).toHaveBeenCalledWith('tiers')
  })

  it('shows a count after the label when the item carries one', () => {
    render(
      <SlidingTabs
        items={[{ key: 'chart', label: 'Hierarchy' }, { key: 'team', label: 'Team', count: 26 }]}
        active="chart"
        onTabChange={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Team 26' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Hierarchy' })).toBeDefined()
  })

  it('control variant sets the labels in mono caps on their own hover surface', () => {
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} variant="control" />)
    const active = screen.getByRole('button', { name: 'Treasury' })
    const idle = screen.getByRole('button', { name: 'Overdue' })
    expect(active.className).toContain('uppercase')
    expect(active.className).toContain('text-accent')
    expect(idle.className).toContain('hover:bg-surface-2/70')
    expect(active.closest('nav')?.getAttribute('data-variant')).toBe('control')
  })

  it('defaults to the text variant', () => {
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Treasury' }).className).not.toContain('uppercase')
  })

  it('renders the indicator bar element', () => {
    const { container } = render(
      <SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />
    )
    const bar = container.querySelector('.tab-indicator')
    expect(bar).toBeDefined()
    expect(bar).not.toBeNull()
  })
})
