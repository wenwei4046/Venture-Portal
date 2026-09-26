import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PageScrolledTable from './PageScrolledTable'

// happy-dom lays nothing out: the widths are set by hand and the observer is
// fired by hand.
let resized: () => void = () => {}
class FakeResizeObserver {
  constructor(callback: () => void) { resized = callback }
  observe() {}
  disconnect() {}
}

function widths(box: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(box, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: clientWidth })
  act(() => resized())
}

function renderTable() {
  render(<PageScrolledTable label="Options table"><table><tbody><tr><td>24&quot;</td></tr></tbody></table></PageScrolledTable>)
  return screen.getByRole('region', { name: 'Options table' })
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PageScrolledTable', () => {
  it('leaves a table that fits to the page, and scrolls sideways only while it is wider than its card', () => {
    const box = renderTable()
    expect(box).not.toHaveAttribute('data-sideways')
    expect(box).not.toHaveAttribute('tabindex')

    widths(box, 900, 600)
    expect(box).toHaveAttribute('data-sideways', 'true')
    // A box that scrolls must be reachable from the keyboard.
    expect(box).toHaveAttribute('tabindex', '0')

    widths(box, 600, 600)
    expect(box).not.toHaveAttribute('data-sideways')
    expect(box).not.toHaveAttribute('tabindex')
  })

  it('does not turn a pixel of rounding into a scroll box', () => {
    const box = renderTable()
    widths(box, 601, 600)
    expect(box).not.toHaveAttribute('data-sideways')
  })
})
