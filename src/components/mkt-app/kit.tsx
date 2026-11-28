'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackStep } from '@/components/member/app/useBackStep'
import type { Tone } from '@/lib/mkt-app/model'
import s from './mkt-app.module.css'

// The Marketing app's small pieces (2026-11-28): the status pill, the segmented control, the phone's Back, the toast.

/** A status pill: its tone's ground, edge and words, the dot. */
export function Pill({ tone, text, size }: { tone: Tone; text: string; size?: 'sm' | 'task' }) {
  return (
    <span className={`${s.pill}${size === 'sm' ? ` ${s.pillSm}` : size === 'task' ? ` ${s.pillTask}` : ''}`} data-tone={tone}>
      <span className={s.pillDot} />
      <span className={s.ellipsis}>{text}</span>
    </span>
  )
}

export interface SegItem<K extends string> {
  key: K
  label: ReactNode
  count?: number
  hot?: boolean
  dot?: boolean
}

/** The segmented control: a white pill on the picked one. */
export function Seg<K extends string>({ items, value, onPick, look = 'tasks', label }: {
  items: readonly SegItem<K>[]
  value: K
  onPick: (k: K) => void
  look?: 'tasks' | 'soft' | 'chat'
  label: string
}) {
  return (
    <div className={`${s.seg}${look === 'soft' ? ` ${s.segSoft}` : look === 'chat' ? ` ${s.segChat}` : ''}`} role="tablist" aria-label={label}>
      {items.map(g => (
        <button key={g.key} type="button" role="tab" aria-selected={g.key === value} className={`${s.segBtn}${look === 'soft' ? ` ${s.segBtn36}` : ''}`}
          data-on={g.key === value ? 'true' : 'false'} onClick={() => onPick(g.key)}>
          {g.label}
          {g.count != null ? <span className={s.segCount} data-hot={g.hot ? 'true' : 'false'}>{g.count}</span> : null}
          {g.dot ? <span className={s.segDot} aria-label="unread" /> : null}
        </button>
      ))}
    </div>
  )
}

/**
 * One history step for something open over the app (a pushed screen, a sheet, a visit): the phone's Back closes it and
 * nothing under it (the Revenue app's useBackStep — Android's ◁ in the handoff).
 */
export function BackStep({ k, onBack }: { k: string; onBack: () => boolean | void }) {
  useBackStep(k, onBack)
  return null
}

/** The toast: a dark pill over the bars for 2.4 s. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; on: boolean }>({ text: '', on: false })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const say = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ text, on: true })
    timer.current = setTimeout(() => setToast(t => ({ ...t, on: false })), 2400)
  }, [])
  return { toast, say }
}

/** An avatar: the picture uploaded on My Space, else the initial on the title's tone. */
export function Avatar({ className, bg, letter, img }: { className: string; bg: string; letter: string; img?: string | null }) {
  return (
    <span className={className} style={{ background: bg }}>
      {img ? <img src={img} alt="" /> : letter}
    </span>
  )
}
