'use client'

import Link from 'next/link'
import { useState } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import type { HrNavTone } from '@/components/layout/hr-nav'

/**
 * The Overview's quick-action tile and a category card's row (2026-10-15, the
 * Attendance handoff, `isOverview`), inline value for value — the tile's border
 * turns orange with a soft shadow under the pointer, the row turns peach.
 */

const tone = (t: HrNavTone) => ({ bg: `rgb(var(--tone-${t}))`, fg: `rgb(var(--tone-${t}-deep))` })

export function OvQuickTile({ href, label, icon, tone: t, badge }: { href: string; label: string; icon: HrIconName; tone: HrNavTone; badge: number }) {
  const [h, setH] = useState(false)
  const c = tone(t)
  return (
    <Link
      href={href}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--ds-ink)',
        cursor: 'pointer',
        border: `1px solid ${h ? 'var(--ds-accent)' : 'var(--ds-border)'}`,
        borderRadius: 12,
        background: 'var(--ds-surface)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 88,
        boxSizing: 'border-box',
        boxShadow: h ? '0 4px 14px rgb(51 36 27 / .06)' : 'none',
        textDecoration: 'none',
        lineHeight: 'normal',
      }}
    >
      <span style={{ position: 'relative', width: 34, height: 34, borderRadius: 9, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center' }}>
        <HrIcon name={icon} size={17} />
        {badge > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -7,
              right: -9,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              boxSizing: 'border-box',
              borderRadius: 9,
              background: 'var(--ds-accent)',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 0 0 2px var(--ds-surface)',
            }}
          >
            {badge}
          </span>
        ) : null}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</span>
    </Link>
  )
}

export function OvCatRow({ href, label, icon, tone: t, badge }: { href: string; label: string; icon: HrIconName; tone: HrNavTone; badge: number }) {
  const [h, setH] = useState(false)
  const c = tone(t)
  return (
    <Link
      href={href}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 4px',
        border: 0,
        borderRadius: 8,
        background: h ? 'rgb(255 245 233)' : 'none',
        fontFamily: 'inherit',
        color: 'var(--ds-ink)',
        cursor: 'pointer',
        textAlign: 'left',
        textDecoration: 'none',
        lineHeight: 'normal',
      }}
    >
      <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center' }}>
        <HrIcon name={icon} size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {badge > 0 ? (
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: 'rgb(255 240 228)', color: 'rgb(var(--tone-clay-deep))' }}>{badge}</span>
      ) : null}
      <span style={{ fontSize: 13, color: 'var(--ds-ink-3)' }}>›</span>
    </Link>
  )
}
