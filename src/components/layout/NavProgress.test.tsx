import { act, render } from '@testing-library/react'
import { startTransition } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigationStarted, skeletonHidden, skeletonShown } from '@/lib/nav-progress'
import NavProgress from './NavProgress'

function line(container: HTMLElement) {
  return container.querySelector('.nav-progress') as HTMLElement
}

describe('NavProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs while a route skeleton is on screen, then finishes and clears', () => {
    const { container } = render(<NavProgress />)
    expect(line(container)).toHaveAttribute('data-state', 'idle')

    act(() => skeletonShown())
    act(() => {
      vi.advanceTimersByTime(119)
    })
    expect(line(container)).toHaveAttribute('data-state', 'idle')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(line(container)).toHaveAttribute('data-state', 'loading')

    act(() => skeletonHidden())
    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(line(container)).toHaveAttribute('data-state', 'done')
    act(() => {
      vi.advanceTimersByTime(480)
    })
    expect(line(container)).toHaveAttribute('data-state', 'idle')
  })

  it('never appears for a page that lands at once', () => {
    const { container } = render(<NavProgress />)
    act(() => skeletonShown())
    act(() => {
      vi.advanceTimersByTime(60)
    })
    act(() => skeletonHidden())
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(line(container)).toHaveAttribute('data-state', 'idle')
  })

  it('runs until the navigation it was started by has committed', async () => {
    const { container } = render(<NavProgress />)
    let commit!: () => void

    // Next calls onRouterTransitionStart inside its own navigation transition;
    // an async transition that stays pending stands in for the router waiting
    // on the server. The line must hold until it lands.
    act(() => {
      startTransition(async () => {
        navigationStarted()
        await new Promise<void>((resolve) => {
          commit = resolve
        })
      })
    })
    expect(document.documentElement).toHaveAttribute('data-nav-pending')
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(line(container)).toHaveAttribute('data-state', 'loading')

    await act(async () => {
      commit()
    })
    expect(document.documentElement).not.toHaveAttribute('data-nav-pending')
    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(line(container)).toHaveAttribute('data-state', 'done')
  })

  it('stands down from a navigation that never commits', async () => {
    const { container } = render(<NavProgress />)
    let release!: () => void
    act(() => {
      startTransition(async () => {
        navigationStarted()
        await new Promise<void>((resolve) => {
          release = resolve
        })
      })
    })
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(line(container)).toHaveAttribute('data-state', 'loading')

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(line(container)).toHaveAttribute('data-state', 'done')
    expect(document.documentElement).not.toHaveAttribute('data-nav-pending')
    act(() => {
      vi.advanceTimersByTime(480)
    })
    expect(line(container)).toHaveAttribute('data-state', 'idle')

    // An async transition that is still pending entangles every later one
    // (React 19); let it finish so it does not hold the next test's line.
    await act(async () => {
      release()
    })
  })

  it('a navigation start on its own never strands the line', () => {
    const { container } = render(<NavProgress />)
    act(() => navigationStarted())
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(line(container)).toHaveAttribute('data-state', 'idle')
    expect(document.documentElement).not.toHaveAttribute('data-nav-pending')
  })
})
