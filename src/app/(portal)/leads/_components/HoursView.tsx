'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveHours } from '@/lib/leads/actions'
import { DAY_NAMES, HALF_HOURS, hoursProblem, type BusinessHours, type SpecialDate, type WeekDay } from '@/lib/leads/info'
import s from './setup.module.css'

/**
 * Lead View › Business hours (2026-10-22, the redesign v2 handoff `Business Hours.dc.html`): one week for every page
 * (Kuala Lumpur time) and special dates — a public holiday, staff leave, a closed showroom — that replace it on those
 * days, closed all day or with other hours. Saved together (lead_save_hours). The reply rules (step 4) answer the
 * after-hours customer by these; today's away flows still keep their own hours until then.
 */
export default function HoursView({ hours, ready, today, canEdit }: { hours: BusinessHours; ready: boolean; today: string; canEdit: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<'week' | 'special'>('week')
  const [week, setWeek] = useState<WeekDay[]>(hours.week)
  const [specials, setSpecials] = useState<SpecialDate[]>(hours.specials)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()

  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const touch = () => { setDirty(true); setNote(''); setError('') }
  const setDay = (i: number, o: Partial<WeekDay>) => { touch(); setWeek(w => w.map((d, j) => (j === i ? { ...d, ...o } : d))) }
  const setSp = (i: number, o: Partial<SpecialDate>) => { touch(); setSpecials(x => x.map((d, j) => (j === i ? { ...d, ...o } : d))) }
  const save = () => {
    const problem = hoursProblem({ week, specials })
    if (problem) { setError(problem); return }
    start(async () => {
      const r = await saveHours(week, specials)
      if (!r.ok) { setError(r.reason); return }
      setDirty(false)
      setNote('Saved · just now')
      router.refresh()
    })
  }
  const upcoming = specials.filter(x => x.to >= today).length
  const dis = !canEdit

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>SET UP</span>
          <h1 className={s.title}>Business hours</h1>
        </div>
        {note ? <span className={s.saved}>{note}</span> : dirty ? <span className={s.saveHint} data-dirty="">Unsaved changes</span> : null}
        {canEdit ? <button type="button" className={s.btn} data-strong="" onClick={save} disabled={busy || !dirty || !ready}>{busy ? 'Saving…' : 'Save changes'}</button> : null}
      </div>
      <div className={s.tabs} role="group" aria-label="Business hours">
        <button type="button" className={s.tab} aria-pressed={tab === 'week'} onClick={() => setTab('week')} title={`${week.filter(d => d.on).length} open days`}>Weekly hours</button>
        <button type="button" className={s.tab} aria-pressed={tab === 'special'} onClick={() => setTab('special')} title={`${upcoming} upcoming`}>Special dates</button>
      </div>
      {!ready ? <div className={s.notReady}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
      {error ? <div className={s.error} role="alert"><span>{error}</span></div> : null}

      {tab === 'week' ? (
        <div className={s.sheet}>
          <div>
            <div className={s.sheetTitle}>Weekly hours</div>
            <div className={s.sheetSub}>Outside these hours, each page uses its after-hours reply. Kuala Lumpur time (GMT+8).</div>
          </div>
          <div className={s.days}>
            {week.map((d, i) => (
              <div key={d.day} className={s.day}>
                <span className={s.dayName} data-off={d.on ? undefined : ''}>{DAY_NAMES[d.day - 1]}</span>
                <button type="button" role="switch" aria-checked={d.on} aria-label={`${DAY_NAMES[d.day - 1]} open`} className={s.switch} disabled={dis} onClick={() => setDay(i, { on: !d.on })} title="Open or closed" />
                {d.on ? (
                  <span className={s.times}>
                    <TimeSelect value={d.from} onChange={v => setDay(i, { from: v })} disabled={dis} label={`${DAY_NAMES[d.day - 1]} opens`} />
                    to
                    <TimeSelect value={d.to} onChange={v => setDay(i, { to: v })} disabled={dis} label={`${DAY_NAMES[d.day - 1]} closes`} />
                  </span>
                ) : <span className={s.closed}>Closed</span>}
              </div>
            ))}
          </div>
          {canEdit ? (
            <button type="button" className={s.linkBtn} style={{ alignSelf: 'flex-start' }}
              onClick={() => { touch(); setWeek(w => w.map(x => (x.on ? { ...x, from: w[0].from, to: w[0].to } : x))) }}>
              Copy Monday’s hours to all open days
            </button>
          ) : null}
        </div>
      ) : (
        <div className={s.sheet}>
          <div className={s.sheetHead}>
            <div style={{ flex: 1 }}>
              <div className={s.sheetTitle}>Special dates</div>
              <div className={s.sheetSub}>Public holidays, staff leave or a closed showroom. Replaces the weekly hours on those days.</div>
            </div>
            {canEdit ? (
              <button type="button" className={s.addBtn} onClick={() => {
                touch()
                setSpecials(x => [...x, { id: `new-${Date.now().toString(36)}`, name: '', from: today, to: today, mode: 'closed', open: '10:00', close: '18:00' }])
              }}>+ Add date</button>
            ) : null}
          </div>
          <div style={{ borderTop: '1px solid rgb(var(--lv-border))' }}>
            {specials.map((sp, i) => (
              <div key={sp.id} className={s.special}>
                <input className={s.input} value={sp.name} onChange={e => setSp(i, { name: e.target.value })} placeholder="e.g. Deepavali" maxLength={80} disabled={dis} aria-label="Name" />
                <span className={s.times}>
                  <input type="date" className={s.date} value={sp.from} onChange={e => setSp(i, { from: e.target.value })} disabled={dis} aria-label="From" />
                  to
                  <input type="date" className={s.date} value={sp.to} min={sp.from} onChange={e => setSp(i, { to: e.target.value })} disabled={dis} aria-label="To" />
                </span>
                <select className={s.timeSel} value={sp.mode} onChange={e => setSp(i, { mode: e.target.value as SpecialDate['mode'] })} disabled={dis} aria-label="Hours">
                  <option value="closed">Closed all day</option>
                  <option value="custom">Custom hours</option>
                </select>
                {sp.mode === 'custom' ? (
                  <span className={s.times}>
                    <TimeSelect value={sp.open} onChange={v => setSp(i, { open: v })} disabled={dis} label="Opens" />
                    to
                    <TimeSelect value={sp.close} onChange={v => setSp(i, { close: v })} disabled={dis} label="Closes" />
                  </span>
                ) : <span className={s.closed}>Closed</span>}
                {canEdit ? <button type="button" className={s.x} title="Remove" onClick={() => { touch(); setSpecials(x => x.filter((_, j) => j !== i)) }}>×</button> : <span />}
              </div>
            ))}
            {specials.length === 0 ? <div className={s.closed} style={{ padding: '14px 0' }}>No special dates. The weekly hours apply every day.</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}

function TimeSelect({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled: boolean; label: string }) {
  return (
    <select className={s.timeSel} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} aria-label={label}>
      {HALF_HOURS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
    </select>
  )
}
