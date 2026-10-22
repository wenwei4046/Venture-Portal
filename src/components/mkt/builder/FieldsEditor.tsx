'use client'

import { useState, type KeyboardEvent } from 'react'
import { FIELD_GLYPH, FIELD_TYPES, type FieldType, type FormField } from '@/lib/marketing/tasks'
import TableEditor from './TableEditor'
import b from './builder.module.css'

// What a stage fills in (`Workflow Builder.dc.html`): its fields, each with its glyph, its name (a note's words, in
// italic on cream), its kind and ✕ — a table's columns in a line under it with Edit table — and a field added by name
// and kind (Enter). A table opens its editor as it is added.

export const MAX_FIELDS = 20

const NEW_TABLE_COLS: NonNullable<FormField['cols']> = [
  { name: 'Item', type: 'Text' },
  { name: 'Qty', type: 'Number' },
  { name: 'Done', type: 'Checkbox' },
]

export default function FieldsEditor({
  form,
  onChange,
  presetRows,
  stageName,
}: {
  form: FormField[]
  onChange: (next: FormField[]) => void
  /** A workflow template's tables keep preset rows; a quick task's do not (yet). */
  presetRows: boolean
  stageName: string
}) {
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<FieldType>('Text')
  const [table, setTable] = useState<number | null>(null)

  const setField = (j: number, next: FormField) => onChange(form.map((f, k) => (k === j ? next : f)))
  const add = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !draft.trim() || form.length >= MAX_FIELDS) return
    e.preventDefault()
    const f: FormField = kind === 'Table'
      ? { label: draft.trim(), type: 'Table', cols: NEW_TABLE_COLS.map(c => ({ ...c })), ...(presetRows ? { rows: [] } : {}) }
      : { label: draft.trim(), type: kind }
    onChange([...form, f])
    setDraft('')
    if (kind === 'Table') setTable(form.length)
  }
  const open = table !== null && form[table]?.type === 'Table' ? form[table] : null

  return (
    <div className={b.wbFields}>
      {form.map((f, j) => {
        const cols = f.cols ?? []
        const rows = presetRows ? f.rows ?? [] : []
        const kindText = f.type === 'Note' ? 'Note · read-only'
          : f.type === 'Table' ? (presetRows ? `Table · ${cols.length} × ${rows.length}` : `Table · ${cols.length} column${cols.length === 1 ? '' : 's'}`)
          : f.type
        return (
          <div key={j} className={`${b.wbFieldRow}${f.type === 'Note' ? ` ${b.wbFieldNote}` : ''}`}>
            <div className={b.wbFieldLine}>
              <span className={b.wbGlyph}>{FIELD_GLYPH[f.type]}</span>
              <input
                className={`${b.wbFieldName}${f.type === 'Note' ? ` ${b.wbFieldNameNote}` : ''}`}
                value={f.label}
                maxLength={f.type === 'Note' ? 300 : 60}
                onChange={e => setField(j, { ...f, label: e.target.value })}
                aria-label={f.type === 'Note' ? 'Note' : 'Field name'}
              />
              <span className={b.wbFieldType}>{kindText}</span>
              <button type="button" className={b.wbFieldX} onClick={() => onChange(form.filter((_, k) => k !== j))} aria-label="Remove field">×</button>
            </div>
            {f.type === 'Table' ? (
              <div className={b.wbTblLine}>
                <span className={b.wbTblSum}>
                  {cols.map(c => c.name || '…').join(' · ')}
                  {rows.length ? ` — ${rows.length} preset row${rows.length === 1 ? '' : 's'}` : ''}
                </span>
                <button type="button" className={b.wbTblEdit} onClick={() => setTable(j)}>Edit table</button>
              </div>
            ) : null}
          </div>
        )
      })}
      {form.length < MAX_FIELDS ? (
        <div className={b.wbFieldAdd}>
          <input
            className={b.wbFieldInput}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={add}
            maxLength={kind === 'Note' ? 300 : 60}
            placeholder={kind === 'Note' ? '+ Note for this stage, Enter' : kind === 'Table' ? '+ Table name, Enter' : '+ Field name, Enter'}
            aria-label="New field"
          />
          <select className={b.wbSelect} value={kind} onChange={e => setKind(e.target.value as FieldType)} aria-label="Field type">
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      ) : null}
      {open && table !== null ? (
        <TableEditor field={open} stageName={stageName} presetRows={presetRows} onChange={next => setField(table, next)} onClose={() => setTable(null)} />
      ) : null}
    </div>
  )
}
