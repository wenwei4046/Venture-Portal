'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'

/**
 * The design system's one button (the Claude Design project "HOUZS Venture
 * Design System", `components/core-actions/Button.jsx`), value for value — the
 * Attendance handoff (2026-10-15) mounts it everywhere. HR: 34px (28 small,
 * 40 large) · radius 6 · 13px (12 small) · medium; primary = accent fill,
 * secondary = outlined, link = bare text that underlines on hover.
 */

export const EASE = 'cubic-bezier(.2, .8, .2, 1)'

const H = { sm: 'var(--ds-control-h-sm)', md: 'var(--ds-control-h)', lg: 'var(--ds-control-h-lg)' } as const

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger' | 'danger-solid' | 'link'

export function usePress() {
  const [s, set] = useState({ h: false, d: false })
  return [s, {
    onMouseEnter: () => set(x => ({ ...x, h: true })),
    onMouseLeave: () => set({ h: false, d: false }),
    onPointerDown: () => set(x => ({ ...x, d: true })),
    onPointerUp: () => set(x => ({ ...x, d: false })),
  }] as const
}

/** The chevron the DS's Icon draws for `chevRight` (the Revenue set): 24-unit, stroke 2. */
function ChevRight() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  style,
  title,
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: HrIconName
  iconRight?: 'chevRight'
  block?: boolean
  disabled?: boolean
  children?: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  style?: CSSProperties
  title?: string
}) {
  const [s, ev] = usePress()
  const off = disabled
  const V: Record<ButtonVariant, CSSProperties> = {
    primary: { background: s.h && !off ? 'var(--ds-accent-hover)' : 'var(--ds-accent)', color: 'var(--ds-on-accent)', border: '1px solid transparent', boxShadow: 'var(--ds-shadow-button)' },
    secondary: { background: s.h && !off ? 'var(--ds-hover)' : 'var(--ds-surface)', color: 'var(--ds-ink)', border: `1px solid ${s.h && !off ? 'var(--ds-border-hover)' : 'var(--ds-border)'}` },
    ghost: { background: s.h && !off ? 'var(--ds-hover)' : 'transparent', color: 'var(--ds-ink)', border: '1px solid transparent' },
    dark: { background: 'var(--ds-dark)', color: 'var(--ds-on-dark)', border: '1px solid transparent' },
    danger: { background: s.h && !off ? 'var(--ds-danger-bg)' : 'var(--ds-surface)', color: 'var(--ds-danger)', border: '1px solid var(--ds-danger-border)' },
    'danger-solid': { background: 'var(--ds-danger)', color: '#fff', border: '1px solid transparent' },
    link: { background: 'transparent', color: 'var(--ds-link)', border: 0, padding: 0, height: 'auto', textDecoration: s.h ? 'underline' : 'none', textUnderlineOffset: 3 },
  }
  return (
    <button
      type={type}
      title={title}
      onClick={off ? undefined : onClick}
      disabled={off}
      {...ev}
      style={{
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        boxSizing: 'border-box',
        height: H[size],
        padding: size === 'sm' ? '0 12px' : '0 var(--ds-control-px)',
        borderRadius: 'var(--ds-r-control)',
        fontFamily: 'var(--ds-font-body)',
        fontSize: size === 'sm' ? 'var(--ds-small-size)' : 'var(--ds-control-fs)',
        fontWeight: 'var(--ds-weight-medium)' as CSSProperties['fontWeight'],
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transform: 'none',
        transition: `background-color .12s, border-color .12s, transform 120ms ${EASE}`,
        ...V[variant],
        ...style,
      }}
    >
      {icon ? <HrIcon name={icon} size={16} stroke={2} /> : null}
      {children}
      {iconRight ? <ChevRight /> : null}
    </button>
  )
}
