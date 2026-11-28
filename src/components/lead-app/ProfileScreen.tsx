'use client'

import type { ReactNode } from 'react'
import { Ic, type IconName } from './icons'
import { ONE_LINE, RoundButton, TITLE, lv } from './parts'

export interface ProfileRow {
  key: string
  label: string
  icon: IconName
  sub?: string
  /** A figure on the right (14px, muted), or a rust badge when `badge`. */
  n?: string
  badge?: boolean
  go: () => void
}

/**
 * Profile (the handoff's screen 5 — LeadPhone.dc.html lines 147–177): the warm wash from the top, the house, the rust
 * avatar with the name and the line under it, then the groups — a small caps label over a white card of rows (a rust
 * tile, the words, a figure or badge, the chevron). Me's punch card goes under the name (phase 2).
 */
export default function ProfileScreen({ name, sub, ini, groups, onHome, children }: {
  name: string
  sub: string
  ini: string
  groups: Array<{ title: string; rows: ProfileRow[] }>
  onHome: (() => void) | null
  /** Between the name and the groups: Me's card. */
  children?: ReactNode
}) {
  return (
    <div data-profile=""
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
        background: `linear-gradient(180deg, ${lv('rail')} 0%, ${lv('page')} 18%, ${lv('surface')} 42%)` }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 40 }}>
        {onHome ? <RoundButton icon="house" label="Back to the portal home" onClick={onHome} filled /> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: -6 }}>
        <span aria-hidden="true" style={{ width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', background: lv('accent'), color: lv('surface'),
          border: `4px solid ${lv('surface')}`, boxShadow: `0 4px 14px ${lv('fg', 0.12)}`, fontSize: 32, fontWeight: 500 }}>{ini}</span>
        <h1 style={{ ...TITLE, margin: '6px 0 0', fontSize: 22, color: lv('fg'), textAlign: 'center' }}>{name}</h1>
        <span style={{ fontSize: 13, color: lv('fg-3'), textAlign: 'center' }}>{sub}</span>
      </div>
      {children}
      {groups.map(g => (
        <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ padding: '0 6px', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: lv('fg-4') }}>{g.title}</span>
          <div style={{ borderRadius: 16, background: lv('surface'), boxShadow: `0 1px 2px ${lv('fg', 0.04)}, 0 6px 18px ${lv('fg', 0.06)}`, overflow: 'hidden' }}>
            {g.rows.map((r, k) => <Row key={r.key} r={r} first={k === 0} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

/** One row of a Profile card (also the Switch view sheet's). */
export function Row({ r, first }: { r: ProfileRow; first: boolean }) {
  return (
    <button type="button" onClick={r.go}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: first ? 0 : `1px solid ${lv('line-2')}`, textAlign: 'left', color: lv('fg') }}>
      <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: lv('accent'), color: lv('surface') }}>
        <Ic name={r.icon} size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{r.label}</span>
        {r.sub ? <span style={{ ...ONE_LINE, fontSize: 12, lineHeight: 1.35, color: lv('fg-3') }}>{r.sub}</span> : null}
      </span>
      {r.n && r.badge ? (
        <span style={{ flex: 'none', minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, display: 'grid', placeItems: 'center', background: lv('accent'), color: lv('surface'), fontSize: 12, fontWeight: 600 }}>{r.n}</span>
      ) : r.n ? (
        <span style={{ flex: 'none', fontSize: 14, color: lv('fg-3'), fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
      ) : null}
      <Ic name="chevronRight" size={15} style={{ flex: 'none', color: lv('disabled') }} />
    </button>
  )
}
