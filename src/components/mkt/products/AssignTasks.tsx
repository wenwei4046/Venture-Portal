'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { assignMktQuote } from '@/lib/marketing/quote-actions'
import { groupTone } from '@/lib/marketing/groups'
import { addDays, buildTasks, coreOf, dmy, quoteTotals, rm, teamTone, type Quote, type QuoteBook, type QuoteTask, type Team } from '@/lib/marketing/quotes'
import Modal from './Modal'
import { pickDate } from './pick-date'
import qs from './quotes.module.css'
import v2 from './v2.module.css'

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

  // v2 §6: a centred 680px modal — Task (where it comes from under it) · Assign to · Due (from the start day and each
  // item's est. days) · Days; one Start date for every row.
  return (
    <Modal label="Assign tasks" width={680} onClose={onClose} busy={busy}>
      <div className={v2.asHead}>
        <div className={v2.asWho}>
          <span className={v2.modalTitle}>Assign tasks</span>
          <span className={v2.asSub}>{quote.no} · {clientName || '—'} · {rm(quoteTotals(coreOf(quote, clientName)).total)}</span>
          {done ? <span className={v2.small}>Assigned on {dmy(quote.assignedOn)}</span> : null}
        </div>
        {done ? null : (
          <label className={v2.asStart}>
            Start date
            <input
              className={v2.date}
              type="date"
              onClick={pickDate}
              value={start}
              onChange={e => {
                const v = e.target.value
                if (!v) return
                setStart(v)
                setRows(rs => rs.map(r => ({ ...r, start: v, due: r.days ? addDays(v, r.days) : r.due < v ? v : r.due })))
              }}
            />
          </label>
        )}
        <button type="button" className={v2.x} style={{ marginLeft: 0 }} aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className={v2.asTable}>
        <div className={`${v2.asRow} ${v2.asRowHead}`}><span>Task</span><span>Assign to</span><span>Due</span><span style={{ textAlign: 'right' }}>Days</span></div>
        {rows.map((r, i) => {
          const late = !!r.eta && r.due > r.eta
          return (
            <div key={r.key} className={v2.asRow}>
              <span className={v2.asTask}>
                <b title={r.name}>{r.name}</b>
                <span className={v2.asFrom}>
                  {r.track && r.project ? <><Link className={qs.asTrack} href={`/marketing/projects/${r.project}`}>{r.track}</Link> · </> : null}
                  {r.from}
                </span>
              </span>
              <select className={`${v2.asSel}${r.who ? '' : ` ${v2.asSelMiss}`}`} value={r.who ?? ''} disabled={done} aria-label={`Assign ${r.name} to`} onChange={e => setRow(i, { who: e.target.value || null })}>
                <option value="">Pick someone…</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</option>)}
              </select>
              <span className={v2.field} style={{ gap: 2 }}>
                <input className={v2.date} type="date" onClick={pickDate} value={r.due} min={r.start} disabled={done} aria-label="Due"
                  onChange={e => { const v = e.target.value; if (v) setRow(i, { due: v < r.start ? r.start : v }) }} />
                {late ? <span className={v2.asLate}>After the quoted {dmy(r.eta)}</span> : null}
              </span>
              <span className={v2.asDays}>{r.days ? `${r.days} d` : '—'}</span>
            </div>
          )
        })}
      </div>
      <div className={v2.modalFoot}>
        <span className={v2.asNote} style={!done && unassigned ? { color: 'rgb(var(--mk-red))' } : undefined}>
          {done ? 'These tasks are on the team’s calendars.' : unassigned ? `${unassigned} task${unassigned === 1 ? '' : 's'} without a person` : 'Due dates come from each item’s est. days.'}
        </span>
        <span className={v2.grow} />
        {done ? null : <button type="button" className={v2.ghost} onClick={onClose}>Later</button>}
        <button type="button" className={v2.primary} style={{ opacity: !done && unassigned ? 0.45 : 1 }} disabled={busy} onClick={() => void create()}>
          {done ? 'Close' : `Assign ${rows.length} task${rows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}
