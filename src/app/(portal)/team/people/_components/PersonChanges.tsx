'use client'

import { useRouter } from 'next/navigation'
import type { CardLadder } from '../card-actions'
import Promotion from './Promotion'
import Employment, { type TermFacts } from './Employment'
import w from '../../_components/person-well.module.css'

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
  probation = null,
  contract = null,
  today,
}: {
  personId: string
  personName: string
  title: string | null
  department: string | null
  ladder: CardLadder
  active: boolean
  /** On probation (2026-10-23): its end and its reminder — Employment offers the next step. */
  probation?: TermFacts | null
  /** On a contract (2026-10-24): its end and its reminder. */
  contract?: TermFacts | null
  /** The office's today (YYYY-MM-DD). */
  today: string
}) {
  const router = useRouter()
  const done = () => router.refresh()
  // Two wells side by side where they fit (2026-10-16, the 360).
  return (
    <div className={w.pair}>
      {active ? (
        <Promotion personId={personId} personName={personName} title={title} department={department} ladder={ladder} onDone={done} />
      ) : null}
      <Employment personId={personId} personName={personName} active={active} probation={probation} contract={contract} today={today} onDone={done} />
    </div>
  )
}
