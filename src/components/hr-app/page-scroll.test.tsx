import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { pageKeyOf, usePageScroll } from './page-scroll'

// The HR app's pages share one scroller (2026-10-11 — the user: "点进另一个界面的时候，应该要 start from top …
// 每次点进去都从最上面开始"): a page entered opens at its top; Back returns to where its page was left.

function Harness({ page }: { page: string }) {
  const ref = useRef<HTMLDivElement>(null)
  usePageScroll(ref, page)
  return <div ref={ref} data-testid="scroller" />
}

function scroller() {
  const el = screen.getByTestId('scroller')
  let top = 0
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
  return {
    get top() { return top },
    to(y: number) {
      top = y
      act(() => { el.dispatchEvent(new Event('scroll')) })
    },
  }
}

describe('a page’s name', () => {
  it('is its tab, then each page pushed on it', () => {
    expect(pageKeyOf('hiring', [])).toBe('hiring')
    expect(pageKeyOf('hiring', [{ k: 'hire', id: 'HR-205' }])).toBe('hiring/hire:HR-205')
    expect(pageKeyOf('more', [{ k: 'talents' }, { k: 'talent', id: 'a/b' }])).toBe('more/talents/talent:a%2Fb')
  })
})

describe('the HR app’s pages', () => {
  it('a page entered opens at its top; Back returns to where its page was left', () => {
    const { rerender } = render(<Harness page="hiring" />)
    const s = scroller()
    s.to(500)
    rerender(<Harness page="hiring/hire:HR-205" />)
    expect(s.top).toBe(0)
    s.to(200)
    rerender(<Harness page="hiring" />)
    expect(s.top).toBe(500)
  })

  it('a tab pressed opens at its top, even one left halfway down before', () => {
    const { rerender } = render(<Harness page="hiring" />)
    const s = scroller()
    s.to(500)
    rerender(<Harness page="home" />)
    expect(s.top).toBe(0)
    rerender(<Harness page="hiring" />)
    expect(s.top).toBe(0)
  })

  it('a page entered afresh forgets where it was left the time before', () => {
    const { rerender } = render(<Harness page="hiring" />)
    const s = scroller()
    s.to(500)
    rerender(<Harness page="home" />)
    rerender(<Harness page="hiring" />)
    rerender(<Harness page="hiring/hire:HR-205" />)
    rerender(<Harness page="hiring" />)
    expect(s.top).toBe(0)
  })

  it('a tab pressed from deep in another tab opens at its top', () => {
    const { rerender } = render(<Harness page="home" />)
    const s = scroller()
    s.to(300)
    rerender(<Harness page="hiring" />)
    rerender(<Harness page="hiring/hire:HR-205" />)
    rerender(<Harness page="home" />)
    expect(s.top).toBe(0)
  })
})
