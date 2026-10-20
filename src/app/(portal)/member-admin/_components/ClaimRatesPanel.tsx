'use client'

import { useRef, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { saveClaimRatesAdmin } from '../claim-rates-actions'
import {
  airbnbExample,
  claimRatesChanged,
  claimRatesDraft,
  claimRatesProblems,
  claimRatesToSave,
  type ClaimRatesAdmin,
  type ClaimRatesDraft,
} from '@/lib/member/claim-rates-admin'
import { transportTally, type TransportClaimAdmin } from '@/lib/member/transport-claim-admin'
import { formatIntlDate, formatMoney } from '@/lib/utils'
import s from './member-services.module.css'
import { Select } from '@/components/hrv/select'
import TransportTitlesWindow from './TransportTitlesWindow'

const REGION_COLS = 'minmax(0,1.6fr) 150px 140px 150px 100px'
const VENUE_COLS = 'minmax(0,1.6fr) minmax(0,1fr)'
const day = (d: string) => formatIntlDate(new Date(`${d}T00:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, 'en-GB')
const savedOn = (at: string) => formatIntlDate(new Date(at), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')

/**
 * Member services › Transport claim (Claim rates until 2026-10-20 — the user: "这个 claim rate 我要换成 transport
 * claim"; the HR revamp's panel since 2026-10-10, the rules since 2026-10-05/06): what a member's transport claim is
 * worked out from — Outstation's base and rate per spot, Airbnb's limits (a person a night — a limit, not a
 * fixed amount, since 2026-10-12 — and its small group's),
 * the regions (spots from the base, or flown to) and every venue the ERP's
 * fairs name with its region. One Save, at the top, lit while anything
 * differs from what is stored; `member_admin_save_claim_settings` checks it
 * all again. Read with the page.
 *
 * Right of Save, ⋯ (2026-10-20): who may claim it — the titles ticked, in a window with its own Save
 * (`TransportTitlesWindow`), as Food claim picks its titles.
 */
export default function ClaimRatesPanel({ initial, transport: initialTransport = null }: { initial: ClaimRatesAdmin | null; transport?: TransportClaimAdmin | null }) {
  const [saved, setSaved] = useState(initial)
  const [transport, setTransport] = useState(initialTransport)
  const [titlesOpen, setTitlesOpen] = useState(false)
  const [draft, setDraft] = useState<ClaimRatesDraft | null>(initial ? claimRatesDraft(initial) : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const added = useRef(0)

  if (!saved || !draft) return <p className={s.alert} role="alert">The transport claim could not be read. Reload the page to try again.</p>

  const changed = claimRatesChanged(saved, draft)
  const problems = claimRatesProblems(draft)
  const edit = (next: Partial<ClaimRatesDraft>) => {
    setDraft(d => (d ? { ...d, ...next } : d))
    setError('')
  }
  const names = draft.regions.map(g => g.name.trim()).filter(Boolean)
  const baseOptions = draft.base.trim() && !names.includes(draft.base.trim()) ? [draft.base.trim(), ...names] : names
  const rate = Number(draft.perSpot)
  const regionOf = (venue: string) => (draft.regions.some(g => g.key === draft.venues[venue]) ? draft.venues[venue] : '')

  async function save() {
    if (!draft || saving || !changed) return
    if (problems.length) {
      setError(problems[0])
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await saveClaimRatesAdmin(claimRatesToSave(draft))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(result.data)
      setDraft(claimRatesDraft(result.data))
      flash('Transport claim saved — new claims use it')
    } catch {
      setError('The transport claim could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={s.crCard} aria-labelledby="cr-title">
      <div className={s.crHead}>
        <h2 id="cr-title" className={s.crTitle}>Transport claim</h2>
        <div className={s.crHeadActions}>
          <button type="button" className={s.crSave} disabled={!changed || saving} onClick={save}>
            {saving ? 'Saving…' : changed ? 'Save' : 'Saved'}
          </button>
          {transport ? (
            <button
              type="button"
              className={s.crMore}
              aria-label="Who can claim transport"
              title={`Who can claim · ${transportTally(transport)}`}
              aria-haspopup="dialog"
              onClick={() => setTitlesOpen(true)}
            >
              ⋯
            </button>
          ) : null}
        </div>
      </div>
      {error || (changed && problems.length) ? (
        <p className={s.alert} role="alert">{error || problems[0]}</p>
      ) : null}

      <div className={s.crCards}>
        <div className={s.crBox}>
          <span className={s.crBoxTitle}>Outstation</span>
          <label className={s.crLine} title="Where every outstation route starts">
            <span className={s.crLabel}>Base</span>
            <Select bare className={s.crSelect} value={draft.base.trim()} onChange={e => edit({ base: e.target.value })} disabled={saving}>
              {baseOptions.length === 0 ? <option value="">Add a region first</option> : null}
              {baseOptions.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </label>
          <label className={s.crLine} title={'Spots × this rate, counted from the base. Blank = not set; members see "Rate not set yet"'}>
            <span className={s.crLabel}>Rate per spot</span>
            <span className={s.crUnit}>
              RM
              <input className={s.crInput} inputMode="decimal" value={draft.perSpot} disabled={saving} onChange={e => edit({ perSpot: e.target.value })} aria-label="Rate per spot" />
            </span>
          </label>
        </div>
        <div className={s.crBox}>
          <span className={s.crBoxTitle}>Airbnb</span>
          <div className={s.crAir}>
            {([
              ['perPaxNight', 'Limit per person a night', 'RM', "A limit, not a fixed amount: a group bigger than the small one is paid its invoice's total, up to this × people × nights", 'decimal'],
              ['groupMaxPax', 'Small group up to', 'pax', "Up to this many share the small group's limit, whoever they are", 'numeric'],
              ['groupCapPerNight', "Small group's limit a night", 'RM', "The invoice's total is paid up to this × nights; blank = every group is limited per person", 'decimal'],
            ] as const).map(([key, label, unit, hint, mode]) => (
              <label key={key} className={s.crAirField} title={hint}>
                <span className={s.crAirLabel}>{label}</span>
                <span className={s.crUnit}>
                  {unit}
                  <input
                    className={`${s.crInput} ${s.crAirInput}`}
                    inputMode={mode}
                    value={draft[key]}
                    disabled={saving}
                    onChange={e => edit({ [key]: e.target.value } as Partial<ClaimRatesDraft>)}
                    aria-label={label}
                  />
                </span>
              </label>
            ))}
          </div>
          {airbnbExample(draft) ? <span className={s.crExample}>{airbnbExample(draft)}</span> : null}
        </div>
      </div>

      <div className={s.crScroll}>
        <div className={s.crTable} role="table" aria-label="Regions">
          <div className={s.crTHead} role="row" style={{ gridTemplateColumns: REGION_COLS }}>
            <span role="columnheader">Region</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Spots from {draft.base.trim() || 'the base'}</span>
            <span role="columnheader">Plane ticket</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Outstation pays</span>
            <span role="columnheader" />
          </div>
          {draft.regions.map((g, i) => {
            const pays = g.planeTicket
              ? 'ticket + invoice'
              : /^\d{1,3}$/.test(g.spots.trim()) && Number.isFinite(rate) && draft.perSpot.trim() !== '' ? formatMoney(Number(g.spots) * rate) : '—'
            return (
              <div key={g.key} className={s.crTRow} role="row" data-zebra={i % 2 ? 'true' : undefined} style={{ gridTemplateColumns: REGION_COLS }}>
                <input
                  className={s.crName}
                  value={g.name}
                  maxLength={40}
                  disabled={saving}
                  aria-label={`Region ${i + 1} name`}
                  onChange={e => {
                    const name = e.target.value
                    edit({
                      regions: draft.regions.map(x => (x.key === g.key ? { ...x, name } : x)),
                      ...(draft.base.trim() && draft.base.trim() === g.name.trim() ? { base: name } : {}),
                    })
                  }}
                />
                <input
                  className={s.crSpots}
                  inputMode="numeric"
                  value={g.spots}
                  disabled={saving || g.planeTicket}
                  aria-label={`Spots for ${g.name || `region ${i + 1}`}`}
                  onChange={e => edit({ regions: draft.regions.map(x => (x.key === g.key ? { ...x, spots: e.target.value } : x)) })}
                />
                <button
                  type="button"
                  className={s.crPlane}
                  role="checkbox"
                  aria-checked={g.planeTicket}
                  aria-label={`${g.name || `Region ${i + 1}`} is flown to`}
                  disabled={saving}
                  onClick={() => edit({ regions: draft.regions.map(x => (x.key === g.key ? { ...x, planeTicket: !x.planeTicket } : x)) })}
                >
                  <span className={s.crBox14} data-on={g.planeTicket ? 'true' : undefined} aria-hidden="true">{g.planeTicket ? '✓' : ''}</span>
                  Flown to
                </button>
                <span className={s.crPays}>{pays}</span>
                <button
                  type="button"
                  className={s.crRemove}
                  disabled={saving}
                  onClick={() => edit({ regions: draft.regions.filter(x => x.key !== g.key) })}
                >
                  Remove
                </button>
              </div>
            )
          })}
          <button
            type="button"
            className={s.crAdd}
            disabled={saving || draft.regions.length >= 60}
            onClick={() => {
              added.current += 1
              edit({ regions: [...draft.regions, { key: `new-${added.current}`, id: null, name: 'New region', spots: '0', planeTicket: false }] })
            }}
          >
            + Add region
          </button>
        </div>
      </div>

      <div className={s.crScroll}>
        <div className={s.crTable} role="table" aria-label="Venues">
          <div className={s.crTHead} role="row" style={{ gridTemplateColumns: VENUE_COLS }}>
            <span role="columnheader">Venue (from the ERP&apos;s fairs)</span>
            <span role="columnheader">Region</span>
          </div>
          {saved.venues.map(v => {
            const region = regionOf(v.key)
            return (
              <div key={v.key} className={s.crTRow} role="row" style={{ gridTemplateColumns: VENUE_COLS }}>
                <span className={s.crVenue}>
                  {v.name}
                  <span className={s.crVenueMeta}>
                    {v.fairs} fair{v.fairs === 1 ? '' : 's'}{v.lastFair ? ` · last ${day(v.lastFair)}` : ''}
                  </span>
                </span>
                <Select bare
                  className={s.crVenueSelect}
                  value={region}
                  data-unset={region ? undefined : 'true'}
                  disabled={saving}
                  aria-label={`Region of ${v.name}`}
                  onChange={e => edit({ venues: { ...draft.venues, [v.key]: e.target.value } })}
                >
                  <option value="">Not set — cannot be claimed</option>
                  {draft.regions.filter(g => g.name.trim()).map(g => (
                    <option key={g.key} value={g.key}>{g.name.trim()}</option>
                  ))}
                </Select>
              </div>
            )
          })}
          {saved.venues.length === 0 ? <div className={s.loading}>No fair has named a venue yet.</div> : null}
        </div>
      </div>
      {saved.updatedAt ? (
        <div className={s.foot}>
          Last saved {savedOn(saved.updatedAt)}{saved.updatedBy ? ` by ${saved.updatedBy}` : ''}.
        </div>
      ) : null}
      {titlesOpen && transport ? (
        <TransportTitlesWindow
          transport={transport}
          onClose={() => setTitlesOpen(false)}
          onSaved={next => {
            setTransport(next)
            setTitlesOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}
