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

  it('renders the indicator bar element', () => {
    const { container } = render(
      <SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />
    )
    const bar = container.querySelector('.tab-indicator')
    expect(bar).toBeDefined()
    expect(bar).not.toBeNull()
  })
})
