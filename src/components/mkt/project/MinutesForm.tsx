'use client'

import type { MktPerson } from '@/lib/marketing/board'
import { COL_GLYPH, tableAnswer, type MinutesField } from '@/lib/marketing/minutes'
import { attendeesOf, isPeriod, type MinutesDoc, type MinutesValue } from '@/lib/marketing/project'
import p from './project.module.css'

// Meeting minutes as they are written (`New Project.dc.html` step 2, on the product's intake template): each field as its
// kind asks — text, a date, a campaign's run period, a number, people from the team, a typed table, the Free space, the
// project it is for — with
// ⭐ (required) and 👁 / 🔒 (the PIC sees it, or it stays internal); the signatures of those who attended, each signing
// for themselves. Read-only when the viewer does not write minutes or they are locked.

const FREE_COLS = ['Item', 'Details', 'Owner']

export default function MinutesForm({
  doc,
  vals,
  track,
  title,
  team,
  me,
  readOnly,
  onVal,
  onSign,
  signing,
}: {
  doc: MinutesDoc
  vals: Record<string, MinutesValue>
  track: string
  title: string
  team: MktPerson[]
  me: string | null
  readOnly: boolean
  onVal: (name: string, v: MinutesValue | undefined) => void
  onSign: () => void
  signing: boolean
}) {
  const nameOf = (id: string) => team.find(x => x.id === id)?.first || 'Somebody'
  const attendees = attendeesOf(doc.template.fields, vals)
  const signable = !doc.locked && doc.status !== 'completed'

  const marks = (f: MinutesField) => (
    <span className={p.marks}>
      {f.req || f.lock ? <span title="Required">⭐</span> : null}
      {f.pic ? <span title="The PIC sees it on the link">👁</span> : <span title="Internal only — the PIC never sees it">🔒</span>}
    </span>
  )

  // A Table (Minutes Builder v2): its starting rows until somebody writes in it; rows added and taken off only where the
  // template lets the staff add rows, columns of their own only where it lets them add columns.
  const table = (f: MinutesField, v: MinutesValue | undefined) => {
    const free = f.type === 'Free space'
    const cur = typeof v === 'object' && !Array.isArray(v) && !isPeriod(v) ? v : null
    const ans = free ? null : tableAnswer(f, cur ?? undefined)
    const own = free ? 0 : (f.cols ?? []).length
    const cols = free ? cur?.cols ?? FREE_COLS : ans?.cols ?? []
    const types = free ? cols.map(() => 'Text' as const) : ans?.types ?? []
    const xcols = ans?.xcols ?? []
    const rows = free ? (cur?.rows?.length ? cur.rows : [cols.map(() => '')]) : ans?.rows ?? []
    const canRow = !readOnly && (free || f.staffRows !== false)
    const canCol = !readOnly && cols.length < 8 && (free || f.staffCols === true)
    const put = (next: { rows: string[][]; cols?: string[]; xcols?: string[] }) => {
      if (free) return onVal(f.name, { cols: next.cols ?? cols, rows: next.rows })
      const x = next.xcols ?? xcols
      onVal(f.name, x.length ? { rows: next.rows, xcols: x } : { rows: next.rows })
    }
    const named = (ci: number) => free || ci >= own // a column the staff named, theirs to rename
    return (
      <div className={p.table}>
        <div className={p.tScroll}>
          <div className={p.tGrid} style={{ gridTemplateColumns: `${cols.map(() => 'minmax(120px, 1fr)').join(' ')}${canRow ? ' 30px' : ''}` }}>
            {cols.map((c, ci) => (
              <div key={`h${ci}`} className={p.tHead}>
                {named(ci) && !readOnly ? (
                  <input className={p.tHeadInput} value={c} maxLength={40} aria-label={`Column ${ci + 1} name`}
                    onChange={e => free
                      ? put({ rows, cols: cols.map((x, j) => (j === ci ? e.target.value : x)) })
                      : put({ rows, xcols: xcols.map((x, j) => (j === ci - own ? e.target.value : x)) })} />
                ) : (
                  <><span className={p.glyph}>{free ? 'Aa' : COL_GLYPH[types[ci]]}</span><span>{c}</span></>
                )}
              </div>
            ))}
            {canRow ? <div className={p.tHead} /> : null}
            {rows.map((r, ri) => (
              <div key={`r${ri}`} className={p.tRow} style={{ display: 'contents' }}>
                {cols.map((_, ci) => (
                  <div key={`c${ri}-${ci}`} className={p.tCell}>
                    <input
                      className={p.tInput}
                      type={types[ci] === 'Date' ? 'date' : types[ci] === 'Number' ? 'number' : 'text'}
                      value={r[ci] ?? ''}
                      maxLength={500}
                      readOnly={readOnly}
                      aria-label={`${f.name} row ${ri + 1}, ${cols[ci] || `column ${ci + 1}`}`}
                      onChange={e => put({ rows: rows.map((x, j) => (j === ri ? cols.map((__, k) => (k === ci ? e.target.value : x[k] ?? '')) : x)) })}
                    />
                  </div>
                ))}
                {canRow ? (
                  <button type="button" className={p.tX} aria-label={`Remove row ${ri + 1}`} onClick={() => put({ rows: rows.filter((_, j) => j !== ri) })}>×</button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {canRow || canCol ? (
          <div className={p.tFoot}>
            {canRow ? <button type="button" className={p.tAdd} disabled={rows.length >= 50} onClick={() => put({ rows: [...rows, cols.map(() => '')] })}>+ Add row</button> : null}
            {canCol ? (
              <button type="button" className={p.tAdd} onClick={() => free
                ? put({ cols: [...cols, ''], rows: rows.map(r => [...r, '']) })
                : put({ xcols: [...xcols, ''], rows: rows.map(r => [...r, '']) })}>+ Add column</button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const people = (f: MinutesField, v: MinutesValue | undefined) => {
    const ids = Array.isArray(v) ? v : []
    const free = team.filter(x => !ids.includes(x.id))
    return (
      <div className={p.people}>
        {ids.map(id => (
          <span key={id} className={p.person}>
            {nameOf(id)}
            {readOnly ? null : <button type="button" className={p.personX} aria-label={`Remove ${nameOf(id)}`} onClick={() => onVal(f.name, ids.filter(x => x !== id))}>×</button>}
          </span>
        ))}
        {readOnly ? (ids.length ? null : <span className={p.muted}>—</span>) : (
          <select className={p.addPerson} value="" aria-label={`Add to ${f.name}`} onChange={e => e.target.value && onVal(f.name, [...ids, e.target.value])}>
            <option value="">+ Add…</option>
            {free.map(x => <option key={x.id} value={x.id}>{x.first}{x.title ? ` · ${x.title}` : ''}</option>)}
          </select>
        )}
      </div>
    )
  }

  // A campaign's run period (the user's answer 13): its first day, then its last — not before the first.
  const period = (f: MinutesField, v: MinutesValue | undefined) => {
    const cur = isPeriod(v) ? v : { from: '', to: '' }
    return (
      <div className={p.period}>
        <input className={p.input} type="date" value={cur.from} readOnly={readOnly} aria-label={`${f.name} from`}
          onChange={e => onVal(f.name, { from: e.target.value, to: cur.to })} />
        <span className={p.muted}>to</span>
        <input className={p.input} type="date" value={cur.to} min={cur.from || undefined} readOnly={readOnly} aria-label={`${f.name} to`}
          onChange={e => onVal(f.name, { from: cur.from, to: e.target.value })} />
      </div>
    )
  }

  const field = (f: MinutesField) => {
    const v = vals[f.name]
    const text = typeof v === 'string' ? v : ''
    let input: React.ReactNode
    if (f.type === 'Project link') input = <div className={p.fixed}><span className={p.mono}>{track}</span> · {title}</div>
    else if (f.type === 'Signature') {
      input = (
        <div className={p.signs}>
          {attendees.length ? attendees.map(id => {
            const at = doc.signed[id]
            const mine = id === me
            return (
              <div key={id} className={`${p.sign}${at ? ` ${p.signDone}` : ''}`}>
                <span className={p.signName}>{nameOf(id)}</span>
                {at ? <span className={p.signOk}>Signed</span>
                  : mine && signable ? <button type="button" className={p.signBtn} disabled={signing} onClick={onSign}>{signing ? 'Signing…' : 'Sign'}</button>
                  : <span className={p.signWait}>Waiting</span>}
              </div>
            )
          }) : <span className={p.muted}>No attendees yet</span>}
        </div>
      )
    } else if (f.type === 'People') input = people(f, v)
    else if (f.type === 'Table' || f.type === 'Free space') input = table(f, v)
    else if (f.type === 'Campaign period') input = period(f, v)
    else if (f.type === 'Long text') input = <textarea className={p.textarea} rows={3} value={text} maxLength={4000} readOnly={readOnly} aria-label={f.name} onChange={e => onVal(f.name, e.target.value)} />
    else {
      input = (
        <input
          className={p.input}
          type={f.type === 'Date' ? 'date' : 'text'}
          inputMode={f.type === 'Number' ? 'decimal' : undefined}
          value={text}
          maxLength={f.type === 'Short text' || f.type === 'Title' ? 200 : 40}
          readOnly={readOnly}
          aria-label={f.name}
          onChange={e => onVal(f.name, e.target.value)}
        />
      )
    }
    return (
      <div key={f.name} className={p.field}>
        <span className={p.fieldLabel}>{f.name}{marks(f)}</span>
        {f.help ? <span className={p.fieldHelp}>{f.help}</span> : null}
        {input}
      </div>
    )
  }

  return (
    <div className={p.fields}>
      {doc.template.fields.map(field)}
    </div>
  )
}
