'use client'

import { useEffect, useState } from 'react'

// Floating "back to top" button. Targets the portal's inner scroll container
// (the <main> in PortalFrame) — window scroll is locked because the layout
// uses overflow-hidden on the outer shell.
export default function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main')
    if (!main) return

    const onScroll = () => setShow(main.scrollTop > 400)
    main.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  const scrollToTop = () => {
    document.querySelector<HTMLElement>('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full bg-surface border border-hairline shadow-md text-graphite hover:text-ink hover:bg-surface-2 hover:border-accent-border transition-all print:hidden flex items-center justify-center"
    >
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M10 16V4M4 10l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
