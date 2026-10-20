'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import {
  toggleTransportTitle,
  transportChanged,
  transportTally,
  transportTicks,
  transportToSave,
  type TransportClaimAdmin,
} from '@/lib/member/transport-claim-admin'
import { saveTransportClaimAdmin } from '../transport-claim-actions'
import s from './member-services.module.css'

const COLS = 'minmax(0,1.6fr) minmax(0,1fr) 110px 130px'

/**
 * Transport claim's ⋯ (2026-10-20, the user: "在 save button 旁边…做一个三个点。它是要能够选择什么 title 的人可以
 * claim 这个 transport。它跟 food claim 一样"): every Revenue title — the highest level first, how many hold a seat on
 * it today — each ticked *Can claim* or not, as Food claim lists them. Its own Save, here in the window: the rates'
 * Save behind it is untouched. `member_admin_save_transport_claim` checks the list again.
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
  const [ticks, setTicks] = useState<string[]>(() => transportTicks(transport))
  const [refusal, setRefusal] = useState('')
  const [saving, start] = useTransition()
  const on = new Set(ticks)
  const changed = transportChanged(transport, ticks)

  function save() {
    if (!changed || saving) return
    setRefusal('')
    start(async () => {
      try {
        const result = await saveTransportClaimAdmin(transportToSave(ticks))
        if (!result.ok) return setRefusal(result.error)
        onSaved(result.data)
        flash(`Transport claim: ${transportTally(result.data)} can claim`)
      } catch {
        setRefusal('Who can claim could not be saved. Please try again.')
      }
    })
  }

  return (
    <Window open onClose={onClose} width={620} scrim={0.22} label="Who can claim transport">
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
              <span role="columnheader">Transport claim</span>
            </div>
            {transport.titles.map((t, i) => {
              const ticked = on.has(t.id)
              return (
                <div key={t.id} className={s.crTRow} role="row" data-zebra={i % 2 ? 'true' : undefined} style={{ gridTemplateColumns: COLS }}>
                  <span className={s.crVenue} role="cell">
                    {t.name}
                    {t.active ? null : <span className={s.crVenueMeta}>No longer in use</span>}
                  </span>
                  <span className={s.fcLevel} role="cell">{t.level ?? '—'}</span>
                  <span className={s.crPays} role="cell">{t.people} {t.people === 1 ? 'person' : 'people'}</span>
                  <button
                    type="button"
                    className={s.crPlane}
                    role="checkbox"
                    aria-checked={ticked}
                    aria-label={`${t.name} may claim transport`}
                    disabled={saving}
                    onClick={() => {
                      setTicks(prev => toggleTransportTitle(transport, prev, t.id))
                      setRefusal('')
                    }}
                  >
                    <span className={s.crBox14} data-on={ticked ? 'true' : undefined} aria-hidden="true">{ticked ? '✓' : ''}</span>
                    Can claim
                  </button>
                </div>
              )
            })}
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
