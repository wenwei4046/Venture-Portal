'use client'

import { Select } from '@/components/hrv/select'
import { DOC_ACCEPT, fileExt } from '@/lib/documentation/model'
import { NEW_LETTER_TYPE, pendingLetter, type LetterChoice, type PendingLetter } from '@/lib/documentation/attach'
import s from './attach-letters.module.css'

/**
 * Letters beside the employment status (2026-10-24 — the user: "我们 select 那个 state 的时候，我要他能够 attach 一个
 * form … 当然包括 letter 的 type"): a row a letter — its type (or "+ Add a new letter type…", named there, as the
 * Data center's Upload names one) and its file — and "+ Attach a letter" for another. Held by the form until it saves,
 * then each filed to the person's Data center record (lib/documentation/file-letters.ts). `single`: one letter that is
 * always there — Renew's new contract. The fields wear the form's own classes, as AddressFields' do.
 */
export default function AttachLetters({
  types,
  rows,
  onChange,
  idPrefix,
  single = false,
  disabled = false,
  selectClassName,
  selectBare = false,
  inputClassName,
}: {
  types: readonly LetterChoice[]
  rows: readonly PendingLetter[]
  onChange: (rows: PendingLetter[]) => void
  idPrefix: string
  single?: boolean
  disabled?: boolean
  selectClassName?: string
  selectBare?: boolean
  inputClassName?: string
}) {
  const set = (key: string, patch: Partial<PendingLetter>) => onChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className={s.letters}>
      {rows.map((row, i) => {
        const n = rows.length > 1 ? ` ${i + 1}` : ''
        return (
          <div key={row.key} className={s.row}>
            <Select
              bare={selectBare}
              id={`${idPrefix}-type-${i}`}
              value={row.typeId}
              disabled={disabled}
              onChange={e => set(row.key, { typeId: e.target.value })}
              aria-label={`Letter type${n}`}
              className={[s.type, selectClassName].filter(Boolean).join(' ')}
            >
              <option value="">Letter type…</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={NEW_LETTER_TYPE}>+ Add a new letter type…</option>
            </Select>
            {row.typeId === NEW_LETTER_TYPE ? (
              <input
                id={`${idPrefix}-new-${i}`}
                value={row.newType}
                maxLength={80}
                disabled={disabled}
                placeholder="New letter type"
                aria-label={`New letter type${n}`}
                autoComplete="off"
                onChange={e => set(row.key, { newType: e.target.value })}
                className={[s.name, inputClassName].filter(Boolean).join(' ')}
              />
            ) : null}
            <label className={s.file} data-chosen={row.file ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
              <span className={s.tile} aria-hidden="true">
                {row.file ? fileExt(row.file.name) : '+'}
              </span>
              <span className={s.fileName}>{row.file ? row.file.name : 'Choose a file'}</span>
              <input
                id={`${idPrefix}-file-${i}`}
                type="file"
                accept={DOC_ACCEPT}
                disabled={disabled}
                aria-label={`Letter file${n}`}
                className={s.hiddenFile}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) set(row.key, { file: f })
                  e.target.value = ''
                }}
              />
            </label>
            {single ? null : (
              <button
                type="button"
                className={s.remove}
                disabled={disabled}
                aria-label={`Remove letter${n}`}
                onClick={() => onChange(rows.filter(r => r.key !== row.key))}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      {single ? null : (
        <button type="button" className={s.add} disabled={disabled} onClick={() => onChange([...rows, pendingLetter()])}>
          + Attach a letter
        </button>
      )}
    </div>
  )
}
