'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { UserRole } from '@/types'
import { setViewAs } from './view-as-actions'
import ViewAsPersonPicker from './ViewAsPersonPicker'

/** The select's value while a person is viewed (2026-10-11). */
const VIEWING = '__viewing'

function ViewSelect({ value, viewingAs, submit, onPerson }: { value: UserRole; viewingAs?: string; submit: () => void; onPerson: () => void }) {
  const { pending } = useFormStatus()
  const current = viewingAs ? VIEWING : value
  return (
    <select
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
      className="min-h-[44px] max-w-full bg-transparent font-sans font-normal text-[13.5px] text-graphite hover:text-accent cursor-pointer rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
    >
      {viewingAs ? <option value={VIEWING}>Viewing as {viewingAs}</option> : null}
      <option value="principal">Principal</option>
      <option value="finance">Finance view</option>
      <option value="hr">HR view</option>
      <option value="revenue_member">Revenue View</option>
      {/* Lead View (2026-10-16): Customer Service's inbox — its own pages, not a mask. */}
      <option value="lead">Lead View</option>
      <option value="person">View as a person…</option>
    </select>
  )
}

/** Visibility is decided by trusted parent data; the action verifies the real account. */
export default function PortalViewSwitcher({ value, viewingAs, className = '' }: {
  value: UserRole
  /** Whose portal is drawn, while a person is viewed (2026-10-11). */
  viewingAs?: string
  className?: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const [picking, setPicking] = useState(false)
  return (
    <>
    <form
      ref={form}
      action={setViewAs}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      title="Switch workspace view while staying signed in as Principal"
    >
      <span aria-hidden className={`w-[5px] h-[5px] shrink-0 rounded-full ${value === 'principal' && !viewingAs ? 'bg-ledger' : 'bg-alert'}`} />
      <ViewSelect value={value} viewingAs={viewingAs} submit={() => form.current?.requestSubmit()} onPerson={() => setPicking(true)} />
    </form>
    <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} />
    </>
  )
}
