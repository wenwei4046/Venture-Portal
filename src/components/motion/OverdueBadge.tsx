'use client'

import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'vp-overdue-seen'

function getSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markSeen(id: string) {
  try {
    const seen = getSeenIds()
    seen.add(id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // sessionStorage unavailable (SSR, incognito) — safe to ignore
  }
}

interface OverdueBadgeProps {
  id: string
  label: string
  className?: string
}

export function OverdueBadge({ id, label, className = '' }: OverdueBadgeProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const seen = getSeenIds()
    if (!seen.has(id) && ref.current) {
      ref.current.classList.add('pulse-once')
    }
    markSeen(id)
  }, [id])

  return (
    <span
      ref={ref}
      data-overdue-id={id}
      className={`font-serif italic ${className}`}
    >
      {label}
    </span>
  )
}
