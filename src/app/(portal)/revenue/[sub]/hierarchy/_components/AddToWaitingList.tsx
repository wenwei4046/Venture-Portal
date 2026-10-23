'use client'

import { useRef, useState, useTransition } from 'react'
import { btn, hv } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { ownQuestions } from '@/lib/member/waiting-answers'
import { ANY_TIME, ANY_TIME_LABEL, isAnyTime } from '@/lib/member/waiting-start'
import {
  EMPTY_ADD,
  SIGNED_FORM_ACCEPT,
  signedFormRefusal,
  waitingAddRefusal,
  type SubmitterGroup,
  type WaitingAddDraft,
} from '@/lib/commission/waiting-add'
import type { WaitingField, WaitingForm } from '@/lib/commission/waiting-form'
import { stageInto } from '@/lib/storage/stage'
import { addToWaitingList } from '../../../waiting-actions'
import s from './sales-groups.module.css'
import w from './waiting.module.css'

/**
 * Sales Groups › Waiting list's "+" (2026-10-11, the user: "我点击「加」了过后，我可以直接加人进去这个
 * waiting list 里面"): the accent square left of Upload form opens a window — the new member's name,
 * phone and joining date (a day, or *Any time ready* — 2026-10-14), who brought them in (the Revenue
 * team, required), HR's own questions (optional) and the signed application form (as Form settings
 * asks). Added, they join the END of the list, as if accepted today.
 */
export default function AddToWaitingList({
  subDepartmentId,
  subDeptName,
  submitters,
  form,
}: {
  subDepartmentId: string
  subDeptName: string
  /** The Revenue team, this sub-department first. */
  submitters: SubmitterGroup[]
  /** The waiting list's form as saved: HR's own questions, and whether the signed form is required. */
  form: WaitingForm | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={w.add}
        onClick={() => setOpen(true)}
        aria-label={`Add somebody to ${subDeptName}'s waiting list`}
        title="Add somebody to the waiting list"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open ? (
        <AddWindow
          subDepartmentId={subDepartmentId}
          subDeptName={subDeptName}
          submitters={submitters}
          form={form}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function AddWindow({
  subDepartmentId,
  subDeptName,
  submitters,
  form,
  onClose,
}: {
  subDepartmentId: string
  subDeptName: string
  submitters: SubmitterGroup[]
  form: WaitingForm | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState<WaitingAddDraft>(EMPTY_ADD)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const questions = ownQuestions(form)
  const formRequired = form?.requireUpload === true
  // Ready whenever HR calls them (2026-10-14): no day to pick.
  const anyTime = isAnyTime(draft.start)

  const set = (patch: Partial<WaitingAddDraft>) => {
    setDraft(d => ({ ...d, ...patch }))
    setError('')
  }
  const answer = (id: string, value: string) => set({ answers: { ...draft.answers, [id]: value } })

  function pick(next: File | undefined) {
    if (!next) return
    const tooBig = signedFormRefusal(next)
    if (tooBig) {
      setError(tooBig)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setFile(next)
    setError('')
  }

  function add() {
    if (pending) return
    const input = { ...draft, subDepartmentId }
    const refused = waitingAddRefusal(input, form, file !== null)
    if (refused) {
      setError(refused)
      return
    }
    const data = new FormData()
    data.set('input', JSON.stringify(input))
    start(async () => {
      // The signed form is sent ahead of the action (2026-10-23, lib/storage/stage.ts) — up to 100 MB.
      const done = await stageInto(data, 'signedForm', file).then(
        () => addToWaitingList(data),
        (err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : 'The signed form could not be sent.' }),
      )
      if (!done.ok) {
        setError(done.reason)
        return
      }
      onClose()
      flash(`${draft.name.trim()} is on ${subDeptName}'s waiting list${done.requestNo ? ` · ${done.requestNo}` : ''}`)
    })
  }

  return (
    <Window open onClose={onClose} width={460} label={`Add somebody to ${subDeptName}'s waiting list`}>
      <div className={s.addHead}>
        <div className={s.addTitle}>Add to the waiting list</div>
        <div className={s.addSub}>Straight onto {subDeptName}&apos;s list, at the end — as if accepted today.</div>
      </div>
      <div className={`${s.addBody} ${w.addBody}`}>
        <label className={s.addField}>
          <span>New member name</span>
          <input className={`${hv.input} ${w.addInput}`} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="Full name as per IC" maxLength={160} />
        </label>
        <div className={w.addPair}>
          <label className={s.addField}>
            <span>Phone number</span>
            <input
              className={`${hv.input} ${w.addInput}`}
              type="tel"
              value={draft.contact}
              onChange={e => set({ contact: e.target.value })}
              placeholder="e.g. 012-345 6789"
              maxLength={60}
            />
          </label>
          <div className={s.addField}>
            <span>Joining date</span>
            <input
              className={`${hv.input} ${w.addInput}`}
              type="date"
              aria-label="Joining date"
              value={anyTime ? '' : draft.start}
              disabled={anyTime}
              onChange={e => set({ start: e.target.value })}
            />
            <label className={w.anyTime}>
              <input type="checkbox" checked={anyTime} onChange={e => set({ start: e.target.checked ? ANY_TIME : '' })} />
              {ANY_TIME_LABEL}
            </label>
          </div>
        </div>
        <label className={s.addField}>
          <span>Submitted by</span>
          <Select value={draft.submittedBy} onChange={e => set({ submittedBy: e.target.value })} aria-label="Submitted by — who brought them in">
            <option value="">— who brought them in —</option>
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

        {questions.length ? <div className={w.addSec}>Your questions · optional</div> : null}
        {questions.map(q => (
          <label key={q.id} className={s.addField}>
            <span>{q.label}</span>
            <Question field={q} value={draft.answers[q.id] ?? ''} onChange={v => answer(q.id, v)} />
          </label>
        ))}

        <div className={s.addField}>
          <span>
            Signed application form{' '}
            <span className={w.addHint}>{formRequired ? '· required by Form settings' : '· optional'}</span>
          </span>
          <div className={w.addFile}>
            <label className={w.upload} data-uploaded={file ? 'true' : undefined}>
              {file ? file.name : 'Attach the signed form'}
              <input ref={fileRef} type="file" accept={SIGNED_FORM_ACCEPT} onChange={e => pick(e.target.files?.[0])} />
            </label>
            {file ? (
              <button
                type="button"
                className={w.addFileX}
                onClick={() => {
                  setFile(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}
                aria-label="Remove the attached form"
              >
                ×
              </button>
            ) : null}
          </div>
          <span className={w.addHint}>PDF, Word, PNG or JPG, 100 MB or smaller.</span>
        </div>

        {error ? (
          <p className={s.addError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={s.addFoot}>
        <button type="button" className={btn('outline')} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btn('primary')} onClick={add} disabled={pending}>
          {pending ? 'Adding…' : 'Add to the list'}
        </button>
      </div>
    </Window>
  )
}

/** One of HR's own questions, drawn as its kind asks — a Yes / No is "Yes" or "No", as the Revenue app sends it. */
function Question({ field, value, onChange }: { field: WaitingField; value: string; onChange: (v: string) => void }) {
  if (field.type === 'dropdown' || field.type === 'yesno') {
    const options = field.type === 'yesno' ? ['Yes', 'No'] : field.options ?? []
    return (
      <Select value={value} onChange={e => onChange(e.target.value)} aria-label={field.label}>
        <option value="">—</option>
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <input
      className={`${hv.input} ${w.addInput}`}
      type={field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder}
      maxLength={500}
    />
  )
}
