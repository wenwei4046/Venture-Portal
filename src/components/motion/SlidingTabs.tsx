'use client'

import { useRef, useLayoutEffect, useState, useCallback } from 'react'

export interface TabItem {
  key: string
  label: string
}

interface SlidingTabsProps {
  items: TabItem[]
  active: string
  onTabChange: (key: string) => void
}

export function SlidingTabs({ items, active, onTabChange }: SlidingTabsProps) {
  const navRef = useRef<HTMLElement>(null)
  const [barStyle, setBarStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  const measureBar = useCallback(() => {
    if (!navRef.current) return
    const activeEl = navRef.current.querySelector<HTMLElement>(`[data-tab-key="${active}"]`)
    if (activeEl) {
      setBarStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth })
    }
  }, [active])

  useLayoutEffect(() => {
    measureBar()
  }, [measureBar])

  return (
    <nav
      ref={navRef}
      className="border-b border-hairline mb-8 flex items-end gap-6 overflow-x-auto relative"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tab-key={item.key}
          onClick={() => onTabChange(item.key)}
          className={
            item.key === active
              ? 'font-serif italic text-accent text-base pb-3 -mb-px'
              : 'font-serif text-graphite text-base pb-3 hover:text-ink transition-colors'
          }
        >
          {item.label}
        </button>
      ))}
      <div
        className="tab-indicator absolute bottom-0 h-0.5 bg-accent"
        style={{ left: barStyle.left, width: barStyle.width }}
      />
    </nav>
  )
}
