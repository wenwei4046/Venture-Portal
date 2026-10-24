'use client'

import { useState } from 'react'
import { btn } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { CONTRACT_MONTH_CHOICES, contractEnd, dayLabel, isDay, monthsLabel } from '@/lib/employment-status'
import { RENEWAL_LETTER_TYPE, renewalMonths, renewalRefusal, renewalStart } from '@/lib/contract-renewal'
import { lettersRefusal, pendingLetter, suggestedLetterType, type LetterChoice, type PendingLetter } from '@/lib/documentation/attach'
import { letterTypeOf } from '@/lib/documentation/file-letters'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import { renewContract } from '../contract-actions'
import AttachLetters from './AttachLetters'
import type { TermFacts } from './Employment'
import w from '../../_components/person-well.module.css'
import r from './renew-contract.module.css'

/**
 * Renew, opened on the contract's line of a person's Employment well (2026-10-24 — the user: "当它已经 expired 之后，到时候
 * 按一下 renew，就可以再选一次是几个月，对不对？同时要 attach 一个新的 contract"): the new contract's first day — the day after
 * this one ends — its period from the contract periods, the day it ends, and the new contract itself, its letter type
 * the one that says contract. The file goes up first, then `renewContract` renews and files it to their Data center
 * record together (lib/contract-renewal.ts).
 */
export default function RenewContract({
  personId,
  personName,
  contract,
  types,
  onCancel,
  onDone,
}: {
  personId: string
  personName: string
  contract: TermFacts
  types: readonly LetterChoice[]
  onCancel: () => void
  onDone: () => void
}) {
  const [start, setStart] = useState(() => renewalStart(contract.endsOn) ?? '')
  const [months, setMonths] = useState(() => renewalMonths(contract.months))
  const [letter, setLetter] = useState<PendingLetter[]>(() => [pendingLetter(suggestedLetterType(types, RENEWAL_LETTER_TYPE))])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ends = isDay(start) ? contractEnd(start, months) : null

  async function renew() {
    if (busy) return
    const row = letter[0]
    const refused =
      renewalRefusal({ startsOn: contract.startsOn ?? contract.hireDate, months: contract.months, endsOn: contract.endsOn }, start, months) ??
      (row?.file ? lettersRefusal(letter) : 'Attach the new contract.')
    if (refused || !row?.file || !contract.endsOn) return setError(refused ?? 'Attach the new contract.')
    setBusy(true)
    setError(null)
    try {
      const type = await letterTypeOf(row, types)
      if (!type.ok) return setError(type.reason)
      const up = await uploadDocumentationFile({ letterFor: personId }, row.file)
      if (!up.ok) return setError(up.reason)
      const done = await renewContract({
        staffId: personId,
        start,
        months,
        endsWas: contract.endsOn,
        letter: { typeId: type.id, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size },
      })
      if (!done.ok) return setError(done.reason)
      flash(`Contract renewed to ${dayLabel(done.endsOn)} · ${type.name} filed to ${personName}'s record`)
      onDone()
    } catch {
      setError('Could not renew it. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={r.renew} role="group" aria-label="Renew the contract">
      <div className={r.fields}>
        <label className={r.field}>
          <span className={w.label}>New contract starts</span>
          <input
            type="date"
            value={start}
            disabled={busy}
            onChange={e => {
              setStart(e.target.value)
              setError(null)
            }}
            className={r.input}
          />
        </label>
        <label className={r.field}>
          <span className={w.label}>Period</span>
          <Select
            value={String(months)}
            disabled={busy}
            onChange={e => {
              setMonths(Number(e.target.value))
              setError(null)
            }}
            className={r.select}
          >
            {CONTRACT_MONTH_CHOICES.map(n => (
              <option key={n} value={String(n)}>
                {monthsLabel(n)}
              </option>
            ))}
          </Select>
        </label>
        <div className={r.field}>
          <span className={w.label}>Ends</span>
          <span className={`${w.value} ${r.ends}`}>{ends ? dayLabel(ends) : '—'}</span>
        </div>
      </div>
      <div className={r.field}>
        <span className={w.label}>New contract</span>
        <AttachLetters
          single
          types={types}
          rows={letter}
          onChange={rows => {
            setLetter(rows)
            setError(null)
          }}
          idPrefix="renew-letter"
          disabled={busy}
        />
      </div>
      {error ? <div className="sheet-danger mt-0 mb-0">{error}</div> : null}
      <span className={w.actions}>
        <button type="button" onClick={renew} disabled={busy} className={btn('primary')}>
          {busy ? 'Renewing…' : 'Renew'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btn('outline')}>
          Cancel
        </button>
      </span>
    </div>
  )
}
