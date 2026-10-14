'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Select } from '@/components/hrv/select'

/**
 * The design system's form pieces (`components/core-forms/Field.jsx`), value
 * for value: Field (label · control · hint/error), TextField (prefix / suffix),
 * Textarea, and the soft Select drawn on the DS field. 34px, radius 10, a
 * hairline that warms on hover, the orange border + 3px ring on focus.
 */

export function Field({
  label,
  hint,
  error,
  optional = false,
  children,
  style,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  optional?: boolean
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      {label ? (
        <label
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 'var(--ds-label-size)',
            fontWeight: 'var(--ds-label-weight)' as CSSProperties['fontWeight'],
            letterSpacing: 'var(--ds-label-tracking)',
            textTransform: 'uppercase',
            color: 'var(--ds-ink-3)',
          }}
        >
          <span>{label}</span>
          {optional ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ds-ink-4)' }}>Optional</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: 'var(--ds-danger)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>{hint}</span>
      ) : null}
    </div>
  )
}

function useFieldFrame({ invalid, disabled }: { invalid?: boolean; disabled?: boolean }) {
  const [h, setH] = useState(false)
  const [f, setF] = useState(false)
  const frame: CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 'var(--ds-control-h)',
    borderRadius: 'var(--ds-r-field)',
    border: `1px solid ${invalid ? 'var(--ds-danger)' : f ? 'var(--ds-accent)' : h ? 'var(--ds-border-hover)' : 'var(--ds-border)'}`,
    boxShadow: f ? (invalid ? '0 0 0 3px rgb(176 40 34 / .14)' : 'var(--ds-focus-ring)') : 'none',
    background: disabled ? 'var(--ds-disabled)' : 'var(--ds-surface)',
    color: 'var(--ds-ink)',
    fontFamily: 'var(--ds-font-body)',
    fontSize: 'var(--ds-control-fs)',
    transition: 'border-color .15s, box-shadow .15s',
    outline: 'none',
    opacity: disabled ? 0.7 : 1,
  }
  return [frame, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false), onFocus: () => setF(true), onBlur: () => setF(false) }] as const
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
  prefix,
  suffix,
  invalid = false,
  disabled = false,
  step,
  min,
  style,
  ariaLabel,
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  type?: 'text' | 'number' | 'time' | 'search'
  prefix?: ReactNode
  suffix?: ReactNode
  invalid?: boolean
  disabled?: boolean
  step?: string
  min?: string
  style?: CSSProperties
  ariaLabel?: string
}) {
  const [frame, ev] = useFieldFrame({ invalid, disabled })
  return (
    <div onMouseEnter={ev.onMouseEnter} onMouseLeave={ev.onMouseLeave} style={{ ...frame, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', ...style }}>
      {prefix ? <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-small-size)', flex: 'none' }}>{prefix}</span> : null}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        step={step}
        min={min}
        aria-label={ariaLabel}
        data-ds-input=""
        onChange={e => onChange?.(e.target.value)}
        onFocus={ev.onFocus}
        onBlur={ev.onBlur}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 'none',
          background: 'transparent',
          font: 'inherit',
          color: 'inherit',
          padding: '8px 0',
          boxShadow: 'none',
          fontVariantNumeric: type === 'number' ? 'tabular-nums' : undefined,
        }}
      />
      {suffix ? <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-small-size)', flex: 'none' }}>{suffix}</span> : null}
    </div>
  )
}

export function Textarea({
  value = '',
  onChange,
  placeholder,
  rows = 4,
  invalid = false,
  disabled = false,
  style,
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  rows?: number
  invalid?: boolean
  disabled?: boolean
  style?: CSSProperties
}) {
  const [frame, ev] = useFieldFrame({ invalid, disabled })
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        data-ds-input=""
        onChange={e => onChange?.(e.target.value)}
        {...ev}
        style={{ ...frame, display: 'block', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5, ...style }}
      />
    </div>
  )
}

export type Option = { value: string; label: string; disabled?: boolean }

/** The soft dropdown on the DS field: 34px, radius 10, 12px in, room for the chevron. */
export function DsSelect({
  value,
  onChange,
  options,
  disabled = false,
  width,
  style,
  ariaLabel,
}: {
  value: string
  onChange?: (v: string) => void
  options: ReadonlyArray<Option | string>
  disabled?: boolean
  width?: number | string
  style?: CSSProperties
  ariaLabel?: string
}) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <Select
      bare
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => onChange?.(e.target.value)}
      style={{
        boxSizing: 'border-box',
        width: width ?? '100%',
        height: 'var(--ds-control-h)',
        padding: '0 36px 0 12px',
        border: '1px solid var(--ds-border)',
        background: disabled ? 'var(--ds-disabled)' : 'var(--ds-surface)',
        fontFamily: 'var(--ds-font-body)',
        fontSize: 'var(--ds-control-fs)',
        color: 'var(--ds-ink)',
        lineHeight: 'normal',
        ...style,
      }}
    >
      {opts.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}
