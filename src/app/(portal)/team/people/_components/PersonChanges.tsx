'use client'

import { useRouter } from 'next/navigation'
import type { CardLadder } from '../card-actions'
import Promotion from './Promotion'
import Employment from './Employment'

/**
 * Promote and Deactivate / Reactivate on a person's full page (2026-10-10,
 * the HR revamp): the handoff's window only reads, so the changes a person's
 * record takes — edit, promote, end or restore their employment — live here,
 * behind its Full page. Team · Edit, as before.
 */
export default function PersonChanges({
  personId,
  personName,
  title,
  department,
  ladder,
  active,
}: {
  personId: string
  personName: string
  title: string | null
  department: string | null
  ladder: CardLadder
  active: boolean
}) {
  const router = useRouter()
  const done = () => router.refresh()
  return (
    <div className="max-w-3xl mb-8">
      {active ? (
        <Promotion personId={personId} personName={personName} title={title} department={department} ladder={ladder} onDone={done} />
      ) : null}
      <Employment personId={personId} personName={personName} active={active} onDone={done} />
    </div>
  )
}
