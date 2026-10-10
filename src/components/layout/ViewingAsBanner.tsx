'use client'

import { useFormStatus } from 'react-dom'
import { stopViewingAsPerson } from './view-as-actions'
import s from './view-as-person.module.css'

function Stop() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={s.stop} disabled={pending}>
      {pending ? 'Stopping…' : 'Stop viewing'}
    </button>
  )
}

/**
 * The strip across the top while the portal is viewed as somebody (2026-10-11):
 * whose portal this is, that nothing is saved, and the way back.
 */
export default function ViewingAsBanner({ name }: { name: string }) {
  return (
    <div role="status" className="print:hidden">
      <form action={stopViewingAsPerson} className={s.strip}>
        <span>
          Viewing as <b>{name}</b> — their pages, menus and buttons. Read-only: nothing you press is saved.
        </span>
        <Stop />
      </form>
    </div>
  )
}
