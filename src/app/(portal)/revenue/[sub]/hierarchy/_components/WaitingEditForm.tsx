'use client'

import { hv } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { ANY_TIME, ANY_TIME_LABEL, isAnyTime } from '@/lib/member/waiting-start'
import type { SubmitterGroup, WaitingEditDraft } from '@/lib/commission/waiting-add'
import s from './sales-groups.module.css'
import w from './waiting.module.css'

/**
 * An applicant's drawer, edited (2026-10-20, the user: "要能够按 Edit：这个 Edit 本身是让 HR 可以去改资料的"): what "+"
 * asks, in the drawer's order — the name, the mobile number, the joining date (a day, or *Any time ready*) and
 * who brought them in (anybody in the Revenue department). The department is the list's and stays. A changed
 * field turns peach, as on a person's page.
 */
export default function WaitingEditForm({
  draft,
  was,
  wasSubmitter,
  submitters,
  subDeptName,
  disabled,
  onChange,
}: {
  draft: WaitingEditDraft
  /** The applicant as the drawer drew them. */
  was: WaitingEditDraft
  /** Who brought them in, by name — kept among the choices when they are not in the department's list any more. */
  wasSubmitter: string | null
  submitters: SubmitterGroup[]
  subDeptName: string
  disabled: boolean
  onChange: (patch: Partial<WaitingEditDraft>) => void
}) {
  const anyTime = isAnyTime(draft.start)
  const changed = (key: keyof WaitingEditDraft) =>
    (key === 'name' || key === 'contact' ? draft[key].trim() !== was[key].trim() : draft[key] !== was[key]) ? 'true' : undefined
  const listed = submitters.some(g => g.people.some(p => p.id === was.submittedBy))

  return (
    <div className={w.editFields}>
      <label className={s.addField}>
        <span>New member name</span>
        <input
          className={`${hv.input} ${w.addInput}`}
          data-dirty={changed('name')}
          value={draft.name}
          onChange={e => onChange({ name: e.target.value })}
          maxLength={160}
          disabled={disabled}
        />
      </label>
      <label className={s.addField}>
        <span>Mobile number</span>
        <input
          className={`${hv.input} ${w.addInput}`}
          data-dirty={changed('contact')}
          type="tel"
          value={draft.contact}
          onChange={e => onChange({ contact: e.target.value })}
          maxLength={60}
          disabled={disabled}
        />
      </label>
      <div className={s.addField}>
        <span>Joining date</span>
        <input
          className={`${hv.input} ${w.addInput}`}
          data-dirty={changed('start')}
          type="date"
          aria-label="Joining date"
          value={anyTime ? '' : draft.start}
          disabled={anyTime || disabled}
          onChange={e => onChange({ start: e.target.value })}
        />
        <label className={w.anyTime}>
          <input
            type="checkbox"
            checked={anyTime}
            disabled={disabled}
            // Unticked, the day they had — or none to pick from, when they were always Any time ready.
            onChange={e => onChange({ start: e.target.checked ? ANY_TIME : isAnyTime(was.start) ? '' : was.start })}
          />
          {ANY_TIME_LABEL}
        </label>
      </div>
      <label className={s.addField}>
        <span>Submitted by</span>
        <Select
          value={draft.submittedBy}
          onChange={e => onChange({ submittedBy: e.target.value })}
          aria-label="Submitted by — who brought them in"
          disabled={disabled}
          data-dirty={changed('submittedBy')}
        >
          {!listed && was.submittedBy ? <option value={was.submittedBy}>{wasSubmitter ?? 'As submitted'}</option> : null}
          {submitters.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` · ${p.title}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      <div className={s.addField}>
        <span>Department</span>
        <span className={w.editFixed}>Revenue · {subDeptName}</span>
      </div>
    </div>
  )
}
