import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverdueBadge } from './OverdueBadge'

beforeEach(() => {
  globalThis.sessionStorage?.clear?.()
})

describe('OverdueBadge', () => {
  it('renders the label text', () => {
    render(<OverdueBadge id="loan-1" label="overdue 15d" />)
    expect(screen.getByText('overdue 15d')).toBeDefined()
  })

  it('applies pulse-once class for unseen IDs', () => {
    const { container } = render(<OverdueBadge id="loan-1" label="overdue 15d" />)
    const badge = container.querySelector('[data-overdue-id]')
    expect(badge?.classList.contains('pulse-once')).toBe(true)
  })
})
