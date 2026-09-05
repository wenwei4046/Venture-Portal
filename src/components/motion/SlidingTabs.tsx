'use client'

import { useRef, useLayoutEffect, useState, useCallback } from 'react'

export interface TabItem {
  key: string
  label: string
  /** A small mono count after the label — "Team 26". */
  count?: number | string
}

/**
 * `text`     the original rail: sentence-case labels in the body face, for a
 *            rail that sits below a bordered page header (Settings, Fund In,
 *            Fund Out, Payments).
 * `control`  for a rail ON the header's own rule (`.page-head.tabbed`). With
 *            no rule between the intro and the tabs, body-face labels read as
 *            one more line of the intro (user 2026-09-05: "它好像不是一个选项
 *            … 让它看起来其实是不同的选项"). So the labels drop to the portal's
 *            control voice — small mono caps, the same as a table head or a
 *            chip — each on its own hover surface, and the header keeps 18px
 *            clear above them.
 */
export type SlidingTabsVariant = 'text' | 'control'

interface SlidingTabsProps {
  items: TabItem[]
  active: string
  onTabChange: (key: string) => void
  variant?: SlidingTabsVariant
}

// overflow-y-hidden: the active tab's -mb-px overhangs the box by one pixel,
// and `overflow-x: auto` alone lets Windows draw a vertical scrollbar for it.
const NAV: Record<SlidingTabsVariant, string> = {
  text: 'border-b border-hairline mb-8 flex items-end gap-6 overflow-x-auto overflow-y-hidden relative',
  control: 'border-b border-hairline mb-8 flex items-end gap-1 overflow-x-auto overflow-y-hidden relative',
}

// Control tabs wear padding for their hover surface; the first one pulls left
// by that padding (first:-ml-3) so its label lines up with the header text
// while the rail's rule still starts where the text does.
const TAB: Record<SlidingTabsVariant, { active: string; idle: string }> = {
  text: {
    active: 'font-serif italic text-accent text-base pb-3 -mb-px whitespace-nowrap',
    idle: 'font-serif text-graphite text-base pb-3 hover:text-ink transition-colors whitespace-nowrap',
  },
  control: {
    active:
      'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-accent px-3 pt-2 pb-2.5 -mb-px first:-ml-3 rounded-t-control whitespace-nowrap',
    idle: 'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite px-3 pt-2 pb-2.5 first:-ml-3 rounded-t-control hover:text-ink hover:bg-surface-2/70 transition-colors whitespace-nowrap',
  },
}

const COUNT: Record<SlidingTabsVariant, string> = {
  text: 'font-mono not-italic text-[10px] text-muted ml-1.5',
  control: 'text-[10px] text-muted ml-1.5 tracking-normal',
}

export function SlidingTabs({ items, active, onTabChange, variant = 'text' }: SlidingTabsProps) {
  const navRef = useRef<HTMLElement>(null)
  const [barStyle, setBarStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  // The bar underlines the LABEL, not the padded button, so it never pokes
  // past the rule on the first control tab. Measured against the nav's own
  // box (plus whatever it has scrolled) rather than through offsetParent,
  // which browsers disagree about for children of a <button>.
  const measureBar = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const label = nav.querySelector<HTMLElement>(`[data-tab-key="${active}"] [data-tab-label]`)
    if (label) {
      const navRect = nav.getBoundingClientRect()
      const rect = label.getBoundingClientRect()
      setBarStyle({ left: rect.left - navRect.left + nav.scrollLeft, width: rect.width })
    }
  }, [active])

  useLayoutEffect(() => {
    measureBar()
  }, [measureBar])

  return (
    <nav ref={navRef} className={NAV[variant]} data-variant={variant}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tab-key={item.key}
          onClick={() => onTabChange(item.key)}
          className={item.key === active ? TAB[variant].active : TAB[variant].idle}
        >
          <span data-tab-label>
            {item.label}
            {item.count !== undefined ? <span className={COUNT[variant]}>{item.count}</span> : null}
          </span>
        </button>
      ))}
      <div
        className="tab-indicator absolute bottom-0 h-0.5 bg-accent"
        style={{ left: barStyle.left, width: barStyle.width }}
      />
    </nav>
  )
}
