'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon } from '@/components/layout/lead-icons'
import { saveHours, saveLeave } from '@/lib/leads/actions'
import { DAY_NAMES, HALF_HOURS, hoursProblem, type BusinessHours, type SpecialDate, type WeekDay } from '@/lib/leads/info'
import { dayRange, holidayMode, type StaffLeave } from '@/lib/leads/pages'
import s from './hours.module.css'

/**
 * Lead View v2 › Working hours (2026-11-02, the v2 handoff §7.12; renamed from Business hours, the user's point 1).
 * Weekly hours — outside them each page uses its after-hours reply (Reply rules) — saved by *Save changes*; Public
 * holidays replace the week on their days (the business hours' special dates: closed all day, or other hours) and On
 * Leave lists who is away (mig 20261102110000); both save as each is added or removed. Kuala Lumpur time.
 */
export default function HoursView({ hours, leave, agents, ready, leaveReady, today, canEdit }: {
  hours: BusinessHours
  leave: StaffLeave[]
  /** Who can be on leave: the logins Lead View's Inbox lists (lead_agents). */
  agents: Array<{ id: string; name: string }>
  ready: boolean
  leaveReady: boolean
  today: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [week, setWeek] = useState<WeekDay[]>(hours.week)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [addingH, setAddingH] = useState(false)
  const [addingL, setAddingL] = useState(false)
  const year = Number(today.slice(0, 4))

  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const setDay = (i: number, o: Partial<WeekDay>) => { setDirty(true); setError(''); setWeek(w => w.map((d, j) => (j === i ? { ...d, ...o } : d))) }
  const copyMonday = () => { const m = week[0]; setDirty(true); setWeek(w => w.map(d => (d.on ? { ...d, from: m.from, to: m.to } : d))) }
  const saveWeek = () => {
    const problem = hoursProblem({ week, specials: hours.specials })
    if (problem) { setError(problem); return }
    start(async () => {
      const r = await saveHours(week, hours.specials)
      if (!r.ok) { setError(r.reason); return }
      setDirty(false)
      flash('Working hours saved')
      router.refresh()
    })
  }
  // A holiday saves at once, over the week as last saved (unsaved week edits stay unsaved).
  const saveSpecials = (specials: SpecialDate[], done?: () => void) => {
    const problem = hoursProblem({ week: hours.week, specials })
    if (problem) { setError(problem); return }
    start(async () => {
      setError('')
      const r = await saveHours(hours.week, specials)
      if (!r.ok) { setError(r.reason); return }
      done?.()
      router.refresh()
    })
  }
  const keepLeave = (rows: StaffLeave[], done?: () => void) => start(async () => {
    setError('')
    const r = await saveLeave(rows)
    if (!r.ok) { setError(r.reason); return }
    done?.()
    router.refresh()
  })
  const holidays = hours.specials.filter(x => x.to >= today)
  const away = leave.filter(x => x.to >= today)
  const dis = !canEdit || !ready

  return (
    <div className={s.grid}>
      <section className={s.card} aria-label="Weekly hours">
        <div className={s.head}>
          <div className={s.titles}>
            <span className={s.title}>Weekly hours</span>
            <span className={s.sub}>Outside these hours, each page uses its after-hours reply. Kuala Lumpur time (GMT+8).</span>
          </div>
          <span className={s.open}>{week.filter(d => d.on).length} open days</span>
        </div>
        {week.map((d, i) => (
          <div key={d.day} className={s.day}>
            <button type="button" role="switch" aria-checked={d.on} aria-label={`${DAY_NAMES[d.day - 1]} open`} title="Open / closed" className={s.toggle} disabled={dis} onClick={() => setDay(i, { on: !d.on })} />
            <span className={s.name}>{DAY_NAMES[d.day - 1]}</span>
            {d.on ? (
              <div className={s.times}>
                <TimeSelect value={d.from} onChange={v => setDay(i, { from: v })} disabled={dis} label={`${DAY_NAMES[d.day - 1]} opens`} />
                <span className={s.to}>to</span>
                <TimeSelect value={d.to} onChange={v => setDay(i, { to: v })} disabled={dis} label={`${DAY_NAMES[d.day - 1]} closes`} />
              </div>
            ) : <span className={s.closed}>Closed</span>}
          </div>
        ))}
        <div className={s.foot}>
          <button type="button" className={s.copy} onClick={copyMonday} disabled={dis}>Copy Monday’s hours to all open days</button>
          {canEdit ? <button type="button" className={s.save} onClick={saveWeek} disabled={busy || !ready} title={ready ? undefined : 'Waiting for the database update'}>{busy ? 'Saving…' : 'Save changes'}</button> : null}
        </div>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
      </section>

      <div className={s.col}>
        <section className={s.card} aria-label="Public holidays">
          <div className={s.head}>
            <div className={s.titles}>
              <span className={s.title}>Public holidays</span>
              <span className={s.sub}>Showroom closed or on shorter hours. Replaces the weekly hours on those days.</span>
            </div>
            {canEdit && ready ? <button type="button" className={s.add} onClick={() => setAddingH(true)}><LeadIcon name="plus" size={14} />Add holiday</button> : null}
          </div>
          {addingH ? (
            <HolidayForm today={today} busy={busy} onCancel={() => setAddingH(false)}
              onAdd={h => saveSpecials([...hours.specials, h], () => { setAddingH(false); flash(`${h.name} added`) })} />
          ) : null}
          {holidays.map(x => (
            <div key={x.id} className={s.row}>
              <span className={s.icon}><LeadIcon name="calendar-x-2" size={18} /></span>
              <div className={s.text}><span>{x.name || 'Holiday'}</span><span className={s.date}>{dayRange(x.from, x.to, year)}</span></div>
              <span className={s.mode} data-closed={x.mode === 'closed' || undefined}>{holidayMode(x)}</span>
              {canEdit && ready ? (
                <button type="button" className={s.trash} title="Remove" aria-label={`Remove ${x.name}`} disabled={busy}
                  onClick={() => saveSpecials(hours.specials.filter(y => y.id !== x.id))}><LeadIcon name="trash-2" size={15} /></button>
              ) : null}
            </div>
          ))}
          {!holidays.length && !addingH ? <div className={s.none}>No holidays coming up.</div> : null}
        </section>

        <section className={s.card} aria-label="On Leave">
          <div className={s.head}>
            <div className={s.titles}>
              <span className={s.title}>On Leave</span>
              <span className={s.sub}>Staff away. Their chats go to the rest of the team while they’re on leave.</span>
            </div>
            {canEdit && leaveReady ? <button type="button" className={s.add} onClick={() => setAddingL(true)}><LeadIcon name="plus" size={14} />Add leave</button> : null}
          </div>
          {addingL ? (
            <LeaveForm agents={agents} today={today} busy={busy} onCancel={() => setAddingL(false)}
              onAdd={l => keepLeave([...leave, l], () => { setAddingL(false); flash(`${l.name}’s leave added`) })} />
          ) : null}
          {away.map(x => (
            <div key={x.id} className={s.row}>
              <span className={s.icon} data-leave=""><LeadIcon name="plane" size={18} /></span>
              <div className={s.text}><span>{x.name}</span><span className={s.date}>{dayRange(x.from, x.to, year)}</span></div>
              <span className={s.mode}>Away all day</span>
              {canEdit && leaveReady ? (
                <button type="button" className={s.trash} title="Remove" aria-label={`Remove ${x.name}’s leave`} disabled={busy}
                  onClick={() => keepLeave(leave.filter(y => y.id !== x.id))}><LeadIcon name="trash-2" size={15} /></button>
              ) : null}
            </div>
          ))}
          {!away.length && !addingL ? <div className={s.none}>{leaveReady ? 'Nobody is on leave.' : 'Waiting for the database update.'}</div> : null}
        </section>
      </div>
    </div>
  )
}

function TimeSelect({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  return (
    <select className={s.time} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} aria-label={label}>
      {HALF_HOURS.map(h => <option key={h.v} value={h.v}>{h.v === '00:00' && label.endsWith('closes') ? 'Midnight' : h.l}</option>)}
    </select>
  )
}

function HolidayForm({ today, busy, onAdd, onCancel }: { today: string; busy: boolean; onAdd: (h: SpecialDate) => void; onCancel: () => void }) {
  const [h, setH] = useState<SpecialDate>({ id: '', name: '', from: today, to: today, mode: 'closed', open: '10:00', close: '18:00' })
  return (
    <div className={s.form}>
      <label className={`${s.field} ${s.grow}`}>Name<input value={h.name} onChange={e => setH({ ...h, name: e.target.value })} maxLength={80} placeholder="Deepavali" autoFocus /></label>
      <label className={s.field}>From<input type="date" value={h.from} onChange={e => setH({ ...h, from: e.target.value, to: e.target.value > h.to ? e.target.value : h.to })} /></label>
      <label className={s.field}>To<input type="date" value={h.to} min={h.from} onChange={e => setH({ ...h, to: e.target.value })} /></label>
      <label className={s.field}>Hours
        <select value={h.mode} onChange={e => setH({ ...h, mode: e.target.value as SpecialDate['mode'] })}>
          <option value="closed">Closed all day</option>
          <option value="custom">Shorter hours</option>
        </select>
      </label>
      {h.mode === 'custom' ? (
        <>
          <label className={s.field}>Opens<select value={h.open} onChange={e => setH({ ...h, open: e.target.value })}>{HALF_HOURS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></label>
          <label className={s.field}>Closes<select value={h.close} onChange={e => setH({ ...h, close: e.target.value })}>{HALF_HOURS.map(x => <option key={x.v} value={x.v}>{x.v === '00:00' ? 'Midnight' : x.l}</option>)}</select></label>
        </>
      ) : null}
      <div className={s.formBtns}>
        <button type="button" className={s.cancel} onClick={onCancel}>Cancel</button>
        <button type="button" className={s.ok} disabled={busy || !h.name.trim() || !h.from || !h.to} onClick={() => onAdd({ ...h, name: h.name.trim() })}>Add</button>
      </div>
    </div>
  )
}

function LeaveForm({ agents, today, busy, onAdd, onCancel }: { agents: Array<{ id: string; name: string }>; today: string; busy: boolean; onAdd: (l: StaffLeave) => void; onCancel: () => void }) {
  const [who, setWho] = useState(agents[0]?.id ?? '')
  const [name, setName] = useState('')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const typed = who === '' || !agents.length
  const person = typed ? name.trim() : agents.find(a => a.id === who)?.name ?? ''
  return (
    <div className={s.form}>
      {agents.length ? (
        <label className={`${s.field} ${s.grow}`}>Who
          <select value={who} onChange={e => setWho(e.target.value)}>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="">Someone else…</option>
          </select>
        </label>
      ) : null}
      {typed ? <label className={`${s.field} ${s.grow}`}>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus /></label> : null}
      <label className={s.field}>From<input type="date" value={from} onChange={e => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></label>
      <label className={s.field}>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <div className={s.formBtns}>
        <button type="button" className={s.cancel} onClick={onCancel}>Cancel</button>
        <button type="button" className={s.ok} disabled={busy || !person || !from || !to} onClick={() => onAdd({ id: '', userId: typed ? null : who, name: person, from, to })}>Add</button>
      </div>
    </div>
  )
}
