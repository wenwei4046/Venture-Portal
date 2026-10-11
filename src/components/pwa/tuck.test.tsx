import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { useTuckOnScroll } from './tuck'

// The phone's bottom bar steps out of the way while reading on (2026-10-11 — the user: "滑上去的时候，它是会收下来的
// … 等这个爬升来的时候，它才可以又再跑起来"): a scroll down tucks it away, a scroll back up brings it back.

const BAR = 70

function Harness({ enabled = true, page = 'today' }: { enabled?: boolean; page?: string }) {
  const bar = useRef<HTMLElement>(null)
  const tucked = useTuckOnScroll(bar, enabled, page)
  return (
    <>
      <div data-testid="page" />
      <div role="dialog">
        <div data-testid="in-sheet" />
      </div>
      <div aria-hidden="true">
        <div data-testid="closed-page" />
      </div>
      <div inert>
        <div data-testid="inert-page" />
      </div>
      <nav ref={bar} data-testid="bar" data-tucked={tucked ? '' : undefined} />
    </>
  )
}

/** A scroller with a height, a content height and a position the browser would keep inside them. */
function scroller(el: HTMLElement, opts: { height?: number; content?: number } = {}) {
  let height = opts.height ?? 600
  const content = opts.content ?? 2000
  let pos = 0
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content })
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => pos, set: (v: number) => { pos = v } })
  return {
    to(y: number) {
      pos = y
      act(() => { el.dispatchEvent(new Event('scroll')) })
    },
    /** The frame grew by `by` (the bar's height given back): a page at its foot is pulled back. */
    grow(by: number) {
      height += by
      pos = Math.min(pos, content - height)
      act(() => { el.dispatchEvent(new Event('scroll')) })
    },
  }
}

const tucked = () => screen.getByTestId('bar').hasAttribute('data-tucked')

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(BAR)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the bar steps out of the way while reading on', () => {
  it('a scroll down tucks it away, a scroll back up brings it back', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(0)
    page.to(100)
    expect(tucked()).toBe(true)
    page.to(90)
    expect(tucked()).toBe(true)
    page.to(60)
    expect(tucked()).toBe(false)
  })

  it('near the top of a page it always shows', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(0)
    page.to(60)
    expect(tucked()).toBe(true)
    page.to(45)
    expect(tucked()).toBe(false)
  })

  it('a jitter under 24px one way moves nothing', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(500)
    page.to(520)
    page.to(510)
    page.to(530)
    expect(tucked()).toBe(false)
    page.to(560)
    expect(tucked()).toBe(true)
  })

  it('the page growing into the bar’s space at its foot is not someone scrolling up', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(1300)
    page.to(1400)
    expect(tucked()).toBe(true)
    page.grow(BAR)
    expect(tucked()).toBe(true)
    page.to(1300)
    expect(tucked()).toBe(false)
  })

  it('iOS’s bounce past the foot is standing at the foot', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(1300)
    page.to(1400)
    page.to(1460)
    page.to(1400)
    expect(tucked()).toBe(true)
  })

  it('a page too short to scroll back up once the bar gives its height back never tucks it', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'), { content: 700 })
    page.to(0)
    page.to(100)
    expect(tucked()).toBe(false)
  })

  it('a scroll inside a sheet, or sideways, moves nothing', () => {
    render(<Harness />)
    const sheet = scroller(screen.getByTestId('in-sheet'))
    sheet.to(0)
    sheet.to(500)
    expect(tucked()).toBe(false)
    const row = screen.getByTestId('page')
    scroller(row)
    act(() => { row.dispatchEvent(new Event('scroll')) })
    act(() => { row.dispatchEvent(new Event('scroll')) })
    expect(tucked()).toBe(false)
  })

  it('a scroller nobody can see moves nothing — the Revenue app keeps its closed pages mounted', () => {
    render(<Harness />)
    for (const id of ['closed-page', 'inert-page']) {
      const hidden = scroller(screen.getByTestId(id))
      hidden.to(0)
      hidden.to(500)
      expect(tucked()).toBe(false)
    }
  })

  it('the window counts too', () => {
    render(<Harness />)
    let y = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y)
    const root = document.scrollingElement ?? document.documentElement
    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 3000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 800 })
    const at = (to: number) => { y = to; act(() => { document.dispatchEvent(new Event('scroll')) }) }
    at(0)
    at(300)
    expect(tucked()).toBe(true)
    at(250)
    expect(tucked()).toBe(false)
  })

  it('another page shows it again', () => {
    const { rerender } = render(<Harness page="today" />)
    const page = scroller(screen.getByTestId('page'))
    page.to(0)
    page.to(400)
    expect(tucked()).toBe(true)
    rerender(<Harness page="insight" />)
    expect(tucked()).toBe(false)
  })

  // The user: "点进去的时候理应能看到下面的 bar，只有滑下去的时候才看不到".
  it('another page starts the count afresh — a run from the page before does not tuck it at the first pixel', () => {
    const { rerender } = render(<Harness page="hiring" />)
    const page = scroller(screen.getByTestId('page'))
    page.to(100)
    page.to(120)
    expect(tucked()).toBe(false)
    rerender(<Harness page="hiring/hire:HR-205" />)
    page.to(125)
    page.to(135)
    expect(tucked()).toBe(false)
  })

  it('coming back to the app (home screen, another app, the lock screen) shows it', () => {
    render(<Harness />)
    const page = scroller(screen.getByTestId('page'))
    page.to(0)
    page.to(400)
    expect(tucked()).toBe(true)
    let state: DocumentVisibilityState = 'hidden'
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(tucked()).toBe(true)
    state = 'visible'
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(tucked()).toBe(false)
    visibility.mockRestore()
  })

  it('switched off (the More sheet open), it stays', () => {
    render(<Harness enabled={false} />)
    const page = scroller(screen.getByTestId('page'))
    page.to(0)
    page.to(500)
    expect(tucked()).toBe(false)
  })

  it('tells the stylesheet its height', () => {
    render(<Harness />)
    expect(screen.getByTestId('bar').style.getPropertyValue('--bar-h')).toBe(`${BAR}px`)
  })
})
