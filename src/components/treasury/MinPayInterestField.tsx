'use client'

import { useState, useTransition } from 'react'
import { DealMinPayFrom } from '@/components/finv/DealTermsParts'
import { NO_MIN_PAY_FROM, minPayFromMissing, minPayFromWords, minPayLaterMonths, savedMinPayFrom, type MinPayFrom } from '@/lib/min-pay'

// A deal's Minimum pay interest on its page (fund in and fund out alike): 最低还息单 (user 2026-09-04) — "本金可以慢慢还，
// 但每月利息一定要付". Finance self-service, editable anytime (旧单也能补设). Since 2026-10-30 (the user's sample A) ticking it
// asks from which month — the first instalment, or a later month picked under it — and Save keeps it; unticking turns
// it off at once, every month, as the switch always did.
export default function MinPayInterestField({
  current,
  from,
  firstDueYM,
  today,
  idPrefix,
  onSave,
}: {
  current: boolean
  /** The month it is checked from (`YYYY-MM-DD`); none — the first instalment. */
  from: string | null
  /** The deal's first instalment, `YYYY-MM`. */
  firstDueYM: string | null
  today: string
  idPrefix: string
  /** The page's Server Action: on from a later month's `YYYY-MM` (null — the first instalment), or off. */
  onSave: (on: boolean, from: string | null) => Promise<{ error: string } | undefined>
}) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<{ on: boolean; from: string | null }>({ on: current, from })
  const [on, setOn] = useState(current)
  const [choice, setChoice] = useState<MinPayFrom>(current ? savedMinPayFrom(from) : NO_MIN_PAY_FROM)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const laterMonths = firstDueYM ? minPayLaterMonths(firstDueYM, today.slice(0, 7)) : []
  const savedChoice = saved.on ? savedMinPayFrom(saved.from) : NO_MIN_PAY_FROM
  const changed = on && (!saved.on || choice.choice !== savedChoice.choice || choice.month !== savedChoice.month)
  const missing = on ? minPayFromMissing(choice, laterMonths) : null

  const write = (next: boolean, pick: MinPayFrom) => {
    setError(null)
    setJustSaved(false)
    const month = next && pick.choice === 'later' ? pick.month : null
    startTransition(async () => {
      const r = await onSave(next, month)
      if (r?.error) {
        setError(r.error)
        // Off refused: it stays on, as saved.
        if (!next) setOn(true)
      } else {
        setSaved({ on: next, from: month ? `${month}-01` : null })
        setJustSaved(true)
      }
    })
  }

  const toggle = (next: boolean) => {
    setOn(next)
    setError(null)
    setJustSaved(false)
    if (next) setChoice(savedChoice)
    else if (saved.on) write(false, NO_MIN_PAY_FROM)
  }

  // The choice sits beside the field, not in it: the page form's field rule draws every input in a field as a text box.
  return (
    <div className="span-2">
      <div className="fin-field">
        <span className="fin-label">Minimum pay interest</span>
        <label className="fin-toggle">
          <input type="checkbox" checked={on} disabled={isPending} onChange={(e) => toggle(e.target.checked)} />
          <span>Interest must be paid in full every month (principal can be repaid gradually)</span>
          {isPending ? <span className="fin-saved text-muted">Saving…</span> : null}
          {!on && justSaved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
        </label>
      </div>
      {on ? (
        <>
          <DealMinPayFrom
            value={choice}
            onChange={(v) => {
              setChoice(v)
              setJustSaved(false)
            }}
            firstDueYM={firstDueYM}
            laterMonths={laterMonths}
            idPrefix={idPrefix}
            label="From which month"
          />
          <div className="fin-field-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn-sec" disabled={isPending || !changed || !!missing} onClick={() => write(true, choice)}>
              Save
            </button>
            {changed ? (
              missing ? <span className="fin-hint">Pick {missing}, then Save.</span> : null
            ) : isPending ? null : (
              <span className="fin-saved">
                {justSaved ? 'Saved ✓ — ' : 'On — '}
                {minPayFromWords(saved.from, firstDueYM)}
              </span>
            )}
          </div>
        </>
      ) : null}
      {error ? <p className="fin-error">{error}</p> : null}
    </div>
  )
}
