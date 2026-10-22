'use client'

import { useEffect } from 'react'
import { COL_TYPES, type ColType, type FormField } from '@/lib/marketing/tasks'
import b from './builder.module.css'

// A table field's editor (`Workflow Builder.dc.html`, Edit table): its name, its columns across (each named and of a
// kind, + for another, at most 8) and — on a workflow template — its preset rows down (+ Add row, at most 50): a cell
// filled in is fixed for the team, a blank one is theirs to fill in.

export const MAX_COLS = 8
export const MAX_ROWS = 50
const DATE_WORDS = /date|due|deadline/i

export default function TableEditor({
  field,
  stageName,
  presetRows,
  onChange,
  onClose,
}: {
  field: FormField
  stageName: string
  presetRows: boolean
  onChange: (next: FormField) => void
  onClose: () => void
}) {
  const cols = field.cols ?? []
  const rows = presetRows ? field.rows ?? [] : []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (nextCols: { name: string; type: ColType }[], nextRows: string[][]) =>
    onChange({ ...field, cols: nextCols, ...(presetRows ? { rows: nextRows } : {}) })

  const rename = (ci: number, name: string) =>
    set(cols.map((c, k) => (k === ci ? { name, type: c.type === 'Text' && DATE_WORDS.test(name) ? 'Date' : c.type } : c)), rows)
  const retype = (ci: number, type: ColType) => set(cols.map((c, k) => (k === ci ? { ...c, type } : c)), rows)
  const addCol = () => set([...cols, { name: `Column ${cols.length + 1}`, type: 'Text' }], rows.map(r => [...r, '']))
  const removeCol = (ci: number) => set(cols.filter((_, k) => k !== ci), rows.map(r => r.filter((_, k) => k !== ci)))
  const setCell = (ri: number, ci: number, v: string) => set(cols, rows.map((r, k) => (k === ri ? r.map((x, j) => (j === ci ? v : x)) : r)))

  const kind = presetRows ? `Table · ${cols.length} × ${rows.length}` : `Table · ${cols.length} column${cols.length === 1 ? '' : 's'}`

  return (
    <div className={b.tblScrim} onClick={onClose}>
      <div className={b.tblBox} role="dialog" aria-modal="true" aria-label={`Table ${field.label}`} onClick={e => e.stopPropagation()}>
        <div className={b.tblHead}>
          <span className={b.wbGlyph}>▤</span>
          <input
            className={b.tblName}
            value={field.label}
            maxLength={60}
            placeholder="Table name"
            aria-label="Table name"
            onChange={e => onChange({ ...field, label: e.target.value })}
          />
          <span className={b.tblMeta}>{kind}{stageName ? ` · ${stageName}` : ''}</span>
          <button type="button" className={b.tblClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={b.tblBody}>
          <div className={b.tblGrid}>
            <div className={b.tblInner}>
              <div className={b.tblHeadRow}>
                {cols.map((c, ci) => (
                  <div key={ci} className={b.tblColHead}>
                    <div className={b.tblColTop}>
                      <input
                        className={b.tblColName}
                        value={c.name}
                        maxLength={40}
                        placeholder="Column"
                        aria-label="Column name"
                        onChange={e => rename(ci, e.target.value)}
                      />
                      {cols.length > 1 ? (
                        <button type="button" className={b.wbFieldX} aria-label="Remove column" onClick={() => removeCol(ci)}>×</button>
                      ) : null}
                    </div>
                    <select className={b.tblColType} value={c.type} aria-label="Column type" onChange={e => retype(ci, e.target.value as ColType)}>
                      {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
                {cols.length < MAX_COLS ? (
                  <button type="button" className={b.tblAddCol} title="Add column" aria-label="Add column" onClick={addCol}>+</button>
                ) : null}
              </div>
              {rows.map((r, ri) => (
                <div key={ri} className={b.tblRow}>
                  {cols.map((_, ci) => (
                    <div key={ci} className={b.tblCell}>
                      <input
                        className={b.tblCellInput}
                        value={r[ci] ?? ''}
                        maxLength={200}
                        placeholder="Blank — team fills in"
                        aria-label={`Row ${ri + 1}, ${cols[ci]?.name || `column ${ci + 1}`}`}
                        onChange={e => setCell(ri, ci, e.target.value)}
                      />
                    </div>
                  ))}
                  <button type="button" className={b.tblRowX} aria-label="Remove row" onClick={() => set(cols, rows.filter((_, k) => k !== ri))}>×</button>
                </div>
              ))}
              {presetRows && rows.length < MAX_ROWS ? (
                <button type="button" className={b.tblAddRow} onClick={() => set(cols, [...rows, cols.map(() => '')])}>+ Add row</button>
              ) : null}
            </div>
          </div>
        </div>
        <div className={b.tblFoot}>
          <button type="button" className={b.tblDone} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
