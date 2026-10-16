'use client'

import { useState, useTransition } from 'react'
import { promoteStaff } from '../promote-actions'
import type { CardLadder } from '../card-actions'
import { btn } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import PersonWell from '../../_components/PersonWell'
import w from '../../_components/person-well.module.css'

/**
 * The Promote control on a person's card.
 *
 * "Up one level" as a button (user, 2026-09-03): the next rung up in the
 * person's own department, offered as a choice when that rung holds more than
 * one title. It says why it is off when it is — the title is not on the
 * ladder, they are at the top, or the step would put them above their line
 * manager, which the org chart refuses.
 */
export default function Promotion({
  personId,
  personName,
  title,
  department,
  ladder,
  onDone,
}: {
  personId: string
  personName: string
  title: string | null
  department: string | null
  ladder: CardLadder
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<string>(ladder.next?.titles[0]?.id ?? '')

  if (!title) return null

  const next = ladder.next
  const target = next?.titles.find(t => t.id === choice) ?? next?.titles[0] ?? null

  function promote() {
    if (!target) return
    if (!window.confirm(`Promote ${personName} to ${target.name}?`)) return
    setError(null)
    startTransition(async () => {
      try {
        await promoteStaff(personId, target.id)
        // The rank follows the title in the database (one line, 2026-09-10),
        // so there is nothing left to read once the promotion has landed.
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not promote them')
      }
    })
  }


  // A well of the person's page since 2026-10-16 (the 360): the step's label
  // in spaced capitals over the title it leads to, Promote at the end.
  return (
    <PersonWell title="Promotion" icon="out">
      <div className={w.line}>
        <div className={w.lineText}>
          {ladder.level === null ? (
            <>
              <span className={w.label}>Ladder</span>
              <span className={w.value}>{title} is not on the ladder yet — place it under Hierarchy → Levels first.</span>
            </>
          ) : next === null ? (
            <>
              <span className={w.label}>Ladder</span>
              <span className={w.value}>
                Top of the {department ?? 'department'} ladder, as {title} ({ladder.level}).
              </span>
            </>
          ) : next.titles.length === 1 ? (
            <>
              <span className={w.label}>Next up</span>
              <span className={w.value}>
                {next.titles[0].name}
                <span className={w.mono}>
                  {ladder.level} → {next.level}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className={w.label}>Next up ({next.level})</span>
              <Select
                value={target?.id ?? ''}
                onChange={e => setChoice(e.target.value)}
                disabled={pending}
                aria-label="Title to promote to"
              >
                {next.titles.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </>
          )}
          {/* Why the button is off, in the amber of something still to settle. */}
          {ladder.blocker ? <div className="sheet-warning mt-1 mb-0">{ladder.blocker}</div> : null}
          {error ? <div className="sheet-danger mt-1 mb-0">{error}</div> : null}
        </div>
        {next ? (
          <button
            type="button"
            onClick={promote}
            disabled={pending || !target || ladder.blocker !== null}
            className={btn('primary')}
          >
            {pending ? 'Promoting…' : 'Promote'}
          </button>
        ) : null}
      </div>
    </PersonWell>
  )
}
