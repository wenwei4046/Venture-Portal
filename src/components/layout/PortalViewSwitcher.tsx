'use client'

import { useRef } from 'react'
import { useFormStatus } from 'react-dom'
import type { UserRole } from '@/types'
import { setViewAs } from './view-as-actions'

function ViewSelect({ value, submit }: { value: UserRole; submit: () => void }) {
  const { pending } = useFormStatus()
  return (
    <select
      key={value}
      name="role"
      defaultValue={value}
      onChange={submit}
      disabled={pending}
      aria-label="View portal as role"
      className="min-h-[44px] max-w-full bg-transparent font-sans font-normal text-[13.5px] text-graphite hover:text-accent cursor-pointer rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
    >
      <option value="principal">Principal</option>
      <option value="finance">Finance view</option>
      <option value="hr">HR view</option>
      <option value="revenue_member">Revenue View</option>
    </select>
  )
}

/** Visibility is decided by trusted parent data; the action verifies the real account. */
export default function PortalViewSwitcher({ value, className = '' }: {
  value: UserRole
  className?: string
}) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form
      ref={form}
      action={setViewAs}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      title="Switch workspace view while staying signed in as Principal"
    >
      <span aria-hidden className={`w-[5px] h-[5px] shrink-0 rounded-full ${value === 'principal' ? 'bg-ledger' : 'bg-alert'}`} />
      <ViewSelect value={value} submit={() => form.current?.requestSubmit()} />
    </form>
  )
}
