'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Ic, type IconName } from './icons'

/**
 * The phone's small shared pieces, each as LeadPhone.dc.html draws it: the round header button, a chip, an avatar, the
 * scrim and the bottom sheet (with the house curve), the toast.
 */

export const EASE = 'cubic-bezier(.2,.8,.2,1)'
export const TITLE: CSSProperties = { fontFamily: 'var(--lv-font-title)', fontWeight: 400, letterSpacing: 'normal' }
export const ONE_LINE: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const c = (token: string, a?: number) => (a === undefined ? `rgb(var(--lv-${token}))` : `rgb(var(--lv-${token}) / ${a})`)
export { c as lv }

/** A 40px round button in the title row: 1px line, the glyph at 18. */
export function RoundButton({ icon, label, onClick, dot = false, filled = false }: { icon: IconName; label: string; onClick: () => void; dot?: boolean; filled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      style={{ position: 'relative', flex: 'none', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: filled ? 0 : `1px solid ${c('line')}`, background: filled ? c('surface', 0.7) : 'transparent', color: c('fg') }}>
      <Ic name={icon} size={18} />
      {dot ? <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: c('accent'), border: `2px solid ${c('surface')}` }} /> : null}
    </button>
  )
}

/** A 34px chip: khaki with its edge when picked, field-coloured otherwise; the count after its words. */
export function Chip({ label, n, on, hot, onClick }: { label: string; n?: number | string; on: boolean; hot?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ flex: 'none', height: 34, padding: '0 12px', borderRadius: 17, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: on ? 600 : 500,
        whiteSpace: 'nowrap', border: `1px solid ${on ? c('sel-line') : c('surface-sel')}`, background: on ? c('sel') : c('surface-sel'), color: c('fg') }}>
      {label}
      {n !== undefined ? <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: hot && !on ? c('accent') : c('fg-3') }}>{n}</span> : null}
    </button>
  )
}

/** Initials on the avatar's khaki, in green. */
export function Avatar({ ini, size, font, weight = 500, style }: { ini: string; size: number; font: number; weight?: number; style?: CSSProperties }) {
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: c('avatar-bg'),
      color: c('pos'), fontSize: font, fontWeight: weight, ...style }}>{ini}</span>
  )
}

/** The see-through layer under a sheet; a tap closes it. */
export function Scrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div onClick={onClose} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: c('fg', 0.32), opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .2s ease-out' }} />
  )
}

/** A sheet that rises from the bottom (translateY 105% → 0 over .32s), its foot clear of the phone's bar. */
export function Sheet({ open, label, radius, maxHeight, children }: { open: boolean; label: string; radius: number; maxHeight?: string; children: ReactNode }) {
  return (
    <div role="dialog" aria-label={label} aria-hidden={!open} inert={!open}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31, maxHeight, overflowY: maxHeight ? 'auto' : undefined, background: c('surface'),
        borderRadius: `${radius}px ${radius}px 0 0`, padding: '10px 20px calc(24px + var(--safe-bottom))', display: 'flex', flexDirection: 'column', gap: 14,
        transform: `translateY(${open ? '0' : '105%'})`, transition: `transform .32s ${EASE}` }}>
      {children}
    </div>
  )
}

/** The dark toast, 2.4 s: 96px over the tab bar, 74px over a chat's composer (both plus the phone's bar). */
export function Toast({ text, inChat }: { text: string | null; inChat: boolean }) {
  if (!text) return null
  return (
    <div role="status" style={{ position: 'absolute', left: 20, right: 20, bottom: `calc(${inChat ? 74 : 96}px + var(--safe-bottom))`, zIndex: 50, padding: '12px 14px',
      borderRadius: 14, background: c('fg'), color: c('surface'), fontSize: 14, fontWeight: 600, pointerEvents: 'none' }}>
      {text}
    </div>
  )
}
