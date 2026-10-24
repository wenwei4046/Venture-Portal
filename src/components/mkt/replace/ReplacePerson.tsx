'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replaceMktPerson } from '@/lib/marketing/actions'
import { officeTime } from '@/lib/office-time'
import {
  activeOf, placeWords, recNo, REPLACE_GROUPS, REPLACE_REASONS, replaceBlock, replacePreview, replaceResults, replaceTakers, swapNote, toAccept,
  type ReplaceDone, type ReplacePlace, type ReplacePlaces, type ReplaceTone, type ReplaceWho,
} from '@/lib/marketing/replace'
import type { PickPerson } from '@/lib/marketing/tasks'
import { personBg } from '../builder/people'
import s from './replace.module.css'

// Replace Person (④-5, `Replace Person.dc.html`; the user's answers 24–28), the manager's: who is replaced (step 1),
// where they appear — every place ticked, untick what stays with them — who takes over (anybody on the roster) and why
// (steps 2–3), then what changed (step 4: the record's number, the work now waiting for an Accept, a row a place).
// A template takes a new version at once; nothing goes back after a leave.

const STEPS = ['Choose person', 'Where they appear', 'Replace with', 'Done'] as const
const TONE: Record<ReplaceTone, string> = { done: s.toneDone, waiting: s.toneWaiting, draft: s.toneDraft }

function Steps({ step }: { step: 1 | 2 | 4 }) {
  return (
    <ol className={s.steps} aria-label="Steps">
      {STEPS.map((label, i) => {
        const n = i + 1
        const cur = n === step || (step === 2 && n === 3)
        const done = n < step && !cur
        return (
          <li key={label} className={`${s.step}${done ? ` ${s.stepDone}` : cur ? ` ${s.stepCur}` : ''}`} aria-current={cur ? 'step' : undefined}>
            <span className={s.stepMark}>{done ? '✓' : n}</span>
            <span className={s.stepLabel}>{label}</span>
            {n < STEPS.length ? <span className={s.stepLine} aria-hidden="true" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

export default function ReplacePerson({ who, places, takers, names }: {
  who: ReplaceWho[]
  places: ReplacePlaces | null
  takers: PickPerson[]
  names: Record<string, string>
}) {
  const router = useRouter()
  const [pick, setPick] = useState<string | null>(places?.person.id ?? null)
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(places?.places.map(p => p.key) ?? []))
  const [to, setTo] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ReplaceDone | null>(null)
  const [pending, start] = useTransition()
  const nameOf = (id: string) => names[id] ?? 'Somebody'
  const groupOfWho = (id: string) => who.find(w => w.id === id)?.title ?? ''

  const head = (
    <div className={s.head}>
      <span className={s.headIcon} aria-hidden="true">🔁</span>
      <h1 className={s.title}>Replace Person</h1>
    </div>
  )

  // ── Step 4: what changed ─────────────────────────────────────────────────────────
  if (done) {
    const rows = replaceResults(done, nameOf)
    const accept = toAccept(done)
    return (
      <div className={s.page}>
        {head}
        <Steps step={4} />
        <section className={s.done} aria-label="Done">
          <div className={s.doneTop}>
            <span className={s.doneMark} aria-hidden="true">✓</span>
            <div className={s.doneBody}>
              <div className={s.doneTitle}>{done.done.length} place{done.done.length === 1 ? '' : 's'} updated</div>
              <div className={s.doneLine}>
                {done.from.first} → {done.to.first} · Reason: {done.reason} · {done.at ? officeTime(done.at).format('D MMM YYYY, HH:mm') : ''} by {done.by}
              </div>
            </div>
            <span className={s.rec}>Audit #{recNo(done.rec)}</span>
          </div>
          {accept ? (
            <div className={s.inHand} role="status">
              <span className={s.inHandDot} aria-hidden="true" />
              <span>
                <strong>Tasks in hand need {done.to.first} to Accept again.</strong> {accept} task{accept === 1 ? '' : 's'} moved to {done.to.first}’s My Space
                with an Accept button. Their deadlines are unchanged.
              </span>
            </div>
          ) : null}
          <div className={s.table} role="table" aria-label="Places">
            <div className={`${s.tr} ${s.th}`} role="row">
              <span role="columnheader">Place</span><span role="columnheader">Change</span><span role="columnheader">Status</span>
            </div>
            {rows.map(r => (
              <div key={r.key} className={`${s.tr}${r.kept ? ` ${s.trKept}` : ''}`} role="row">
                <span role="cell"><span className={s.place}>{r.title}</span><br /><span className={s.placeGroup}>{r.group}</span></span>
                <span role="cell">{r.change}</span>
                <span role="cell"><span className={`${s.chip} ${TONE[r.tone]}`}><span className={s.chipDot} aria-hidden="true" />{r.status}</span></span>
              </div>
            ))}
          </div>
          <div className={s.doneFoot}>
            <span className={s.told}>
              {done.to.first}, {done.from.first} and each project’s owner were told.{done.gone ? ` ${done.gone} place${done.gone === 1 ? ' was' : 's were'} no longer ${done.from.first}’s.` : ''}
            </span>
            <button type="button" className={s.ghost} onClick={() => router.push('/marketing/replace')}>Replace someone else</button>
          </div>
        </section>
      </div>
    )
  }

  // ── Steps 2–3: where they appear, who takes over ───────────────────────────────────
  if (places) {
    const from = places.person
    const list = places.places
    const toPerson = to ? { id: to, first: takers.find(t => t.id === to)?.first ?? nameOf(to) } : null
    const refused = list.filter(p => ticked.has(p.key) && swapNote(p, toPerson, from.first)?.refused).map(p => p.key)
    const block = replaceBlock(ticked.size, toPerson, reason, refused)
    const allOn = list.length > 0 && list.every(p => ticked.has(p.key))
    const flip = (keys: readonly string[], on: boolean) => setTicked(t => {
      const next = new Set(t)
      for (const k of keys) if (on) next.add(k); else next.delete(k)
      return next
    })
    const replace = () => start(async () => {
      if (block || !to) return
      setError(null)
      const r = await replaceMktPerson(from.id, to, [...ticked], reason.trim())
      if (!r.ok) {
        setError(r.reason)
        return
      }
      setDone(r.done)
    })
    const item = (p: ReplacePlace) => {
      const on = ticked.has(p.key)
      const w = placeWords(p, nameOf)
      const note = on ? swapNote(p, toPerson, from.first) : null
      return (
        <button key={p.key} type="button" role="checkbox" aria-checked={on} aria-label={w.title} className={`${s.item}${on ? '' : ` ${s.itemOff}`}`}
          onClick={() => flip([p.key], !on)}>
          <span className={`${s.box}${on ? ` ${s.boxOn}` : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
          <span className={s.itemBody}>
            <span className={s.itemTitle}>{w.title}</span>
            <span className={s.itemDetail}>{w.detail}</span>
            {note ? <span className={`${s.itemNote}${note.refused ? ` ${s.itemNoteRed}` : ''}`}>{note.text}</span> : null}
          </span>
          {w.meta ? <span className={`${s.mono}${w.red ? ` ${s.red}` : ''}`}>{w.meta}</span> : null}
          {!on ? <span className={s.stays}>Stays with {from.first}</span> : null}
        </button>
      )
    }
    return (
      <div className={s.page}>
        {head}
        <Steps step={2} />
        <div className={s.grid}>
          <div className={s.left}>
            <div className={s.whoRow}>
              <span className={`${s.av} ${s.av30}`} style={{ background: personBg({ group: groupOfWho(from.id) }) }} aria-hidden="true">{initial(from.first)}</span>
              <span className={s.whoText}>{from.first} appears in {list.length} place{list.length === 1 ? '' : 's'}</span>
              {list.length ? (
                <button type="button" className={s.link} onClick={() => flip(list.map(p => p.key), !allOn)}>{allOn ? 'Untick all' : 'Tick all'}</button>
              ) : null}
            </div>
            {!list.length ? <div className={s.empty}>Nothing to replace</div> : null}
            {REPLACE_GROUPS.map(g => {
              const its = list.filter(p => p.grp === g.key)
              if (!its.length) return null
              const n = its.filter(p => ticked.has(p.key)).length
              const all = n === its.length
              return (
                <section key={g.key} className={s.group} aria-label={g.title(from.first)}>
                  <button type="button" role="checkbox" aria-checked={all ? true : n ? 'mixed' : false} className={s.groupHead}
                    aria-label={`${g.title(from.first)} — all`} onClick={() => flip(its.map(p => p.key), !all)}>
                    <span className={`${s.box}${n ? ` ${s.boxOn}` : ''}`} aria-hidden="true">{all ? '✓' : n ? '–' : ''}</span>
                    <span className={s.groupTitle}>{g.title(from.first)}</span>
                    <span className={s.mono}>{n}/{its.length}</span>
                    <span className={s.grow} />
                    <span className={s.groupHint}>{g.hint}</span>
                  </button>
                  {its.map(item)}
                </section>
              )
            })}
          </div>

          <aside className={s.side} aria-label="Replace with">
            <div className={s.field}>
              <span className={s.label} id="rp-to">Replace with</span>
              <div className={s.takers} role="radiogroup" aria-labelledby="rp-to">
                {replaceTakers(takers, from.id).map(t => (
                  <button key={t.id} type="button" role="radio" aria-checked={to === t.id} className={`${s.taker}${to === t.id ? ` ${s.takerOn}` : ''}`}
                    title={`${t.first} · ${t.hint}`} onClick={() => setTo(t.id)}>
                    <span className={`${s.radio}${to === t.id ? ` ${s.radioOn}` : ''}`} aria-hidden="true" />
                    <span className={`${s.av} ${s.av24}`} style={{ background: personBg(t) }} aria-hidden="true">{initial(t.first)}</span>
                    <span className={s.takerName}>{t.first}</span>
                    <span className={s.takerHint}>· {activeOf(t.hint)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}>
              <span className={s.label} id="rp-why">Reason (required)</span>
              <div className={s.reasons} role="group" aria-labelledby="rp-why">
                {REPLACE_REASONS.map(r => (
                  <button key={r} type="button" aria-pressed={reason === r} className={`${s.reasonChip}${reason === r ? ` ${s.reasonOn}` : ''}`}
                    onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <input className={s.input} value={reason} maxLength={200} placeholder="Or type a reason" aria-label="Reason"
                onChange={e => setReason(e.target.value)} />
            </div>
            <div className={s.preview}>{replacePreview(list, ticked, toPerson?.first ?? null, from.first)}</div>
            <button type="button" className={`${s.primary} ${s.replace}`} disabled={!!block || pending} onClick={replace}>
              {pending ? 'Replacing…' : `Replace selected (${ticked.size})`}
            </button>
            {block ? <span className={s.block}>{block}</span> : null}
            {error ? <span className={s.error} role="alert">{error}</span> : null}
            <button type="button" className={s.back} onClick={() => router.push('/marketing/replace')}>← Choose a different person</button>
          </aside>
        </div>
      </div>
    )
  }

  // ── Step 1: who ───────────────────────────────────────────────────────────────────
  const chosen = who.find(w => w.id === pick) ?? null
  return (
    <div className={s.page}>
      {head}
      <Steps step={1} />
      <section className={s.section} aria-label="Who are you replacing?">
        <h2 className={s.sectionTitle}>Who are you replacing?</h2>
        <div className={s.people} role="radiogroup" aria-label="People">
          {who.map(w => (
            <button key={w.id} type="button" role="radio" aria-checked={pick === w.id} className={`${s.person}${pick === w.id ? ` ${s.personOn}` : ''}`}
              onClick={() => setPick(w.id)}>
              <span className={`${s.av} ${s.av32}`} style={{ background: personBg({ group: w.title }) }} aria-hidden="true">{initial(w.first)}</span>
              <span className={s.personBody}>
                <span className={s.personName}>{w.first}</span>
                <span className={s.personHint}>{[w.title, `in ${w.places} place${w.places === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`${s.radio}${pick === w.id ? ` ${s.radioOn}` : ''}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className={s.foot}>
          <button type="button" className={s.primary} disabled={!chosen || !chosen.places}
            onClick={() => chosen && router.push(`/marketing/replace?p=${chosen.id}`)}>
            {chosen ? (chosen.places ? `Find ${chosen.first} everywhere →` : `${chosen.first} stands nowhere`) : 'Pick somebody'}
          </button>
        </div>
      </section>
    </div>
  )
}
