'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { LeadIcon } from '@/components/layout/lead-icons'
import { useCurrentToast } from '@/components/hrv/toast'
import { toneOf, type Tone } from '@/lib/leads/status'
import u from './ui.module.css'

/* The handoff's small pieces (README §6.5–6.8, §6.11), one file: each is a few lines. */

/** Single-select chips: white and lined off, olive on. */
export function Chips<T extends string>({ value, options, onChange }: {
  value: T | null
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className={u.chips}>
      {options.map(o => (
        <button key={o.value} type="button" className={u.chip} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/** The 34 × 20 switch: green on, line-4 off. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={u.toggle} disabled={disabled} onClick={() => onChange(!on)} />
}

/** A destructive action's confirm, in place (rule 7): rust tint, Cancel and a solid rust Delete. */
export function InlineConfirm({ text, onCancel, onConfirm, confirmLabel = 'Delete' }: { text: ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return (
    <div className={u.confirm} role="alertdialog">
      <span className={u.confirmText}>{text}</span>
      <div className={u.confirmRow}>
        <button type="button" className={u.confirmCancel} onClick={onCancel}>Cancel</button>
        <button type="button" className={u.confirmDelete} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  )
}

/** A status: a 6px dot and its words in the status colour (README §4.1's map, `toneOf`). */
export function Status({ children, tone }: { children: string; tone?: Tone }) {
  return (
    <span className={u.status} data-tone={tone ?? toneOf(children)}>
      <span className={u.statusDot} aria-hidden="true" />{children}
    </span>
  )
}

/** The detail panel's status pill: 28px, line-3 border, dot + words; a click pauses / resumes. */
export function StatusPill({ children, tone, onClick, disabled, title }: { children: string; tone?: Tone; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={u.pill} data-tone={tone ?? toneOf(children)} onClick={onClick} disabled={disabled || !onClick} title={title}>
      <span className={u.statusDot} aria-hidden="true" />{children}
    </button>
  )
}

/** A sortable column's head: the active one ink / 600 with its arrow, the others a faint arrow-up-down. */
export function SortHead<K extends string>({ k, sort, onSort, children }: {
  k: K
  sort: { key: K; dir: 'asc' | 'desc' }
  onSort: (key: K) => void
  children: ReactNode
}) {
  const on = sort.key === k
  return (
    <button type="button" className={u.sortHead} data-on={on || undefined} onClick={() => onSort(k)}>
      {children}
      {on
        ? <LeadIcon name={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />
        : <LeadIcon name="arrow-up-down" size={12} className={u.sortIdle} />}
    </button>
  )
}

/** "Copy" that reads "Copied" for 1.5s (README §4.5). */
export function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  return [copied, () => setCopied(true)]
}

/** Lead View's toast (README §4.5): bottom-centre, ink, a check in olive. Shows whatever `flash()` says. */
export function LeadToast() {
  const toast = useCurrentToast()
  if (!toast) return null
  return (
    <div key={toast.id} className={u.toast} role="status" aria-live="polite">
      <LeadIcon name="check" size={14} className={u.toastCheck} />{toast.message}
    </div>
  )
}

/** Initials in a round avatar (olive, green letters). */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return <span className={u.avatar} style={{ width: size, height: size, fontSize: size >= 36 ? 13 : 12 }} aria-hidden="true">{initials(name)}</span>
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase()
}
