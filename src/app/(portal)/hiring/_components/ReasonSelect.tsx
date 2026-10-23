'use client'

import { Select } from '@/components/hrv/select'
import { addTalentReason } from '@/lib/hiring/actions'
import { NEW_REASON, knownReason, pickable } from '@/lib/hiring/reasons'
import type { HiringBankReason, TalentReason } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * A form's reason (Move to Talent Bank, Add to Talent Bank, Edit candidate's Why not selected — 2026-10-24, "do with
 * same" as File types): the reasons that are on, then "+ Add a new reason…" (Edit), which brings a *New reason* field
 * beside it. The name is made into a reason on Save (`sendReason`).
 */
export function ReasonSelect({
  label,
  reasons,
  value,
  newName,
  canAdd,
  onChange,
  onNewName,
}: {
  label: string
  reasons: readonly HiringBankReason[]
  value: string
  newName: string
  canAdd: boolean
  onChange: (value: string) => void
  onNewName: (name: string) => void
}) {
  return (
    <>
      <label className={s.label}>
        <span className={s.labelText}>{label}</span>
        <Select bare className={s.select} value={value} onChange={e => onChange(e.target.value)}>
          {pickable(reasons, value).map(x => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          {canAdd ? <option value={NEW_REASON}>+ Add a new reason…</option> : null}
        </Select>
      </label>
      {value === NEW_REASON ? (
        <label className={s.label}>
          <span className={s.labelText}>New reason *</span>
          <input className={s.input} value={newName} maxLength={60} placeholder="e.g. Salary too high" onChange={e => onNewName(e.target.value)} />
        </label>
      ) : null}
    </>
  )
}

/**
 * The reason a form sends: the one picked — or the one named with "+ Add a new reason…": the list's own when it has
 * that name on, else made now (one that was turned off comes back on, through the database).
 */
export async function sendReason(
  reasons: readonly HiringBankReason[],
  value: string,
  newName: string,
): Promise<{ ok: true; id: TalentReason } | { ok: false; reason: string }> {
  if (value !== NEW_REASON) return value ? { ok: true, id: value } : { ok: false, reason: 'Pick why they are kept.' }
  const name = newName.trim()
  if (!name) return { ok: false, reason: 'Name the new reason.' }
  const known = knownReason(reasons, name)
  if (known) return { ok: true, id: known }
  const added = await addTalentReason(name)
  return added.ok ? { ok: true, id: added.id } : { ok: false, reason: added.reason }
}
