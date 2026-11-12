'use client'

import { useEffect, useState } from 'react'
import {
  addCol, addStartRow, COL_GLYPH, MAX_COLS, MAX_ROWS, MINUTES_COL_TYPES, moveCol, nameCol, removeCol, removeStartRow, setStartCell, startRows, typeCol,
  type MinutesField,
} from '@/lib/marketing/minutes'
import m from './minutes.module.css'

// A Table field's editor (v2, the handoff's merged table): the header row is its columns — a click opens that column's
// settings in a popover under it (above it only when there is no room below) — the body its starting rows, every
// meeting's; "+" adds a column, "+ Add row" a row. Columns added, removed or moved keep the rows' cells in place. Then
// whether the staff may add rows (on unless turned off) and columns (off unless turned on).

type Pop = { ci: number; x: number; y: number }

export default function MinutesTableEditor({ field, onChange, closeTick }: {
  field: MinutesField
  onChange: (f: MinutesField) => void
  /** Bumped when the center column scrolls: the popover closes. */
  closeTick: number
}) {
  const [pop, setPop] = useState<Pop | null>(null)
  const cols = field.cols ?? []
  const rows = startRows(field)
  const col = pop ? cols[pop.ci] : undefined

  useEffect(() => setPop(null), [closeTick])
  useEffect(() => {
    if (!pop) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [pop])

  /** Under the header (6px), flipped above only when under 240px is left below and 240px is there above. */
  const place = (el: HTMLElement, ci: number): Pop => {
    const r = el.getBoundingClientRect()
    const W = window.innerWidth
    const H = window.innerHeight
    return { ci, x: Math.max(10, Math.min(r.left, W - 350)), y: H - r.bottom >= 240 || r.top < 240 ? r.bottom + 6 : r.top - 230 }
  }

  return (
    <div className={m.tblock}>
      <div className={m.thead}>
        <span className={m.flabelText}>Table</span>
        <span className={m.tcount}>{cols.length} of {MAX_COLS} cols · {rows.length} rows</span>
      </div>
      <div className={m.tbox}>
        <table className={m.table}>
          <thead>
            <tr>
              <th className={m.tnum} />
              {cols.map((c, ci) => {
                const on = pop?.ci === ci
                return (
                  <th key={ci} className={`${m.tcol}${on ? ` ${m.tcolOn}` : ''}`}>
                    <button
                      type="button"
                      className={m.tcolBtn}
                      aria-expanded={on}
                      aria-label={`Column ${c.name.trim() || 'Untitled'} · ${c.type}`}
                      onClick={e => setPop(on ? null : place(e.currentTarget.closest('th') ?? e.currentTarget, ci))}
                    >
                      <div className={m.tcolTop}>
                        <span className={m.tcolGlyph}>{COL_GLYPH[c.type]}</span>
                        <span className={`${m.tcolName}${c.name.trim() ? '' : ` ${m.tcolNameBad}`}`}>{c.name.trim() || 'Untitled'}</span>
                      </div>
                      <div className={m.tcolType}>{c.type}</div>
                    </button>
                  </th>
                )
              })}
              <th className={m.tadd}>
                {cols.length < MAX_COLS ? (
                  <button
                    type="button"
                    className={m.taddBtn}
                    title="Add column"
                    aria-label="Add column"
                    onClick={e => {
                      const th = e.currentTarget.closest('th')
                      onChange(addCol(field))
                      // Its settings open under the new header once it is drawn.
                      requestAnimationFrame(() => {
                        const head = th?.previousElementSibling as HTMLElement | null
                        if (head) setPop(place(head, cols.length))
                        else setPop({ ci: cols.length, x: 10, y: 10 })
                      })
                    }}
                  >
                    +
                  </button>
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td className={m.trn}>{ri + 1}</td>
                {r.map((v, ci) => (
                  <td key={ci} className={m.tcell}>
                    <input
                      className={m.cellInput}
                      // A Date column's starting cell is picked on the calendar, as the minutes will ask it.
                      type={cols[ci]?.type === 'Date' ? 'date' : cols[ci]?.type === 'Number' ? 'number' : 'text'}
                      value={v}
                      maxLength={500}
                      placeholder="—"
                      aria-label={`Row ${ri + 1}, ${cols[ci]?.name.trim() || `column ${ci + 1}`}`}
                      onChange={e => onChange(setStartCell(field, ri, ci, e.target.value))}
                    />
                  </td>
                ))}
                <td className={m.tx}>
                  <button type="button" className={m.txBtn} title="Remove row" aria-label={`Remove row ${ri + 1}`} disabled={rows.length < 2} onClick={() => onChange(removeStartRow(field, ri))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={m.taddRow} disabled={rows.length >= MAX_ROWS} onClick={() => onChange(addStartRow(field))}>+ Add row</button>
      </div>

      {pop && col ? (
        <>
          <div className={m.popScrim} onClick={() => setPop(null)} />
          <div className={m.colPop} role="dialog" aria-label="Column settings" style={{ left: pop.x, top: pop.y }}>
            <div className={m.popHead}>
              <span className={m.popLabel}>Column settings</span>
              <button type="button" className={m.popX} aria-label="Close" onClick={() => setPop(null)}>×</button>
            </div>
            <label className={m.flabel}>
              <span className={m.flabelText}>What&apos;s this column called?</span>
              <input className={m.popInput} value={col.name} maxLength={40} placeholder="Column name" onChange={e => onChange(nameCol(field, pop.ci, e.target.value))} />
            </label>
            <div className={m.flabel}>
              <span className={m.flabelText}>What kind of answer?</span>
              <div className={m.ckinds} role="radiogroup" aria-label="What kind of answer?">
                {MINUTES_COL_TYPES.map(k => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={col.type === k}
                    className={`${m.ckind}${col.type === k ? ` ${m.ckindOn}` : ''}`}
                    onClick={() => onChange(typeCol(field, pop.ci, k))}
                  >
                    <span className={m.ckindGlyph}>{COL_GLYPH[k]}</span>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className={m.popFoot}>
              <button type="button" className={m.popMove} disabled={pop.ci === 0} onClick={() => { onChange(moveCol(field, pop.ci, -1)); setPop({ ...pop, ci: pop.ci - 1 }) }}>← Move</button>
              <button type="button" className={m.popMove} disabled={pop.ci === cols.length - 1} onClick={() => { onChange(moveCol(field, pop.ci, 1)); setPop({ ...pop, ci: pop.ci + 1 }) }}>Move →</button>
              <span className={m.grow} />
              <button type="button" className={m.popDel} disabled={cols.length < 2} onClick={() => { onChange(removeCol(field, pop.ci)); setPop(null) }}>Remove column</button>
            </div>
          </div>
        </>
      ) : null}

      <div className={m.toggles}>
        {([['staffRows', 'Staff can add rows', field.staffRows !== false], ['staffCols', 'Staff can add columns', field.staffCols === true]] as const).map(([k, label, on]) => (
          <button key={k} type="button" role="switch" aria-checked={on} className={m.toggle} onClick={() => onChange({ ...field, [k]: !on })}>
            <span className={`${m.sw}${on ? ` ${m.swOn}` : ''}`} aria-hidden="true"><span className={m.knob} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
