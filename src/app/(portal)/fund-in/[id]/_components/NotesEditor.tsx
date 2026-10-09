'use client'

import { useState, useTransition } from 'react'
import { setFundSourceNotes } from '../../actions'

// Finance self-service notes (user 2026-08-06). Write 「借给: 2990」 here and
// the Company Statement shows it as this position's 借给 badge — mirror of
// the loans' SC (资金来源) tag. Terms amendment stays principal-only.
// 2026-10-09: the page's Notes panel (the handoff).
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
    <div className="fin-field span-3">
      <textarea
        aria-label="Notes"
        rows={2}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        placeholder="e.g. HC deposit · lent to: 2990"
      />
      <p className="fin-hint">
        Write &ldquo;lent to: 2990&rdquo; here and the Company Statement shows it as this position&apos;s lent-to badge — the
        mirror of a loan&apos;s SC.
      </p>
      <div className="fin-field-row">
        <button
          type="button"
          className="btn-sec"
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
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
      </div>
      {error ? <p className="fin-error">{error}</p> : null}
    </div>
  )
}
