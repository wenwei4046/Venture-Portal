'use client'

import { useState } from 'react'
import { fieldFlags, stageNameOf, TABLE_MAX_COLS, TYPE_GLYPH, type CanvasField, type StageRef } from '@/lib/marketing/canvas'
import c from './canvas.module.css'

// A Table field on the canvas (`Canvas Template Editor.dc.html`): its columns across — each 🎯 its own stage, ⭐ and 👁
// (a click opens the column's settings, + adds one) — and the grid as the team meets it: a preset cell 🔒, a blank one
// to try out (test entries are never kept; Clear test entries).

export default function CanvasTable({
  field,
  stages,
  openCol,
  onCol,
  onAddCol,
}: {
  field: CanvasField
  stages: readonly StageRef[]
  /** The column whose settings are open. */
  openCol: string | null
  onCol: (id: string) => void
  onAddCol: () => void
}) {
  const [cells, setCells] = useState<Record<string, string | boolean>>({})
  const [extra, setExtra] = useState(0)
  const cols = field.cols ?? []
  const rows = field.rows ?? []
  const set = (k: string, v: string | boolean) => setCells(p => ({ ...p, [k]: v }))
  const blank = (r: number, ci: number) => {
    const k = `${r}-${ci}`
    const type = cols[ci]?.type ?? 'Text'
    const label = `Row ${r + 1}, ${cols[ci]?.name || `Column ${ci + 1}`}`
    return type === 'Checkbox' ? (
      <label className={c.tCheckWrap} onClick={e => e.stopPropagation()}>
        <input type="checkbox" className={c.tCheck} aria-label={label} checked={cells[k] === true} onChange={e => set(k, e.target.checked)} />
      </label>
    ) : (
      <input className={c.tInput} type={type === 'Number' ? 'number' : type === 'Date' ? 'date' : 'text'} placeholder={type === 'Number' ? '0' : type === 'Person' ? 'Name' : 'Type here…'}
        aria-label={label} value={typeof cells[k] === 'string' ? (cells[k] as string) : ''} onClick={e => e.stopPropagation()} onChange={e => set(k, e.target.value)} />
    )
  }
  const grid = cols.map(() => 'minmax(110px, 1fr)').join(' ') || '1fr'
  return (
    <>
      <div className={c.colStrip}>
        <div className={c.colRow}>
          {cols.map(col => (
            <button key={col.id} type="button" className={`${c.col}${openCol === col.id ? ` ${c.colOn}` : ''}`} onClick={e => { e.stopPropagation(); onCol(col.id) }}>
              <span className={c.colHead}><span className={c.glyph}>{TYPE_GLYPH[col.type]}</span><span className={c.colName}>{col.name || 'Unnamed column'}</span></span>
              <span className={`${c.colStage}${col.stage && stages.some(s => s.sid === col.stage) ? '' : ` ${c.colStageNone}`}`}>🎯 {stageNameOf(stages, col.stage)}</span>
              <span className={c.colFlags}>{fieldFlags({ req: col.req, pic: col.pic, type: col.type })}</span>
            </button>
          ))}
          {cols.length < TABLE_MAX_COLS ? (
            <button type="button" className={c.colAdd} aria-label="Add column" onClick={e => { e.stopPropagation(); onAddCol() }}>+</button>
          ) : null}
        </div>
      </div>
      <div className={c.table}>
        <div className={c.tScroll}>
          <div className={c.tGrid} style={{ gridTemplateColumns: grid }}>
            {cols.map(col => (
              <div key={`h${col.id}`} className={c.tHead}><span className={c.glyph}>{TYPE_GLYPH[col.type]}</span><span className={c.tHeadName}>{col.name}</span><span className={c.muted}>{col.type}</span></div>
            ))}
            {rows.flatMap((r, ri) => cols.map((col, ci) => ((r[ci] ?? '').trim()
              ? <div key={`p${ri}-${col.id}`} className={`${c.tCell} ${c.tFixed}`} title="Preset — the team can't change this"><span className={c.tLock}>🔒</span>{r[ci]}</div>
              : <div key={`p${ri}-${col.id}`} className={c.tCell} title="Left blank — the team fills this in">{blank(ri, ci)}</div>)))}
            {Array.from({ length: 1 + extra }, (_, ei) => cols.map((col, ci) => (
              <div key={`e${ei}-${col.id}`} className={c.tCell} title="Left blank — the team fills this in">{blank(rows.length + ei, ci)}</div>
            )))}
          </div>
        </div>
        <div className={c.tFoot}>
          <button type="button" className={c.tAdd} onClick={e => { e.stopPropagation(); setExtra(n => n + 1) }}>+ Add row</button>
          <button type="button" className={c.tClear} disabled={!Object.keys(cells).length && !extra} onClick={e => { e.stopPropagation(); setCells({}); setExtra(0) }}>Clear test entries</button>
          <span className={c.tKeyRight}>🔒 Preset — can&apos;t be changed</span>
          <span className={c.tKey}><span className={c.tKeyBlank} />Blank — filled in by the team</span>
        </div>
      </div>
      {field.cols?.length ? null : <span className={c.popWarn}>{`"${field.label || 'This table'}" needs a column`}</span>}
    </>
  )
}
