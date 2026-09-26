import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageFirstTarget, usePageFirstWheel, wheelPixels } from './page-first-wheel'

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  usePageFirstWheel(ref)
  return <main><div ref={ref} data-testid="table">rows</div></main>
}

/** A <main> 800px tall holding 1100px of page, scrolled to `top`. */
function page(main: HTMLElement, top: number) {
  Object.defineProperty(main, 'scrollHeight', { configurable: true, value: 1100 })
  Object.defineProperty(main, 'clientHeight', { configurable: true, value: 800 })
  main.scrollTop = top
  const scrollTo = vi.fn()
  main.scrollTo = scrollTo as unknown as typeof main.scrollTo
  return scrollTo
}

function wheel(target: HTMLElement, init: WheelEventInit) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  // The test DOM's WheelEvent drops the modifier keys of its init.
  for (const key of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
    if (init[key] !== undefined && event[key] !== init[key]) Object.defineProperty(event, key, { value: init[key] })
  }
  target.dispatchEvent(event)
  return event
}

afterEach(cleanup)

describe('page-first wheel', () => {
  it('sends a downward wheel to the page until the stage fills the screen', () => {
    expect(pageFirstTarget(0, 300, 100)).toBe(100)
    expect(pageFirstTarget(250, 300, 100)).toBe(300)
    expect(pageFirstTarget(299.5, 300, 100)).toBeNull()
    expect(pageFirstTarget(300, 300, 100)).toBeNull()
    expect(pageFirstTarget(0, 0, 100)).toBeNull()
  })

  it('leaves an upward wheel to the table, as the browser would', () => {
    expect(pageFirstTarget(120, 300, -100)).toBeNull()
    expect(pageFirstTarget(120, 300, 0)).toBeNull()
  })

  it('reads lines and pages as pixels', () => {
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 }, 800)).toBe(100)
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 }, 800)).toBe(60)
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 }, 800)).toBe(800)
  })

  it('scrolls the page instead of the table, adding notches from where the page is going', () => {
    const { container, getByTestId } = render(<Harness />)
    const scrollTo = page(container.querySelector('main')!, 0)
    const table = getByTestId('table')
    expect(wheel(table, { deltaY: 100 }).defaultPrevented).toBe(true)
    expect(wheel(table, { deltaY: 100 }).defaultPrevented).toBe(true)
    expect(scrollTo.mock.calls.map(([options]) => options.top)).toEqual([100, 200])
  })

  it('lets the table scroll once the page is at its end, and never takes sideways, zoom or upward wheels', () => {
    const { container, getByTestId } = render(<Harness />)
    const main = container.querySelector('main')!
    const scrollTo = page(main, 300)
    const table = getByTestId('table')
    expect(wheel(table, { deltaY: 100 }).defaultPrevented).toBe(false)
    main.scrollTop = 0
    expect(wheel(table, { deltaY: -100 }).defaultPrevented).toBe(false)
    expect(wheel(table, { deltaY: 100, shiftKey: true }).defaultPrevented).toBe(false)
    expect(wheel(table, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(wheel(table, { deltaX: 120, deltaY: 10 }).defaultPrevented).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
