'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { EASE } from './Button'

/**
 * The design system's SegmentedControl (`core-actions/SegmentedControl.jsx`)
 * and Switch (`core-forms/Checkbox.jsx`), value for value. The thumb slides
 * between segments over 280ms on the house curve; the switch's knob over .15s.
 */

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  block = false,
  style,
}: {
  options: ReadonlyArray<string | { value: string; label: string }>
  value: string | null
  onChange?: (v: string) => void
  size?: 'sm' | 'md'
  block?: boolean
  style?: CSSProperties
}) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  const wrap = useRef<HTMLDivElement | null>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(value))}"]`)
    setThumb(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
  }, [value, options.length])
  const h = size === 'sm' ? 30 : 'calc(var(--ds-control-h) - 6px)'
  return (
    <div
      ref={wrap}
      role="tablist"
      style={{
        position: 'relative',
        display: block ? 'flex' : 'inline-flex',
        padding: 3,
        gap: 2,
        borderRadius: 'calc(var(--ds-r-control) + 3px)',
        background: 'var(--ds-surface-2)',
        border: '1px solid var(--ds-border)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {thumb ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: thumb.left,
            width: thumb.width,
            borderRadius: 'var(--ds-r-control)',
            background: 'var(--ds-surface)',
            boxShadow: '0 1px 3px rgba(43,31,23,.12), 0 0 0 1px var(--ds-border)',
            transition: `left 280ms ${EASE}, width 280ms ${EASE}`,
          }}
        />
      ) : null}
      {opts.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            data-seg={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange?.(o.value)}
            style={{
              position: 'relative',
              flex: block ? 1 : 'none',
              height: h,
              padding: '0 14px',
              border: 0,
              background: 'transparent',
              borderRadius: 'var(--ds-r-control)',
              fontFamily: 'var(--ds-font-body)',
              fontSize: size === 'sm' ? 12 : 'var(--ds-small-size)',
              fontWeight: on ? 600 : 400,
              color: on ? 'var(--ds-ink)' : 'var(--ds-ink-2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color .2s',
              lineHeight: 'normal',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked = false, onChange, disabled = false, ariaLabel }: { checked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean; ariaLabel?: string }) {
  const [f, setF] = useState(false)
  const W = 28
  const K = 12
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--ds-body-size)', color: 'var(--ds-ink)', position: 'relative' }}>
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0 }}
      />
      <span
        style={{
          position: 'relative',
          width: W,
          height: 16,
          flex: 'none',
          borderRadius: 999,
          background: checked ? 'var(--ds-accent)' : 'var(--ds-border)',
          transition: 'background-color .15s',
          boxShadow: f ? 'var(--ds-focus-ring)' : 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? W - K - 2 : 2, width: K, height: K, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.18)', transition: `left .15s ${EASE}` }} />
      </span>
    </label>
  )
}
