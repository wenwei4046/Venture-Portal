import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ path: '/dashboard', search: '', refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}))

import RouteFreshener, { FRESHEN_DELAY_MS } from './RouteFreshener'
import { FRESH_ENOUGH_MS } from '@/lib/route-freshen'
import { navigationStarted, skeletonHidden, skeletonShown } from '@/lib/nav-progress'

beforeEach(() => {
  vi.useFakeTimers()
  nav.path = '/dashboard'
  nav.search = ''
  nav.refresh.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** A click to `path` that the router answers from memory (no skeleton, no fetch). */
function arriveFromMemory(rerender: (ui: React.ReactElement) => void, path: string, search = '') {
  // Time moves on between clicks (the fake clock starts at 0 in every test; nav-progress keeps its times).
  act(() => { vi.advanceTimersByTime(1) })
  navigationStarted()
  nav.path = path
  nav.search = search
  rerender(<RouteFreshener />)
}

describe('a page answered from memory is read again behind itself (2026-10-08)', () => {
  it('the hard load is left alone; a page shown from memory is refreshed once, a moment after it lands', () => {
    const { rerender } = render(<RouteFreshener />)
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS * 2) })
    expect(nav.refresh).not.toHaveBeenCalled()

    arriveFromMemory(rerender, '/payments')
    expect(nav.refresh).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  it('a page that streamed in behind a skeleton is already fresh', () => {
    const { rerender } = render(<RouteFreshener />)
    navigationStarted()
    skeletonShown()
    skeletonHidden()
    nav.path = '/reports/ledger'
    rerender(<RouteFreshener />)
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS * 2) })
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('moving on before the check cancels it; a tab (?tab=) from memory counts as a page', () => {
    const { rerender } = render(<RouteFreshener />)
    arriveFromMemory(rerender, '/payments')
    arriveFromMemory(rerender, '/receipts')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
    // Read a moment ago: shown as it is (a refresh would throw away the router's whole memory).
    arriveFromMemory(rerender, '/receipts', 'tab=pending')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
    // A minute on, the same page from memory is read again.
    act(() => { vi.advanceTimersByTime(FRESH_ENOUGH_MS) })
    arriveFromMemory(rerender, '/receipts', 'tab=paid')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    expect(nav.refresh).toHaveBeenCalledTimes(2)
  })

  it('a page the server rendered is on record: back to it from memory within the minute is not refreshed', () => {
    const { rerender } = render(<RouteFreshener />)
    act(() => { vi.advanceTimersByTime(1) })
    navigationStarted()
    skeletonShown()
    skeletonHidden()
    nav.path = '/statements'
    rerender(<RouteFreshener />)
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    arriveFromMemory(rerender, '/dashboard')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    const afterDashboard = nav.refresh.mock.calls.length
    arriveFromMemory(rerender, '/statements')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS) })
    expect(nav.refresh.mock.calls.length).toBe(afterDashboard)
  })

  it('never a page that writes the audit log while it renders', () => {
    const { rerender } = render(<RouteFreshener />)
    arriveFromMemory(rerender, '/team/people')
    act(() => { vi.advanceTimersByTime(FRESHEN_DELAY_MS * 2) })
    expect(nav.refresh).not.toHaveBeenCalled()
  })
})
