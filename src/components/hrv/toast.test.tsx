import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ToastHost, flash, resetToast } from './toast'

// The revamp's toast (2026-10-10): one line, replaced by the next, gone after 2.2 s.

afterEach(() => {
  act(() => resetToast())
  vi.useRealTimers()
})

describe('flash', () => {
  it('shows the line, replaces it with the next, and hides it after 2.2 s', () => {
    vi.useFakeTimers()
    render(<ToastHost />)
    act(() => flash('Saved 2 changes'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved 2 changes')
    act(() => {
      vi.advanceTimersByTime(1500)
      flash('Switched to IR')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Switched to IR')
    act(() => vi.advanceTimersByTime(2100))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
