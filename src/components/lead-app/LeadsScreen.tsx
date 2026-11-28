'use client'

import type { LeadStage } from '@/lib/leads/stage'
import { Ic } from './icons'
import { Avatar, Chip, ONE_LINE, TITLE, lv } from './parts'
import { STAGE_DOT, type LeadRowVM } from './vm'

/**
 * Leads (the handoff's screen 3 — LeadPhone.dc.html lines 79–101): the title and its count, the search, the stage chips
 * (the whole pipeline, as the README asks of production), and the rows — a stage's square dot, the phone or "No phone
 * yet", then brand · outlet · ad. A row opens its chat.
 */
export default function LeadsScreen({ count, q, onQuery, chips, onChip, rows, onOpen }: {
  count: number
  q: string
  onQuery: (q: string) => void
  chips: Array<{ id: LeadStage | 'all'; label: string; n: number; on: boolean; hot: boolean }>
  onChip: (id: LeadStage | 'all') => void
  rows: LeadRowVM[]
  onOpen: (id: string) => void
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '10px 28px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ ...TITLE, margin: 0, display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 28, lineHeight: 1.2, color: lv('fg') }}>
        Leads<span style={{ fontFamily: 'var(--lv-font)', fontSize: 14, fontWeight: 400, color: lv('fg-4') }}>{count}</span>
      </h1>
      <label style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 20, background: lv('surface-sel'), color: lv('fg-4') }}>
        <Ic name="searchField" size={18} stroke={1.8} />
        <input value={q} onChange={e => onQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search leads"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', font: 'inherit', fontSize: 16, color: lv('fg') }} />
      </label>
      <div style={{ flex: 'none', display: 'flex', gap: 6, margin: '0 -28px 0 -20px', padding: '0 20px', overflowX: 'auto' }}>
        {chips.map(c => <Chip key={c.id} label={c.label} n={c.n} on={c.on} hot={c.hot} onClick={() => onChip(c.id)} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: -8 }}>
        {rows.map(p => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${lv('line-2')}`, textAlign: 'left', color: lv('fg') }}>
            <Avatar ini={p.ini} size={42} font={14} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ ...ONE_LINE, flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>{p.name}</strong>
                <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: lv('fg-2'), whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: lv(STAGE_DOT[p.stage]) }} />{p.stageLabel}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                <span style={{ flex: 'none', color: p.noPhone ? lv('fg-4') : lv('fg-2'), fontVariantNumeric: 'tabular-nums' }}>{p.phone}</span>
                <span style={{ flex: 'none', color: lv('disabled') }}>·</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: lv('fg-4') }}>{p.src}</span>
              </span>
            </span>
          </button>
        ))}
        {rows.length === 0 ? <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: lv('fg-4') }}>No lead matches.</div> : null}
      </div>
    </div>
  )
}
