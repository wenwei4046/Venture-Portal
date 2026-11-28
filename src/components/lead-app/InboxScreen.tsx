'use client'

import { Ic } from './icons'
import { Chip, ONE_LINE, RoundButton, TITLE, lv } from './parts'
import type { InboxFilter, RowVM, Chip as ChipVM } from './vm'

/**
 * The Inbox (the handoff's screen 1 — LeadPhone.dc.html lines 24–77): the title row and its round buttons, the chip row
 * (All brands ▾, a divider, the statuses, the labels in use) or the search field, and the rows — each the same height,
 * the wait while the chat waits, the phone when one is on file.
 */
export default function InboxScreen({ rows, chips, brandLabel, searchOpen, q, onQuery, onToggleSearch, onBrands, onChip, onOpen, onBell, onHome }: {
  rows: RowVM[]
  chips: ChipVM[]
  brandLabel: string
  searchOpen: boolean
  q: string
  onQuery: (q: string) => void
  onToggleSearch: () => void
  onBrands: () => void
  onChip: (id: InboxFilter) => void
  onOpen: (id: string) => void
  onBell: () => void
  /** Back to where the app was opened from; none for an account whose phone opens here. */
  onHome: (() => void) | null
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 20px 0', overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h1 style={{ ...TITLE, flex: 1, margin: 0, fontSize: 30, lineHeight: 1.2, color: lv('fg') }}>Inbox</h1>
        <RoundButton icon="search" label="Search" onClick={onToggleSearch} />
        <RoundButton icon="bell" label="Notifications" onClick={onBell} />
        {onHome ? <RoundButton icon="house" label="Back to the portal home" onClick={onHome} /> : null}
      </div>

      {searchOpen ? (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 34 }}>
          <label style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 17, background: lv('surface-sel'), color: lv('fg-4') }}>
            <Ic name="search" size={15} />
            <input value={q} onChange={e => onQuery(e.target.value)} placeholder="Search name, phone or message" aria-label="Search conversations" autoFocus
              style={{ flex: 1, minWidth: 0, height: '100%', border: 0, outline: 'none', background: 'transparent', font: 'inherit', fontSize: 16, color: lv('fg') }} />
          </label>
          <button type="button" onClick={onToggleSearch} style={{ flex: 'none', fontSize: 15, fontWeight: 500, color: lv('accent') }}>Cancel</button>
        </div>
      ) : (
        <div style={{ flex: 'none', display: 'flex', gap: 6, margin: '0 -20px', padding: '0 20px', overflowX: 'auto' }}>
          <button type="button" onClick={onBrands} aria-haspopup="dialog"
            style={{ flex: 'none', height: 34, padding: '0 11px', borderRadius: 17, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, border: `1px solid ${lv('line')}`, whiteSpace: 'nowrap', color: lv('fg') }}>
            {brandLabel}<Ic name="chevronDown" size={12} />
          </button>
          <span aria-hidden="true" style={{ flex: 'none', width: 1, margin: '6px 2px', background: lv('line') }} />
          {chips.map(ch => <Chip key={ch.id} label={ch.label} n={ch.n} on={ch.on} hot={ch.hot} onClick={() => onChip(ch.id)} />)}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '-4px -20px 0' }}>
        {rows.map(l => (
          <button key={l.id} type="button" onClick={() => onOpen(l.id)} data-row=""
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: `1px solid ${lv('line-2')}`, textAlign: 'left', color: lv('fg') }}>
            <span style={{ flex: 'none', position: 'relative', width: 50, height: 50 }}>
              <span style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 500, background: lv('avatar-bg'), color: lv('pos') }}>{l.ini}</span>
              <span title={l.channel === 'instagram' ? 'Instagram' : 'Messenger'}
                style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: '50%', border: `2px solid ${lv('surface')}`, background: lv(l.channel === 'instagram' ? 'instagram' : 'messenger'), color: lv('surface'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name={l.channel === 'instagram' ? 'instagram' : 'messenger'} size={9} stroke={2.4} />
              </span>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 20 }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                  <strong style={{ ...ONE_LINE, flex: '0 1 auto', minWidth: 0, fontSize: 17, fontWeight: l.nameW }}>{l.name}</strong>
                  {l.tag ? (
                    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 10, background: lv('surface-sel'), fontSize: 11.5, fontWeight: 500, color: lv('fg-2'), whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: TAG_DOT[l.tag.tone] }} />{l.tag.name}
                    </span>
                  ) : null}
                </span>
                {l.wait ? (
                  <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: lv(l.wait.long ? 'accent' : 'warn'), whiteSpace: 'nowrap' }}>
                    <Ic name={l.wait.long ? 'alert' : 'clock'} size={12} />{l.wait.text}
                  </span>
                ) : (
                  <span style={{ flex: 'none', fontSize: 13, fontWeight: 500, color: lv(l.whenHot ? 'accent' : 'fg-4'), whiteSpace: 'nowrap' }}>{l.when}</span>
                )}
              </span>
              <span style={{ ...ONE_LINE, height: 16, lineHeight: '16px', fontSize: 13, color: lv('fg-4') }}>{l.ad}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22 }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: lv('fg-2'), whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {l.phone ? (
                    <>
                      <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 500, color: lv('pos') }}><Ic name="phone" size={13} />{l.phone}</span>
                      <span style={{ flex: 'none', color: lv('disabled') }}>·</span>
                    </>
                  ) : null}
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.preview}</span>
                </span>
                {l.unread ? (
                  <span style={{ flex: 'none', minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: lv('accent'), color: lv('surface') }}>{l.unread}</span>
                ) : null}
              </span>
            </span>
          </button>
        ))}
        {rows.length === 0 ? <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: lv('fg-4'), borderTop: `1px solid ${lv('line-2')}` }}>No chats here</div> : null}
      </div>
    </div>
  )
}

/** A label's dot, in its tone (Customer Service's six — the desktop's label colours, handoff.module.css › .label). */
export const TAG_DOT: Readonly<Record<string, string>> = {
  grey: lv('fg-3'), amber: lv('warn'), green: lv('pos'), red: lv('accent'), clay: lv('k-ai'), blue: lv('slate'),
}
