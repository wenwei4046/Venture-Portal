'use client'

import { useState, useTransition } from 'react'
import { promoteStaff } from '../promote-actions'
import type { CardLadder } from '../card-actions'

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


  return (
    <div className="mt-6 pt-4 border-t border-hairline flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em]">Promotion</div>
        <div className="text-sm mt-1.5">
          {ladder.level === null ? (
            <>{title} is not on the ladder yet — place it under Hierarchy → Levels first.</>
          ) : next === null ? (
            <>
              Top of the {department ?? 'department'} ladder, as {title} ({ladder.level}).
            </>
          ) : next.titles.length === 1 ? (
            <>
              Next up: <span className="font-bold">{next.titles[0].name}</span>
              <span className="font-mono text-[11px] ml-2">
                {ladder.level} → {next.level}
              </span>
            </>
          ) : (
            <label className="flex flex-wrap items-center gap-2">
              <span>Next up ({next.level}):</span>
              <select
                value={target?.id ?? ''}
                onChange={e => setChoice(e.target.value)}
                disabled={pending}
                aria-label="Title to promote to"
                className="px-2 py-1 bg-surface border border-hairline rounded-control text-sm text-ink"
              >
                {next.titles.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {/* Why the button is off, in the amber of something still to settle. */}
        {ladder.blocker ? <div className="sheet-warning mt-2 mb-0">{ladder.blocker}</div> : null}
        {error ? <div className="sheet-danger mt-2 mb-0">{error}</div> : null}
      </div>
      {next ? (
        <button
          type="button"
          onClick={promote}
          disabled={pending || !target || ladder.blocker !== null}
          className="bg-accent hover:bg-accent-hover text-ink text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? 'Promoting…' : 'Promote'}
        </button>
      ) : null}
    </div>
  )
}
