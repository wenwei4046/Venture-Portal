'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import {
  toggleTransportTitle,
  transportChanged,
  transportChanges,
  transportTally,
  transportTicks,
  type TransportClaimAdmin,
  type TransportColumn,
  type TransportTicks,
} from '@/lib/member/transport-claim-admin'
import { saveTransportClaimAdmin } from '../transport-claim-actions'
import s from './member-services.module.css'

const COLS = 'minmax(0,1.6fr) minmax(0,1fr) 100px 130px 130px'

/** The two boxes a title has: its column's header, and how a box names itself to a screen reader. */
const BOXES: readonly { column: TransportColumn; header: string; label: (title: string) => string }[] = [
  { column: 'transport', header: 'Transport claim', label: t => `${t} may claim transport` },
  { column: 'airTicket', header: 'Air ticket claim', label: t => `${t} may claim an air ticket` },
]

/**
 * Transport claim's ⋯ (2026-10-20, the user: "在 save button 旁边…做一个三个点。它是要能够选择什么 title 的人可以
 * claim 这个 transport。它跟 food claim 一样"): every Revenue title — the highest level first, how many hold a seat on
 * it today — each ticked *Can claim* or not, as Food claim lists them. Its own Save, here in the window: the rates'
 * Save behind it is untouched. `member_admin_save_transport_claim` checks the list again.
 *
 * A second column since 2026-10-31 (the user: "我要加多一个 Air ticket claim 的 column … if the venue is accept for air
 * ticket, then these guys with tick can claim，就算他们没有 tick transport claim"): *Air ticket claim* — the plane ticket
 * to a fair in a region ticked *Flown to*. *Transport claim* keeps Outstation by road and the Airbnb stay. Save sends
 * only the boxes changed.
 */
export default function TransportTitlesWindow({
  transport,
  onClose,
  onSaved,
}: {
  transport: TransportClaimAdmin
  onClose: () => void
  onSaved: (next: TransportClaimAdmin) => void
}) {
  const [ticks, setTicks] = useState<TransportTicks>(() => transportTicks(transport))
  const [refusal, setRefusal] = useState('')
  const [saving, start] = useTransition()
  const on = { transport: new Set(ticks.transport), airTicket: new Set(ticks.airTicket) }
  const changed = transportChanged(transport, ticks)

  function save() {
    if (!changed || saving) return
    setRefusal('')
    start(async () => {
      try {
        const result = await saveTransportClaimAdmin(transportChanges(transport, ticks))
        if (!result.ok) return setRefusal(result.error)
        onSaved(result.data)
        flash(`Who can claim saved · ${transportTally(result.data)}`)
      } catch {
        setRefusal('Who can claim could not be saved. Please try again.')
      }
    })
  }

  return (
    <Window open onClose={onClose} width={740} scrim={0.22} label="Who can claim transport">
      <div className={s.tcWin}>
        <div className={s.tcHead}>
          <h2 className={s.tcTitle}>Who can claim transport</h2>
          <span className={s.tcCount}>{transportTally(transport, ticks)}</span>
        </div>
        <div className={s.crScroll}>
          <div className={s.crTable} role="table" aria-label="Titles that may claim transport">
            <div className={s.crTHead} role="row" style={{ gridTemplateColumns: COLS }}>
              <span role="columnheader">Title</span>
              <span role="columnheader">Level</span>
              <span role="columnheader" style={{ textAlign: 'right' }}>People</span>
              {BOXES.map(b => (
                <span key={b.column} role="columnheader">{b.header}</span>
              ))}
            </div>
            {transport.titles.map((t, i) => (
              <div key={t.id} className={s.crTRow} role="row" data-zebra={i % 2 ? 'true' : undefined} style={{ gridTemplateColumns: COLS }}>
                <span className={s.crVenue} role="cell">
                  {t.name}
                  {t.active ? null : <span className={s.crVenueMeta}>No longer in use</span>}
                </span>
                <span className={s.fcLevel} role="cell">{t.level ?? '—'}</span>
                <span className={s.crPays} role="cell">{t.people} {t.people === 1 ? 'person' : 'people'}</span>
                {BOXES.map(b => {
                  const ticked = on[b.column].has(t.id)
                  return (
                    <button
                      key={b.column}
                      type="button"
                      className={s.crPlane}
                      role="checkbox"
                      aria-checked={ticked}
                      aria-label={b.label(t.name)}
                      disabled={saving}
                      onClick={() => {
                        setTicks(prev => toggleTransportTitle(transport, prev, b.column, t.id))
                        setRefusal('')
                      }}
                    >
                      <span className={s.crBox14} data-on={ticked ? 'true' : undefined} aria-hidden="true">{ticked ? '✓' : ''}</span>
                      Can claim
                    </button>
                  )
                })}
              </div>
            ))}
            {transport.titles.length === 0 ? <div className={s.loading}>No Revenue title yet.</div> : null}
          </div>
        </div>
        <div className={s.tcFoot}>
          {refusal ? <span className={s.tcRefusal} role="alert">{refusal}</span> : null}
          <button type="button" className={btn('outline')} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={s.crSave} disabled={!changed || saving} onClick={save}>
            {saving ? 'Saving…' : changed ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </Window>
  )
}
