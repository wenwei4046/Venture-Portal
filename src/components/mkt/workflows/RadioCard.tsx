'use client'

import Tip from '../ui/Tip'
import w from './workflows.module.css'

// One radio card (the prototype's: a ring, a title, and why it is off). Its line (`text`) shows only while the card is
// pointed at or reached by the keyboard (the user, 2026-11-13) — a tooltip; on and off the card keeps one height.

export default function RadioCard({
  on,
  title,
  text,
  why,
  off,
  big,
  onPick,
}: {
  on: boolean
  title: string
  /** What picking it means — in the tooltip. */
  text: string
  why?: string
  /** Not to be picked (greyed, the reason in `why`). */
  off?: boolean
  /** The Who cards' slightly larger size. */
  big?: boolean
  onPick: () => void
}) {
  return (
    <Tip text={text}>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-disabled={off || undefined}
        className={`${w.radio}${big ? ` ${w.radioBig}` : ''}${on ? ` ${w.radioOn}` : ''}${off ? ` ${w.radioOff}` : ''}`}
        onClick={() => !off && onPick()}
      >
        <span className={w.radioDot} />
        <span className={w.radioBody}>
          <span className={w.radioTitle}>{title}</span>
          {why ? <span className={w.radioWhy}>{why}</span> : null}
        </span>
      </button>
    </Tip>
  )
}
