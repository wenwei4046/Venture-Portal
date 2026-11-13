'use client'

import { Fragment, useState } from 'react'
import { mayFill, tableNote, type FlowField, type FlowRow, type FlowTask } from '@/lib/marketing/task-flow-view'
import s from './taskflow.module.css'

// A table on the task page (Task Flow.dc.html): each column's name, * when required, "🎯 {stage}"; the doer's own
// columns tinted and editable; + Add row and + Add column (name and type) for the doer; × on the rows and columns the
// doer added (a column added here is this task's alone). Required columns are filled on every row before submit.

/** The kinds a column added here may be (task.ts › TASK_COL_TYPES — what mkt_task_column takes). */
export const COL_TYPES = ['Text', 'Number', 'Date', 'Checkbox', 'Person'] as const

let rowSeq = 0
const newRowId = () => `n${Date.now().toString(36)}${(rowSeq += 1)}`

export default function TaskFlowTable({ task, field, me, showBad, onRows, onAddCol, onDropCol }: {
  task: FlowTask
  field: FlowField
  me: string | null
  showBad: boolean
  onRows: (f: FlowField, rows: FlowRow[], commit: boolean) => void
  onAddCol?: (f: FlowField, name: string, type: string) => void
  onDropCol?: (f: FlowField, col: string) => void
}) {
  const rows = task.rows[field.id] ?? []
  const can = (stage: number | null) => mayFill(task, me, stage)
  const mine = field.cols.some(c => can(c.stage))
  const [adding, setAdding] = useState<{ name: string; type: string } | null>(null)
  const set = (ri: number, col: string, v: string | boolean, commit: boolean) =>
    onRows(field, rows.map((r, j) => (j === ri ? { ...r, cells: { ...r.cells, [col]: v } } : r)), commit)
  const commitCol = () => {
    const name = adding?.name.trim() ?? ''
    if (name && onAddCol) onAddCol(field, name, adding?.type ?? 'Text')
    setAdding(null)
  }
  const grid = `repeat(${field.cols.length}, minmax(120px, 1fr)) 36px`

  return (
    <div className={s.tbl}>
      <div className={s.tblScroll}>
        <div className={s.grid} style={{ gridTemplateColumns: grid, minWidth: field.cols.length * 120 + 36 }} role="table" aria-label={field.label}>
          {field.cols.map(c => (
            <div key={c.id} className={s.th} role="columnheader">
              <span className={s.thName}>{c.name}{c.req ? <span className={s.star}> *</span> : null}</span>
              <div className={s.thFoot}>
                <span className={`${s.thStage}${can(c.stage) ? ` ${s.thMine}` : ''}`}>🎯 {c.stage === null ? 'Any' : task.stages[c.stage]?.name ?? 'Any'}</span>
                {mine && c.added && onDropCol ? (
                  <button type="button" className={s.x} title="Remove column" aria-label={`Remove column ${c.name}`} onClick={() => onDropCol(field, c.id)}>×</button>
                ) : null}
              </div>
            </div>
          ))}
          <div className={s.thEnd} />
          {rows.map((row, ri) => (
            <Fragment key={row.id}>
              {field.cols.map(c => {
                const v = row.cells[c.id]
                const edit = can(c.stage)
                const isCheck = c.type === 'Checkbox'
                const bad = edit && showBad && c.req && !isCheck && (v === undefined || v === '')
                return (
                  <div key={c.id} className={`${s.td}${edit ? ` ${s.tdMine}` : ''}`} role="cell">
                    {edit && isCheck ? (
                      <button type="button" className={`${s.box}${v === true ? ` ${s.boxOn}` : ''}`} aria-pressed={v === true} aria-label={`${c.name} row ${ri + 1}`}
                        onClick={() => set(ri, c.id, v !== true, true)}>{v === true ? '✓' : ''}</button>
                    ) : edit ? (
                      <input className={`${s.cellInput}${bad ? ` ${s.bad}` : ''}`} aria-label={`${c.name} row ${ri + 1}`}
                        type={c.type === 'Date' ? 'date' : c.type === 'Number' ? 'number' : 'text'} value={typeof v === 'string' ? v : ''}
                        placeholder={c.type === 'File' ? 'Paste link' : 'Type…'}
                        onChange={e => set(ri, c.id, e.target.value, false)} onBlur={e => set(ri, c.id, e.target.value, true)} />
                    ) : (
                      <span className={`${s.cellText}${v === true ? ` ${s.cellOk}` : v ? '' : ` ${s.cellEmpty}`}`}>{v === true ? '✓' : v ? String(v) : '—'}</span>
                    )}
                  </div>
                )
              })}
              <div className={s.td} role="cell">
                {mine && row.added ? (
                  <button type="button" className={s.rowX} title="Remove row" aria-label={`Remove row ${ri + 1}`}
                    onClick={() => onRows(field, rows.filter((_, j) => j !== ri), true)}>×</button>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className={s.tblFoot}>
        {mine && onAddCol && !adding ? <button type="button" className={s.dash} onClick={() => setAdding({ name: '', type: 'Text' })}>+ Add column</button> : null}
        {adding ? (
          <div className={s.addCol}>
            <input className={s.colInput} autoFocus value={adding.name} placeholder="Column name, Enter" aria-label="Column name" maxLength={40}
              onChange={e => setAdding({ ...adding, name: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') commitCol()
                else if (e.key === 'Escape') setAdding(null)
              }} />
            <select className={s.colType} value={adding.type} aria-label="Column type" onChange={e => setAdding({ ...adding, type: e.target.value })}>
              {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className={s.colAdd} onClick={commitCol}>Add</button>
            <button type="button" className={s.colCancel} onClick={() => setAdding(null)}>Cancel</button>
          </div>
        ) : null}
        {mine ? (
          <button type="button" className={s.dash} onClick={() => onRows(field, [...rows, { id: newRowId(), cells: {}, added: true }], true)}>+ Add row</button>
        ) : null}
        <span className={s.tblNote}>{tableNote(task, field, mine)}</span>
      </div>
    </div>
  )
}

