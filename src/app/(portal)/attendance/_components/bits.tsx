'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { tint, toneVars } from '@/lib/attendance/engine'

/**
 * Small pieces every Attendance page draws the same way (the handoff's
 * `HR Attendance.dc.html`, inline styles value for value).
 */

/** A person's initials on their tone's tile (radius 7 at 26–30px, 6 at 24). */
export function Avatar({ name, size = 30, radius, fontSize }: { name: string; size?: number; radius?: number; fontSize?: number }) {
  const t = tint(name)
  const v = toneVars(t.tone)
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: radius ?? (size <= 24 ? 6 : size >= 42 ? 10 : 7),
        background: v.avBg,
        color: v.avFg,
        display: 'grid',
        placeItems: 'center',
        fontSize: fontSize ?? (size >= 42 ? 14 : size >= 28 ? 11 : size >= 26 ? 10 : 9.5),
        fontWeight: 600,
        letterSpacing: size >= 28 && size < 42 ? '.02em' : undefined,
      }}
    >
      {t.ini}
    </span>
  )
}

/** A filter pill: label + mono count; the picked one peach with an orange border. */
export function Pill({ label, n, on, onClick }: { label: string; n: number | string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 11px',
        borderRadius: 999,
        border: `1px solid ${on ? 'var(--hr-accent, rgb(233 154 83))' : 'var(--ds-border)'}`,
        background: on ? 'rgb(255 240 228)' : 'var(--ds-surface)',
        fontFamily: 'inherit',
        fontSize: 12.5,
        color: 'var(--ds-ink)',
        cursor: 'pointer',
        lineHeight: 'normal',
      }}
    >
      {label}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>{n}</span>
    </button>
  )
}

/** Uppercase small label (10.5px, .08em, ink-3). */
export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', ...style }}>{children}</span>
}

/** A row that turns peach under the pointer (the prototype's style-hover). */
export function HoverButton({ style, hover = { background: 'rgb(255 245 233)' }, children, onClick, title, ...rest }: {
  style: CSSProperties
  hover?: CSSProperties
  children: ReactNode
  onClick?: () => void
  title?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'onClick' | 'children' | 'title'>) {
  const [h, setH] = useState(false)
  return (
    <button type="button" title={title} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...style, ...(h ? hover : null) }} {...rest}>
      {children}
    </button>
  )
}

/** A div that answers the pointer the same way (cards with `style-hover`). */
export function HoverDiv({ style, hover, children, onClick }: { style: CSSProperties; hover: CSSProperties; children: ReactNode; onClick?: () => void }) {
  const [h, setH] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...style, ...(h ? hover : null) }}>
      {children}
    </div>
  )
}

export type NodeState = 'done' | 'current' | 'next' | 'rejected'

/**
 * The horizontal node track (Requests' approval flow, Month close's steps):
 * a green tick when done, the accent ring when waiting, grey numbered next,
 * red × when rejected; the line after a done node is green.
 */
export function NodeTrack({ nodes, nextRing = 'var(--ds-border-strong, var(--ds-border))' }: { nodes: Array<{ state: NodeState; n: number; lines: ReactNode }>; nextRing?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {nodes.map((st, i) => {
        const ok = st.state === 'done', w = st.state === 'current', bad = st.state === 'rejected', last = i === nodes.length - 1
        return (
          <div key={i} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ position: 'absolute', top: 13, left: 34, right: 6, height: 2, borderRadius: 2, background: last ? 'transparent' : ok ? 'var(--ds-success)' : 'var(--ds-border)' }} />
            <span
              style={{
                position: 'relative',
                width: 28,
                height: 28,
                boxSizing: 'border-box',
                borderRadius: '50%',
                border: `2px solid ${ok ? 'var(--ds-success)' : bad ? 'var(--ds-danger)' : w ? 'var(--hr-accent, rgb(233 154 83))' : nextRing}`,
                background: ok ? 'var(--ds-success)' : bad ? 'var(--ds-danger)' : w ? 'var(--ds-surface)' : 'var(--ds-surface-2)',
                color: ok || bad ? '#fff' : 'var(--ds-ink-3)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: w ? '0 0 0 4px rgb(232 150 80 / .18), inset 0 0 0 5px var(--ds-surface), inset 0 0 0 14px var(--hr-accent, rgb(233 154 83))' : 'none',
              }}
            >
              {ok ? '✓' : bad ? '×' : w ? '' : String(st.n)}
            </span>
            <div style={{ minWidth: 0, paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>{st.lines}</div>
          </div>
        )
      })}
    </div>
  )
}
