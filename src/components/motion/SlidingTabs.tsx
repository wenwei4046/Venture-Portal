'use client'

import { useRef, useLayoutEffect, useState, useCallback } from 'react'

export interface TabItem {
  key: string
  label: string
  /** A small mono count after the label — "Team 26". */
  count?: number | string
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
      // overflow-y-hidden: the active tab's -mb-px overhangs the box by one
      // pixel, and `overflow-x: auto` alone lets Windows draw a vertical
      // scrollbar for it.
      className="border-b border-hairline mb-8 flex items-end gap-6 overflow-x-auto overflow-y-hidden relative"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tab-key={item.key}
          onClick={() => onTabChange(item.key)}
          className={
            item.key === active
              ? 'font-serif italic text-accent text-base pb-3 -mb-px whitespace-nowrap'
              : 'font-serif text-graphite text-base pb-3 hover:text-ink transition-colors whitespace-nowrap'
          }
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="font-mono not-italic text-[10px] text-muted ml-1.5">{item.count}</span>
          ) : null}
        </button>
      ))}
      <div
        className="tab-indicator absolute bottom-0 h-0.5 bg-accent"
        style={{ left: barStyle.left, width: barStyle.width }}
      />
    </nav>
  )
}
