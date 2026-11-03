'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Select } from '@/components/hrv/select'
import { SWITCH_VIEWS } from '@/lib/view-switch'
import { setViewAs } from './view-as-actions'
import ViewAsPersonPicker from './ViewAsPersonPicker'
import s from './ViewSwitch.module.css'

/** The select's value while a person is viewed (2026-10-11). */
const VIEWING = '__viewing'

function ViewSelect({ value, viewingAs, className, submit, onPerson }: {
  value: string
  viewingAs?: string
  className: string
  submit: () => void
  onPerson: () => void
}) {
  const { pending } = useFormStatus()
  const current = viewingAs ? VIEWING : value
  // The prototype draws "HR view" as words, so the field stays words (plain);
  // only the menu is the soft dropdown's (round 2's Part 1).
  return (
    <Select
      plain
      key={current}
      name="role"
      defaultValue={current}
      onChange={e => {
        // "View as a person…" opens the picker; the select keeps what is drawn.
        if (e.target.value === 'person') {
          e.target.value = current
          onPerson()
        } else if (e.target.value !== VIEWING) submit()
      }}
      disabled={pending}
      aria-label="View portal as role"
      className={className}
    >
      {viewingAs ? <option value={VIEWING}>Viewing as {viewingAs}</option> : null}
      {SWITCH_VIEWS.map(v => (
        <option key={v.value} value={v.value}>{v.label}</option>
      ))}
    </Select>
  )
}

/**
 * The portal's view switch — the Principal's, on every bar that has one (2026-10-27: HR's, Finance's and the
 * Principal's, Lead View's, Marketing's, the phone's): the view's words, the soft dropdown's menu (the picked row peach
 * with a ✓) and every row of lib/view-switch.ts. Visibility is decided by trusted parent data; the action verifies the
 * real account. The classes draw it elsewhere as that bar draws it (the phone's 44px field).
 */
export default function ViewSwitch({ value, viewingAs, className, dotClassName, selectClassName }: {
  value: string
  /** Whose portal is drawn, while a person is viewed (2026-10-11). */
  viewingAs?: string
  className?: string
  dotClassName?: string
  selectClassName?: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const [picking, setPicking] = useState(false)
  return (
    <>
      <form ref={form} action={setViewAs} className={className ?? s.form} title="Switch workspace view while staying signed in as Principal">
        <span className={dotClassName ?? s.dot} aria-hidden="true" />
        <ViewSelect
          value={value}
          viewingAs={viewingAs}
          className={selectClassName ?? s.select}
          submit={() => form.current?.requestSubmit()}
          onPerson={() => setPicking(true)}
        />
      </form>
      <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} />
    </>
  )
}
