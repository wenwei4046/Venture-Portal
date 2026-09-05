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
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not promote them')
      }
    })
  }

  return (
    <div className="mt-6 pt-4 border-t border-hairline flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="font-sans text-[10px] uppercase tracking-[0.14em] text-accent">
          Promotion
        </div>
        <div className="font-serif text-sm text-ink mt-1.5">
          {ladder.level === null ? (
            <span className="italic text-muted">
              {title} is not on the ladder yet — place it under Hierarchy → Levels first.
            </span>
          ) : next === null ? (
            <span className="italic text-muted">
              Top of the {department ?? 'department'} ladder, as {title} ({ladder.level}).
            </span>
          ) : next.titles.length === 1 ? (
            <>
              Next up: <span className="text-ink">{next.titles[0].name}</span>
              <span className="font-mono text-[11px] text-muted ml-2">
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
                className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
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
        {ladder.blocker ? (
          <div className="font-serif italic text-alert text-xs mt-1.5">{ladder.blocker}</div>
        ) : null}
        {error ? <div className="font-serif italic text-danger text-xs mt-1.5">{error}</div> : null}
      </div>
      {next ? (
        <button
          type="button"
          onClick={promote}
          disabled={pending || !target || ladder.blocker !== null}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? 'Promoting…' : 'Promote'}
        </button>
      ) : null}
    </div>
  )
}
