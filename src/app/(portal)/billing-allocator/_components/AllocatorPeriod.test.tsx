import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// 2026-10-10 — the handoff's month beside the allocator's title: "← September
// 2026 →", no PERIOD caption, no native month box.

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/billing-allocator' }))

import AllocatorPeriod from './AllocatorPeriod'

describe('the allocator’s month', () => {
  it('steps a month either way by ?period=', () => {
    render(<AllocatorPeriod period="2026-09" />)
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(document.querySelector('input[type="month"]')).toBeNull()
    expect(screen.queryByText('Period')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(push).toHaveBeenLastCalledWith('/billing-allocator?period=2026-08')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(push).toHaveBeenLastCalledWith('/billing-allocator?period=2026-10')
  })
})
