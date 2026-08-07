'use client'

import { useState, useTransition } from 'react'
import { setFundSourceNotes } from '../../actions'

// Finance self-service notes (user 2026-08-06). Write 「借给: 2990」 here and
// the Company Statement shows it as this position's 借给 badge — mirror of
// the loans' SC (资金来源) tag. Terms amendment stays principal-only.
export default function NotesEditor({
  sourceId,
  current,
}: {
  sourceId: string
  current: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(current ?? '')

  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
        Notes
      </div>
      <div className="flex items-start gap-2">
        <textarea
          rows={2}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          placeholder="e.g. HC deposit · lent to: 2990"
          className="w-full max-w-xl px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              setSaved(false)
              const r = await setFundSourceNotes(sourceId, value)
              if (r?.error) setError(r.error)
              else setSaved(true)
            })
          }
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? (
          <span className="text-xs font-sans text-ledger mt-2">Saved ✓</span>
        ) : null}
      </div>
      <p className="font-serif italic text-muted text-xs mt-1.5">
        Write &ldquo;lent to: 2990&rdquo; (or just a label) and the Company Statement shows it as
        this position&apos;s LENT TO tag — the mirror of a loan&apos;s SC.
      </p>
      {error ? <p className="text-xs font-sans text-danger mt-1.5">{error}</p> : null}
    </div>
  )
}
