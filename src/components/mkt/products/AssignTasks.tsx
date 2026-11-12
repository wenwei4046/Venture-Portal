'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { assignMktQuote } from '@/lib/marketing/quote-actions'
import { groupTone } from '@/lib/marketing/groups'
import { addDays, buildTasks, dmy, teamTone, type Quote, type QuoteBook, type QuoteTask, type Team } from '@/lib/marketing/quotes'
import { pickDate } from './pick-date'
import qs from './quotes.module.css'

// Assign tasks (`Product Builder.dc.html` › the assign-tasks window, 980px): the accepted quotation's work — an item line
// one task, a package one task per item with a quantity — each with its team (by its catalogue), the person it goes to
// (required), its start and its due day (start + the item's est. days; amber after the quoted delivery), its days.
// "Start on" moves every start and due day. Create makes a quick task a row (the user's answer 2, 2026-11-12); once
// made, the window lists them, each opening its task.

export default function AssignTasks({ quote, book, clientName, today, onClose, onDone, flash }: {
  quote: Quote
  book: QuoteBook
  clientName: string
  today: string
  onClose: () => void
  onDone: (q: Quote) => void
  flash: (words: string) => void
}) {
  const done = !!quote.tasks
  const pick = useMemo(() => (t: Team) => book.people.find(p => groupTone(p.title) === teamTone(t))?.id ?? null, [book.people])
  const [start, setStart] = useState(today)
  const [rows, setRows] = useState<QuoteTask[]>(() => quote.tasks ?? buildTasks(quote, book.items, today, pick))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const setRow = (i: number, patch: Partial<QuoteTask>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const unassigned = rows.filter(r => !r.who).length
  const people = book.people

  const create = async () => {
    if (done) return onClose()
    if (unassigned) return flash('Pick someone for every task first')
    if (busy) return
    setBusy(true)
    try {
      const r = await assignMktQuote(quote.id, rows.map(x => ({ name: x.name, from: x.from, team: x.team, who: x.who, start: x.start, due: x.due, days: x.days, eta: x.eta })))
      if (!r.ok) return flash(r.reason)
      onDone(r.quote)
      flash(`${rows.length} tasks created for ${clientName || 'the client'} · the team is notified`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${qs.scrim} ${qs.asScrim}`} onClick={onClose}>
      <div className={`${qs.dialog} ${qs.dialogWide}`} role="dialog" aria-modal="true" aria-label="Assign tasks" onClick={e => e.stopPropagation()}>
        <div className={qs.asHead}>
          <div className={qs.asWho}>
            <span className={qs.dlgTitle}>Assign tasks · {quote.no} · {clientName || '—'}</span>
            <span className={qs.dlgSub}>
              {done ? `Assigned on ${dmy(quote.assignedOn)}` : `Accepted ${dmy(quote.acceptedOn)} · due dates = start + each item’s est. days from the Product List`}
            </span>
          </div>
          {done ? null : (
            <label className={qs.asStart}>
              Start on
              <input
                className={qs.date}
                type="date"
                onClick={pickDate}
                value={start}
                onChange={e => {
                  const v = e.target.value
                  if (!v) return
                  setStart(v)
                  setRows(rs => rs.map(r => ({ ...r, start: v, due: r.days ? addDays(v, r.days) : r.due })))
                }}
              />
            </label>
          )}
          <button type="button" className={qs.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className={qs.asScroll}>
          <div className={`${qs.asRow} ${qs.asRowHead}`}><span>Task</span><span>Team</span><span>Assign to</span><span>Start</span><span>Due</span><span style={{ textAlign: 'right' }}>Days</span></div>
          {rows.map((r, i) => {
            const tone = teamTone(r.team)
            const late = !!r.eta && r.due > r.eta
            return (
              <div key={r.key} className={qs.asRow}>
                <span className={qs.asTask}>
                  <b>{r.name}</b>
                  <span className={qs.asFrom}>
                    {r.track && r.project ? <><Link className={qs.asTrack} href={`/marketing/projects/${r.project}`}>{r.track}</Link> · </> : null}
                    {r.from}
                  </span>
                </span>
                <span><span className={qs.team} style={{ background: `var(--mk-team-${tone}-bg)`, color: `var(--mk-team-${tone})` }}>{r.team}</span></span>
                <span style={{ display: 'flex', minWidth: 0 }}>
                  <select className={`${qs.whoSel}${r.who ? '' : ` ${qs.whoSelMiss}`}`} value={r.who ?? ''} disabled={done} aria-label={`Assign ${r.name} to`} onChange={e => setRow(i, { who: e.target.value || null })}>
                    <option value="">Pick someone…</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</option>)}
                  </select>
                </span>
                <input className={`${qs.date} ${qs.dateSm}`} type="date" onClick={pickDate} value={r.start} disabled={done} aria-label="Start"
                  onChange={e => { const v = e.target.value; if (v) setRow(i, { start: v, due: r.days ? addDays(v, r.days) : r.due < v ? v : r.due }) }} />
                <span className={qs.asDue}>
                  <input className={`${qs.date} ${qs.dateSm}${late ? ` ${qs.dateLate}` : ''}`} type="date" onClick={pickDate} value={r.due} min={r.start} disabled={done} aria-label="Due"
                    onChange={e => { const v = e.target.value; if (v) setRow(i, { due: v < r.start ? r.start : v }) }} />
                  {late ? <span className={qs.asLate}>After the quoted delivery {dmy(r.eta)}</span> : null}
                </span>
                <span className={qs.asDays}>{r.days ? `${r.days} d` : '—'}</span>
              </div>
            )
          })}
        </div>
        <div className={qs.asFoot}>
          <span className={qs.asNote} style={!done && unassigned ? { color: 'rgb(var(--mk-red))' } : undefined}>
            {done ? 'These tasks are on the team’s calendars.' : unassigned ? `${unassigned} task${unassigned === 1 ? '' : 's'} without a person` : `${rows.length} tasks · each goes to its person’s My Space and Calendar`}
          </span>
          {done ? null : <button type="button" className={qs.ghost} onClick={onClose}>Assign later</button>}
          <button type="button" className={qs.primary} style={{ opacity: !done && unassigned ? 0.45 : 1 }} disabled={busy} onClick={() => void create()}>
            {done ? 'Close' : `Create ${rows.length} task${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
