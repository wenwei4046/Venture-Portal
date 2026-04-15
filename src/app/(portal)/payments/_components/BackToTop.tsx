'use client'

import { useEffect, useRef, useState } from 'react'

// Portal layout scrolls <main>, not window. Find the nearest scrollable
// ancestor at mount time and bind to its scroll event.
function findScrollContainer(start: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = start
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return window
}

export default function BackToTop() {
  const [visible, setVisible] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLElement | Window | null>(null)

  useEffect(() => {
    const container = findScrollContainer(anchorRef.current)
    containerRef.current = container
    const getScrollTop = () =>
      container === window ? window.scrollY : (container as HTMLElement).scrollTop
    const onScroll = () => setVisible(getScrollTop() > 200)
    onScroll()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  function scrollToTop() {
    const c = containerRef.current
    if (!c) return
    if (c === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      ;(c as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <>
      <div ref={anchorRef} aria-hidden="true" />
      {visible ? (
        <button
          type="button"
          onClick={scrollToTop}
          title="Back to top"
          aria-label="Back to top"
          className="fixed bottom-8 right-8 z-40 w-11 h-11 rounded-full bg-accent hover:bg-accent-hover text-white font-mono text-lg shadow-lg transition-colors"
        >
          ↑
        </button>
      ) : null}
    </>
  )
}
