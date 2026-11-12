'use client'

import w from './workflows.module.css'

// One radio card (the prototype's: a ring, a title, its line, and why it is off).

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
  text: string
  why?: string
  /** Not to be picked (greyed, the reason in `why`). */
  off?: boolean
  /** The Who cards' slightly larger size. */
  big?: boolean
  onPick: () => void
}) {
  return (
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
        <span className={w.radioText}>{text}</span>
        {why ? <span className={w.radioWhy}>{why}</span> : null}
      </span>
    </button>
  )
}
