'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ds/Button'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { useEscape } from '@/components/hrv/overlay'
import { initials } from '@/lib/me/format'

/**
 * Me's pieces of the design system (2026-10-17) that the house ports (components/ds) do not carry yet, value for
 * value from the Claude Design project "HOUZS Venture Design System" bundle the handoff draws with: Icon (both
 * sets), Avatar, ListItem (meta, chevron, the press fade), Banner (with its action), the bottom Sheet, the Dialog,
 * DateField and the Toast — each drawn inside Me's own frame (`position: absolute`), as the prototype's are.
 */

export const EASE = 'cubic-bezier(.2,.8,.2,1)'

/** White cards and lists: hairline, radius 12 (tiles 14), the shared double shadow. */
export const SHADOW = '0 1px 2px rgb(63 43 34 / .06), 0 6px 18px rgb(63 43 34 / .08)'
export const LIST: CSSProperties = { border: '1px solid var(--ds-border)', borderRadius: 12, overflow: 'hidden', padding: '0 14px', background: 'var(--ds-surface)', boxShadow: SHADOW }
export const NUM: CSSProperties = { fontFamily: 'var(--ds-font-body)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }

// ── Icon ────────────────────────────────────────────────────────────────────

const HR_NAMES = new Set<string>(['home', 'approve', 'in', 'out', 'invoice', 'payroll', 'staff', 'director', 'report', 'org', 'tree', 'chev', 'chevR', 'doc', 'hire', 'room', 'link', 'lock', 'calendar', 'percent', 'receipt', 'people', 'fileAlert'])

/** The Revenue set's paths the handoff names (RvIcon). */
const RV: Record<string, string> = {
  user: 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18',
  trophy: 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
}

/** One icon API over both sets: HR names draw the HR set (1.6), the rest the Revenue set (1.7). */
export function Icon({ name, size = 18, stroke, style }: { name: string; size?: number; stroke?: number; style?: CSSProperties }) {
  if (HR_NAMES.has(name)) return <span style={{ display: 'inline-flex', ...style }}><HrIcon name={name as HrIconName} size={size} stroke={stroke ?? 1.6} /></span>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke ?? 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      <path d={RV[name] ?? ''} />
    </svg>
  )
}

/** The camera glyph on an avatar's badge. */
export function CameraGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

// ── Avatar ──────────────────────────────────────────────────────────────────

/** Initials on a tile (radius `--ds-avatar-r`), or the person's photo. */
export function Avatar({ name, size = 32, tone = 'neutral', photo, style }: { name: string; size?: number; tone?: 'dark' | 'accent' | 'neutral'; photo?: string | null; style?: CSSProperties }) {
  if (photo) {
    return <span role="img" aria-label={name} style={{ display: 'block', width: size, height: size, flex: 'none', borderRadius: 'var(--ds-avatar-r)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: `url("${photo}")`, ...style }} />
  }
  const bg = tone === 'dark' ? 'var(--ds-dark)' : tone === 'accent' ? 'var(--ds-accent-soft)' : 'var(--ds-surface-3)'
  const fg = tone === 'dark' ? 'var(--ds-on-dark)' : tone === 'accent' ? 'var(--ds-accent-soft-ink)' : 'var(--ds-ink)'
  return (
    <span aria-label={name} style={{
      width: size, height: size, flex: 'none', boxSizing: 'border-box', borderRadius: 'var(--ds-avatar-r, 50%)', background: bg, color: fg,
      border: tone === 'accent' ? '1px solid var(--ds-accent-soft-border)' : 0, display: 'grid', placeItems: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 650, letterSpacing: '.02em', ...style,
    }}>{initials(name)}</span>
  )
}

// ── ListItem ────────────────────────────────────────────────────────────────

/** The mobile workhorse: leading, title + sub, meta, trailing, chevron; fades while pressed. */
export function ListItem({ leading, title, subtitle, meta, trailing, chevron = true, onClick, divider = true, style }: {
  leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; trailing?: ReactNode; chevron?: boolean; onClick?: () => void; divider?: boolean; style?: CSSProperties
}) {
  const [d, setD] = useState(false)
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      onPointerDown={() => setD(true)}
      onPointerUp={() => setD(false)}
      onPointerLeave={() => setD(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: divider ? '1px solid var(--ds-divider)' : 0,
        cursor: onClick ? 'pointer' : undefined, opacity: d && onClick ? 0.6 : 1, transition: 'opacity 160ms', color: 'var(--ds-ink)', ...style,
      }}
    >
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(var(--ds-body-size) + .5px)', fontWeight: 'var(--ds-weight-strong)' as CSSProperties['fontWeight'], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 'var(--ds-small-size)', color: 'var(--ds-ink-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div> : null}
      </div>
      {meta ? <span style={{ fontSize: 12, color: 'var(--ds-ink-3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {trailing}
      {chevron && onClick ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ds-ink-3)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      ) : null}
    </div>
  )
}

/** A list in its white card (the hub's Request status, Submit request's status, Leave's waiting). */
export function ListCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...LIST, ...style }}>{children}</div>
}

// ── Words ───────────────────────────────────────────────────────────────────

/** "REQUEST STATUS": 11px, .08em, uppercase, ink-3. */
export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', ...style }}>{children}</div>
}

/** A screen's title (30px display) and the sub line under it. */
export function Title({ title, sub, size = 30 }: { title: ReactNode; sub?: ReactNode; size?: number }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: size, fontWeight: 'var(--ds-title-weight)' as CSSProperties['fontWeight'], letterSpacing: 'var(--ds-title-tracking)', lineHeight: 1.1 }}>{title}</h1>
      {sub ? <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ds-ink-2)' }}>{sub}</p> : null}
    </div>
  )
}

// ── Banner ──────────────────────────────────────────────────────────────────

export function Banner({ tone = 'info', title, children, action, style }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 'var(--ds-r-row)', background: `var(--ds-${tone}-bg)`,
      border: `1px solid var(--ds-${tone}-border)`, color: 'var(--ds-ink)', fontSize: 'var(--ds-small-size)', lineHeight: 1.5, ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--ds-${tone})`, marginTop: 7, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <div style={{ fontWeight: 'var(--ds-weight-strong)' as CSSProperties['fontWeight'], color: `var(--ds-${tone})` }}>{title}</div> : null}
        {children}
      </div>
      {action}
    </div>
  )
}

// ── Overlays (inside Me's frame) ────────────────────────────────────────────

function useMounted(open: boolean, ms: number) {
  const [m, setM] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setM(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setM(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return [m, shown] as const
}

/** Keeps the last thing shown while an overlay animates out (its words must not vanish mid-slide). */
export function useLast<T>(v: T | null | undefined): T | null {
  const ref = useRef<T | null>(null)
  if (v != null) ref.current = v
  return v ?? ref.current
}

/** The mobile sheet: rises 105% → 0 over 320ms, handle, top radius, a scrim that fades; out the same way. */
export function BottomSheet({ open, onClose, eyebrow, title, description, children, footer }: {
  open: boolean; onClose: () => void; eyebrow?: ReactNode; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode
}) {
  const [m, shown] = useMounted(open, 340)
  useEscape(open, onClose)
  if (!m) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 35 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--ds-scrim)', opacity: shown ? 1 : 0, transition: 'opacity 250ms ease' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', background: 'var(--ds-surface)', display: 'flex', flexDirection: 'column', color: 'var(--ds-ink)',
        boxSizing: 'border-box', borderRadius: 'var(--ds-r-sheet) var(--ds-r-sheet) 0 0', transform: shown ? 'translateY(0)' : 'translateY(105%)',
        transition: `transform 320ms ${EASE}`, boxShadow: '0 -10px 40px rgba(63,43,34,.2)', fontSize: 14,
      }}>
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: 'var(--ds-border-strong)', marginTop: 10, flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 20px 4px' }}>
          <div>
            {eyebrow ? <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', marginBottom: 6 }}>{eyebrow}</div> : null}
            {title ? <h2 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>{title}</h2> : null}
            {description ? <p style={{ margin: '4px 0 0', fontSize: 'var(--ds-small-size)', color: 'var(--ds-ink-2)' }}>{description}</p> : null}
          </div>
        </div>
        <div className="me-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
        {footer ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 20px calc(10px + max(20px, var(--safe-bottom)))', borderTop: '1px solid var(--ds-border)' }}>{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

/** A centred decision: scales in from .96 and fades (200ms), and out again. */
export function Dialog({ open, onClose, title, description, children, footer, width = 440 }: {
  open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number
}) {
  const [m, shown] = useMounted(open, 200)
  useEscape(open, onClose)
  if (!m) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--ds-scrim)', opacity: shown ? 1 : 0, transition: 'opacity 240ms ease' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${shown ? 1 : 0.96})`, opacity: shown ? 1 : 0,
        transition: `transform 200ms ${EASE}, opacity 200ms ease`, width, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 40px)',
        background: 'var(--ds-surface)', borderRadius: 'var(--ds-r-panel)', boxShadow: '0 20px 60px rgb(43 31 23 / .25)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', color: 'var(--ds-ink)', fontSize: 14,
      }}>
        <div style={{ padding: '20px 22px 0' }}>
          {title ? <h2 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: 'var(--ds-h2-size)', fontWeight: 'var(--ds-h2-weight)' as CSSProperties['fontWeight'], letterSpacing: 'var(--ds-h2-tracking)' }}>{title}</h2> : null}
          {description ? <p style={{ margin: '6px 0 0', fontSize: 'var(--ds-small-size)', color: 'var(--ds-ink-2)', lineHeight: 1.5 }}>{description}</p> : null}
        </div>
        <div style={{ padding: '16px 22px', overflowY: 'auto' }}>{children}</div>
        {footer ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)' }}>{footer}</div> : null}
      </div>
    </div>
  )
}

/** One line, bottom-centre of the frame, dark with an accent dot; rises 8px and fades. */
export function Toast({ message, bottom = 100 }: { message: string | null; bottom?: number }) {
  const last = useLast(message)
  const [m, shown] = useMounted(!!message, 200)
  if (!m) return null
  return (
    <div role="status" style={{
      position: 'absolute', left: '50%', bottom, transform: `translate(-50%, ${shown ? 0 : 8}px)`, opacity: shown ? 1 : 0,
      transition: `transform 220ms ${EASE}, opacity 200ms ease`, zIndex: 50, background: 'rgb(43 31 23)', color: 'rgb(246 238 230)',
      padding: '10px 16px', borderRadius: 'var(--ds-r-row)', fontSize: 13, boxShadow: '0 8px 24px rgb(43 31 23 / .25)', display: 'flex',
      alignItems: 'center', gap: 10, whiteSpace: 'nowrap', maxWidth: 'calc(100% - 40px)', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      <span style={{ color: 'var(--ds-accent)' }}>●</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{message || last}</span>
    </div>
  )
}

/** The Staff App's toast: holds 2.4s. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const flash = (m: string) => {
    setToast(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2400)
  }
  return [toast, flash] as const
}

// ── DateField ───────────────────────────────────────────────────────────────

/** A date on the themed field (the native picker underneath, so it works on every phone). */
export function DateField({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const [h, setH] = useState(false)
  const [f, setF] = useState(false)
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      boxSizing: 'border-box', width: '100%', minHeight: 'var(--ds-control-h)', borderRadius: 'var(--ds-r-field)',
      border: `1px solid ${f ? 'var(--ds-accent)' : h ? 'var(--ds-border-hover)' : 'var(--ds-border)'}`, boxShadow: f ? 'var(--ds-focus-ring)' : 'none',
      background: 'var(--ds-surface)', color: 'var(--ds-ink)', fontFamily: 'var(--ds-font-body)', fontSize: 'var(--ds-control-fs)',
      transition: 'border-color .15s, box-shadow .15s', display: 'flex', alignItems: 'center', padding: '0 12px',
    }}>
      <input type="date" value={value} min={min} max={max} onChange={e => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} data-ds-input=""
        style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', font: 'inherit', color: value ? 'inherit' : 'var(--ds-placeholder)', padding: '8px 0', fontVariantNumeric: 'tabular-nums', boxShadow: 'none' }} />
    </div>
  )
}

/** − n + : the OT hours and the manpower count (two secondary buttons around the figure). */
export function Stepper({ value, onMinus, onPlus, minWidth }: { value: ReactNode; onMinus: () => void; onPlus: () => void; minWidth: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="secondary" onClick={onMinus} title="One less">−</Button>
      <span style={{ ...NUM, fontSize: 18, minWidth, textAlign: 'center' }}>{value}</span>
      <Button variant="secondary" onClick={onPlus} title="One more">+</Button>
    </div>
  )
}
