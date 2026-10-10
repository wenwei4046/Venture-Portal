'use client'

import { useCallback, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import s from './hrv.module.css'

// The HR revamp's tab rail (2026-10-10): 8px-topped tabs on a divider, the
// open one peach with a 2px orange underline (an inset shadow, so the label
// never moves) and 600; counts in a small boxed badge. Sizes: `default`
// 11×14 (Sales Groups), `compact` 10×13 (People, Hierarchy, Member
// services), `small` 9×13 (the person window). `quiet` drops the hover wash
// where the prototype has none.

export interface HvTab {
  key: string
  label: ReactNode
  count?: string | number | null
}

export function Tabs({
  items,
  active,
  onSelect,
  size = 'default',
  quiet = false,
  style,
  label,
}: {
  items: HvTab[]
  active: string
  onSelect: (key: string) => void
  size?: 'default' | 'compact' | 'small'
  quiet?: boolean
  style?: CSSProperties
  label: string
}) {
  const sizeClass = size === 'compact' ? ` ${s.tabCompact}` : size === 'small' ? ` ${s.tabSmall}` : ''
  return (
    <div className={s.tabs} style={style} role="tablist" aria-label={label}>
      {items.map(t => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={`${s.tab}${sizeClass}${quiet ? ` ${s.tabQuiet}` : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && t.count !== '' ? <span className={s.tabCount}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

/**
 * A tab kept in the URL (`?tab=`), pushed with the browser's own history so
 * Back steps between tabs and Next syncs `useSearchParams` without a round
 * trip — the way the portal's rails already work.
 */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T, param = 'tab'): [T, (next: T) => void] {
  const searchParams = useSearchParams()
  const raw = searchParams.get(param)
  const tab = (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback
  const go = useCallback(
    (next: T) => {
      const params = new URLSearchParams(window.location.search)
      if (next === fallback) params.delete(param)
      else params.set(param, next)
      const qs = params.toString()
      window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
    },
    [fallback, param],
  )
  return [tab, go]
}
