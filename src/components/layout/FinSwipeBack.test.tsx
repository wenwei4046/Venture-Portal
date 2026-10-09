import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import FinSwipeBack from './FinSwipeBack'

// 2026-10-09 — on a phone, a Finance detail page goes back on an edge swipe
// (the user's Claude Design handoff): a touch that starts within 28px of the
// left edge and travels more than 80px to the right. Anything else — a
// touch that starts further in, a short drag, a vertical scroll — is left
// alone.

const back = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ back }) }))

function Page() {
  const main = useRef<HTMLElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  return (
    <main ref={main} style={{ width: 390 }}>
      <div ref={sheet}>page</div>
      <FinSwipeBack main={main} sheet={sheet} />
    </main>
  )
}

const touch = (type: string, el: Element, x: number, y: number) =>
  fireEvent(el, new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y } as Touch], changedTouches: [{ clientX: x, clientY: y } as Touch] }))

beforeEach(() => {
  back.mockClear()
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 390, top: 0, height: 800 } as DOMRect)
})

describe('FinSwipeBack', () => {
  it('goes back after a long swipe from the left edge', () => {
    const { container } = render(<Page />)
    const main = container.querySelector('main') as HTMLElement
    touch('touchstart', main, 10, 300)
    touch('touchmove', main, 60, 302)
    touch('touchmove', main, 120, 305)
    touch('touchend', main, 120, 305)
    act(() => vi.advanceTimersByTime(200))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('ignores a swipe that starts away from the edge, a short one, or a vertical one', () => {
    const { container } = render(<Page />)
    const main = container.querySelector('main') as HTMLElement
    touch('touchstart', main, 120, 300)
    touch('touchmove', main, 300, 300)
    touch('touchend', main, 300, 300)
    touch('touchstart', main, 10, 300)
    touch('touchmove', main, 50, 300)
    touch('touchend', main, 50, 300)
    touch('touchstart', main, 10, 300)
    touch('touchmove', main, 12, 340)
    touch('touchmove', main, 150, 420)
    touch('touchend', main, 150, 420)
    act(() => vi.advanceTimersByTime(200))
    expect(back).not.toHaveBeenCalled()
  })
})
